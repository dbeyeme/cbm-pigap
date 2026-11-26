"""Mise en forme des données de Global Fishing Watch pour la ZEE du Gabon (ADR-011).

Trois rapports de l'éditeur, chacun demandé au plus une fois par période grâce
au cache du client :

- heures de pêche apparente par mois et par pavillon ;
- heures de pêche apparente par navire, d'où la liste des navires observés ;
- détections radar par mois et par pavillon.

S'y ajoute la fiche d'identité d'un navire (registres publics d'un côté,
identité émise de l'autre) et la liste des évènements de pêche apparente
(points posés sur la carte). Aucune de ces données ne déclenche d'alerte : elles
éclairent l'agent, qui qualifie.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.core.config import settings
from app.core.errors import bad_request
from app.modules.gfw import client
from app.modules.gfw.parametres import ParametresGfw, entete_parametres, parametres_gfw
from app.modules.gfw.schemas import (
    AttributionGfw,
    AutorisationNavire,
    DetectionsMois,
    DetectionsPavillon,
    DetectionsRadarRead,
    EmissionNavire,
    EnteteGfw,
    EtatGfw,
    EvenementPeche,
    EvenementsPecheRead,
    FraicheurGfw,
    FraicheurIdentite,
    HeuresMois,
    HeuresPavillon,
    IdentiteNavireRead,
    NavireObserve,
    NaviresObservesRead,
    PecheApparenteRead,
    PeriodeGfw,
    ProprietaireNavire,
    RegistreNavire,
    ZoneGfw,
)

_RAPPORT = "/v3/4wings/report"
_NAVIRES = "/v3/vessels"
_EVENEMENTS = "/v3/events"
# Un écran de carte reste lisible ; le total renvoyé par l'éditeur est conservé.
_EVENEMENTS_MAX = 400

AVERTISSEMENT_PECHE = (
    "Pêche apparente : estimation de l'éditeur à partir des émissions AIS des navires. "
    "C'est un indice pour orienter un contrôle, pas la preuve d'une infraction. "
    "Les embarcations sans AIS, dont les pirogues, n'y figurent pas."
)
AVERTISSEMENT_RADAR = (
    "Détections radar : objets repérés par satellite lors de ses passages, publiés avec "
    "plusieurs jours de retard. C'est un indice, pas un suivi continu ; les petites "
    "embarcations sont peu détectées."
)
AVERTISSEMENT_IDENTITE = (
    "Identité réunie par l'éditeur à partir de registres publics et des émissions AIS. "
    "Une autorisation publique ne prouve pas la conformité du navire."
)
AVERTISSEMENT_EVENEMENTS = (
    "Chaque point est un épisode de pêche apparente estimé par l'éditeur à partir "
    "des émissions AIS. C'est un indice pour orienter un contrôle, pas la preuve "
    "d'une infraction. Les embarcations sans AIS, dont les pirogues, n'y figurent pas."
)


def _maintenant() -> datetime:
    return datetime.now(UTC)


def _periode(
    debut: date | None, fin: date | None, p: ParametresGfw, retard_heures: int
) -> tuple[date, date]:
    """Période demandée ; sans date de fin, elle s'arrête au dernier jour publié."""
    publie_jusqu_au = (_maintenant() - timedelta(hours=int(retard_heures))).date()
    fin_retenue = fin or publie_jusqu_au
    try:
        debut_retenu = debut or fin_retenue - timedelta(days=int(p.periode_defaut_jours))
    except OverflowError as exc:
        raise bad_request(
            "Date hors des bornes acceptées : indiquez une date plus récente.",
            "PERIODE_INVALIDE",
        ) from exc
    if debut_retenu >= fin_retenue:
        raise bad_request("La date de début doit précéder la date de fin.", "PERIODE_INVALIDE")
    if (fin_retenue - debut_retenu).days > int(p.periode_max_jours):
        raise bad_request(
            f"La période demandée dépasse {int(p.periode_max_jours)} jours : "
            "réduisez l'intervalle entre les deux dates.",
            "PERIODE_TROP_LONGUE",
        )
    return debut_retenu, fin_retenue


def _params_rapport(
    p: ParametresGfw, jeu: str, debut: date, fin: date, *, temporel: str, groupe: str
) -> list[tuple[str, str]]:
    return [
        ("region-id", str(p.zone.identifiant)),
        ("region-dataset", p.zone.jeu),
        ("datasets[0]", jeu),
        ("date-range", f"{debut.isoformat()},{fin.isoformat()}"),
        ("temporal-resolution", temporel),
        ("group-by", groupe),
        ("spatial-resolution", "LOW"),
        ("spatial-aggregation", "true"),
        ("format", "JSON"),
    ]


def _lignes(donnees: Any) -> list[dict[str, Any]]:
    """`entries` : liste d'objets dont chaque valeur est une liste de lignes."""
    lignes: list[dict[str, Any]] = []
    if not isinstance(donnees, dict):
        return lignes
    for entree in donnees.get("entries") or []:
        if not isinstance(entree, dict):
            continue
        for valeur in entree.values():
            if isinstance(valeur, list):
                lignes.extend(ligne for ligne in valeur if isinstance(ligne, dict))
    return lignes


def _nombre(valeur: Any) -> float:
    try:
        return float(valeur)
    except (TypeError, ValueError):
        return 0.0


def _texte(valeur: Any) -> str | None:
    if valeur is None:
        return None
    texte = str(valeur).strip()
    return texte or None


def _position(valeur: Any) -> tuple[float, float] | None:
    """Longitude, latitude d'un évènement ; aucune si le lieu est absent ou illisible."""
    if not isinstance(valeur, dict):
        return None
    lon = valeur.get("lon", valeur.get("longitude"))
    lat = valeur.get("lat", valeur.get("latitude"))
    if lon is None or lat is None:
        coords = valeur.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            lon, lat = coords[0], coords[1]
    try:
        lon_f = float(lon)
        lat_f = float(lat)
    except (TypeError, ValueError):
        return None
    if not (-180 <= lon_f <= 180 and -90 <= lat_f <= 90):
        return None
    return lon_f, lat_f


def _instant(valeur: Any) -> datetime | None:
    texte = _texte(valeur)
    if texte is None:
        return None
    try:
        lu = datetime.fromisoformat(texte.replace("Z", "+00:00"))
    except ValueError:
        return None
    return lu if lu.tzinfo else lu.replace(tzinfo=UTC)


def _mois(valeur: Any) -> str:
    texte = _texte(valeur) or ""
    return texte[:7] if len(texte) >= 7 else (texte or "inconnu")


def _zone(p: ParametresGfw) -> ZoneGfw:
    return ZoneGfw(identifiant=p.zone.identifiant, jeu=p.zone.jeu, nom=p.zone.nom)


def _attribution(p: ParametresGfw) -> AttributionGfw:
    return AttributionGfw(mention=p.attribution.mention, lien=p.attribution.lien)


def _entete(
    p: ParametresGfw,
    reponse: client.ReponseGfw,
    *,
    debut: date,
    fin: date,
    retard_heures: int,
    avertissement: str,
) -> EnteteGfw:
    donnees = reponse.donnees if isinstance(reponse.donnees, dict) else {}
    # Fraîcheur à la date où l'éditeur a répondu, pas à celle de la demande : une
    # réponse resservie depuis le cache ne contient pas les jours publiés depuis.
    publie_jusqu_au = (reponse.recupere_a - timedelta(hours=int(retard_heures))).date()
    return EnteteGfw(
        periode=PeriodeGfw(debut=debut, fin=fin),
        fraicheur=FraicheurGfw(
            donnees_jusqu_au=publie_jusqu_au,
            retard_publication_heures=int(retard_heures),
            recupere_a=reponse.recupere_a,
            en_cache=reponse.en_cache,
            perime=reponse.perime,
            periode_incomplete=fin > publie_jusqu_au,
            resultat_partiel=donnees.get("nextOffset") not in (None, 0, ""),
        ),
        attribution=_attribution(p),
        zone=_zone(p),
        avertissement=avertissement,
    )


def etat() -> EtatGfw:
    """État de l'essai, sans appel à l'éditeur : l'écran sait s'il doit se montrer."""
    p = parametres_gfw()
    entete = entete_parametres()
    return EtatGfw(
        active=bool(settings.gfw_enabled),
        jeton_configure=client.jeton_configure(),
        zone=_zone(p),
        attribution=_attribution(p),
        retard_publication_heures=p.retard_publication_heures.model_dump(),
        cache_heures=float(p.cache_heures),
        statut=entete["statut"],
        version=entete["version"],
    )


async def peche_apparente(debut: date | None, fin: date | None) -> PecheApparenteRead:
    p = parametres_gfw()
    client.exiger_actif()
    retard = p.retard_publication_heures.peche_apparente
    debut_r, fin_r = _periode(debut, fin, p, retard)
    reponse = await client.appeler(
        _RAPPORT,
        _params_rapport(
            p, p.jeux.peche_apparente, debut_r, fin_r, temporel="MONTHLY", groupe="FLAG"
        ),
        rapport=True,
    )
    par_mois: dict[str, float] = {}
    par_pavillon: dict[str | None, float] = {}
    for ligne in _lignes(reponse.donnees):
        heures = _nombre(ligne.get("hours"))
        mois = _mois(ligne.get("date"))
        pavillon = _texte(ligne.get("flag"))
        par_mois[mois] = par_mois.get(mois, 0.0) + heures
        par_pavillon[pavillon] = par_pavillon.get(pavillon, 0.0) + heures
    entete = _entete(
        p,
        reponse,
        debut=debut_r,
        fin=fin_r,
        retard_heures=retard,
        avertissement=AVERTISSEMENT_PECHE,
    )
    return PecheApparenteRead(
        **entete.model_dump(),
        total_heures=round(sum(par_mois.values()), 2),
        par_mois=[HeuresMois(mois=m, heures=round(h, 2)) for m, h in sorted(par_mois.items())],
        par_pavillon=[
            HeuresPavillon(pavillon=pav, heures=round(h, 2))
            for pav, h in sorted(par_pavillon.items(), key=lambda kv: (-kv[1], kv[0] or ""))
        ],
    )


async def navires_observes(debut: date | None, fin: date | None) -> NaviresObservesRead:
    p = parametres_gfw()
    client.exiger_actif()
    retard = p.retard_publication_heures.peche_apparente
    debut_r, fin_r = _periode(debut, fin, p, retard)
    reponse = await client.appeler(
        _RAPPORT,
        _params_rapport(
            p, p.jeux.peche_apparente, debut_r, fin_r, temporel="ENTIRE", groupe="VESSEL_ID"
        ),
        rapport=True,
    )
    # Une ligne par navire ; si l'éditeur en renvoie plusieurs, leurs heures s'additionnent
    par_navire: dict[str, NavireObserve] = {}
    for rang, ligne in enumerate(_lignes(reponse.donnees)):
        vessel_id = _texte(ligne.get("vesselId") or ligne.get("vessel_id"))
        cle = vessel_id or f"sans-identifiant-{rang}"
        heures = _nombre(ligne.get("hours"))
        connu = par_navire.get(cle)
        if connu is not None:
            connu.heures = round(connu.heures + heures, 2)
            continue
        par_navire[cle] = NavireObserve(
            vessel_id=vessel_id,
            nom=_texte(ligne.get("shipName")),
            pavillon=_texte(ligne.get("flag")),
            mmsi=_texte(ligne.get("mmsi")),
            numero_omi=_texte(ligne.get("imo")),
            indicatif=_texte(ligne.get("callsign")),
            engin=_texte(ligne.get("geartype")),
            heures=round(heures, 2),
            premiere_entree=_instant(ligne.get("entryTimestamp")),
            derniere_sortie=_instant(ligne.get("exitTimestamp")),
        )
    navires = sorted(par_navire.values(), key=lambda n: (-n.heures, n.nom or ""))
    entete = _entete(
        p,
        reponse,
        debut=debut_r,
        fin=fin_r,
        retard_heures=retard,
        avertissement=AVERTISSEMENT_PECHE,
    )
    return NaviresObservesRead(
        **entete.model_dump(),
        total_heures=round(sum(n.heures for n in navires), 2),
        nb_navires=len(navires),
        navires=navires,
    )


async def detections_radar(debut: date | None, fin: date | None) -> DetectionsRadarRead:
    p = parametres_gfw()
    client.exiger_actif()
    retard = p.retard_publication_heures.detections_radar
    debut_r, fin_r = _periode(debut, fin, p, retard)
    reponse = await client.appeler(
        _RAPPORT,
        _params_rapport(
            p, p.jeux.detections_radar, debut_r, fin_r, temporel="MONTHLY", groupe="FLAG"
        ),
        rapport=True,
    )
    par_mois: dict[str, int] = {}
    par_pavillon: dict[str | None, int] = {}
    for ligne in _lignes(reponse.donnees):
        nb = int(round(_nombre(ligne.get("detections"))))
        mois = _mois(ligne.get("date"))
        pavillon = _texte(ligne.get("flag"))
        par_mois[mois] = par_mois.get(mois, 0) + nb
        par_pavillon[pavillon] = par_pavillon.get(pavillon, 0) + nb
    entete = _entete(
        p,
        reponse,
        debut=debut_r,
        fin=fin_r,
        retard_heures=retard,
        avertissement=AVERTISSEMENT_RADAR,
    )
    return DetectionsRadarRead(
        **entete.model_dump(),
        total_detections=sum(par_mois.values()),
        par_mois=[DetectionsMois(mois=m, detections=n) for m, n in sorted(par_mois.items())],
        par_pavillon=[
            DetectionsPavillon(pavillon=pav, detections=n)
            for pav, n in sorted(par_pavillon.items(), key=lambda kv: (-kv[1], kv[0] or ""))
        ],
    )


def _objets(valeur: Any) -> list[dict[str, Any]]:
    """L'éditeur renvoie selon l'appel un objet ou une liste d'objets."""
    if isinstance(valeur, dict):
        return [valeur]
    if isinstance(valeur, list):
        return [v for v in valeur if isinstance(v, dict)]
    return []


def _textes(valeur: Any) -> list[str]:
    if isinstance(valeur, Sequence) and not isinstance(valeur, str):
        return [t for t in (_texte(v) for v in valeur) if t]
    seul = _texte(valeur)
    return [seul] if seul else []


def _evenements_lus(donnees: Any) -> list[dict[str, Any]]:
    """L'éditeur renvoie `entries` comme une liste d'évènements, pas comme un rapport 4wings."""
    if not isinstance(donnees, dict):
        return []
    entrees = donnees.get("entries")
    if isinstance(entrees, list):
        return [e for e in entrees if isinstance(e, dict)]
    return []


def _heures_evenement(ev: dict[str, Any], debut: datetime | None, fin: datetime | None) -> float:
    peche = ev.get("fishing") if isinstance(ev.get("fishing"), dict) else {}
    for cle in ("totalTimeHours", "hours", "durationHours", "totalDurationHours"):
        n = _nombre(peche.get(cle))
        if n > 0:
            return round(n, 2)
    if debut is not None and fin is not None and fin > debut:
        return round((fin - debut).total_seconds() / 3600, 2)
    return 0.0


async def evenements_peche(debut: date | None, fin: date | None) -> EvenementsPecheRead:
    """Épisodes de pêche apparente dans la ZEE, avec un lieu par point."""
    p = parametres_gfw()
    client.exiger_actif()
    retard = p.retard_publication_heures.peche_apparente
    debut_r, fin_r = _periode(debut, fin, p, retard)
    reponse = await client.appeler(
        _EVENEMENTS,
        [("offset", "0"), ("limit", str(_EVENEMENTS_MAX))],
        rapport=False,
        corps={
            "datasets": [p.jeux.evenements_peche],
            "startDate": debut_r.isoformat(),
            "endDate": fin_r.isoformat(),
            "region": {"dataset": p.zone.jeu, "id": p.zone.identifiant},
        },
    )
    evenements: list[EvenementPeche] = []
    for rang, ev in enumerate(_evenements_lus(reponse.donnees)):
        lieu = _position(ev.get("position"))
        if lieu is None:
            continue
        lon, lat = lieu
        navire = ev.get("vessel") if isinstance(ev.get("vessel"), dict) else {}
        debut_ev = _instant(ev.get("start"))
        fin_ev = _instant(ev.get("end"))
        identifiant = _texte(ev.get("id")) or f"evenement-{rang}"
        evenements.append(
            EvenementPeche(
                id=identifiant,
                vessel_id=_texte(navire.get("id") or navire.get("vesselId")),
                nom=_texte(navire.get("name") or navire.get("shipname") or navire.get("shipName")),
                pavillon=_texte(navire.get("flag")),
                mmsi=_texte(navire.get("ssvid") or navire.get("mmsi")),
                numero_omi=_texte(navire.get("imo")),
                indicatif=_texte(navire.get("callsign")),
                engin=_texte(
                    navire.get("geartype")
                    or navire.get("gearType")
                    or (navire.get("type") if isinstance(navire.get("type"), str) else None)
                ),
                heures=_heures_evenement(ev, debut_ev, fin_ev),
                debut=debut_ev,
                fin=fin_ev,
                longitude=round(lon, 5),
                latitude=round(lat, 5),
            )
        )
        if len(evenements) >= _EVENEMENTS_MAX:
            break
    donnees = reponse.donnees if isinstance(reponse.donnees, dict) else {}
    total_editeur = donnees.get("total")
    try:
        total = int(total_editeur) if total_editeur is not None else len(evenements)
    except (TypeError, ValueError):
        total = len(evenements)
    entete = _entete(
        p,
        reponse,
        debut=debut_r,
        fin=fin_r,
        retard_heures=retard,
        avertissement=AVERTISSEMENT_EVENEMENTS,
    )
    if total > len(evenements):
        entete.fraicheur.resultat_partiel = True
    return EvenementsPecheRead(
        **entete.model_dump(),
        total=total,
        nb_affiches=len(evenements),
        evenements=evenements,
    )


async def identite_navire(vessel_id: str) -> IdentiteNavireRead:
    p = parametres_gfw()
    client.exiger_actif()
    reponse = await client.appeler(
        f"{_NAVIRES}/{vessel_id}", [("dataset", p.jeux.identite_navires)], rapport=False
    )
    d = reponse.donnees if isinstance(reponse.donnees, dict) else {}
    return IdentiteNavireRead(
        vessel_id=vessel_id,
        registre=[
            RegistreNavire(
                nom=_texte(r.get("shipname")),
                pavillon=_texte(r.get("flag")),
                mmsi=_texte(r.get("ssvid")),
                numero_omi=_texte(r.get("imo")),
                indicatif=_texte(r.get("callsign")),
                engins=_textes(r.get("geartypes")),
                longueur_m=_nombre(r.get("lengthM")) if r.get("lengthM") is not None else None,
                jauge_brute=(
                    _nombre(r.get("tonnageGt")) if r.get("tonnageGt") is not None else None
                ),
                du=_instant(r.get("transmissionDateFrom")),
                au=_instant(r.get("transmissionDateTo")),
            )
            for r in _objets(d.get("registryInfo"))
        ],
        emission=[
            EmissionNavire(
                vessel_id=_texte(s.get("id")),
                nom=_texte(s.get("shipname")),
                pavillon=_texte(s.get("flag")),
                mmsi=_texte(s.get("ssvid")),
                numero_omi=_texte(s.get("imo")),
                indicatif=_texte(s.get("callsign")),
                premiere_emission=_instant(s.get("transmissionDateFrom")),
                derniere_emission=_instant(s.get("transmissionDateTo")),
            )
            for s in _objets(d.get("selfReportedInfo"))
        ],
        proprietaires=[
            ProprietaireNavire(
                nom=_texte(o.get("name")),
                pavillon=_texte(o.get("flag")),
                du=_instant(o.get("dateFrom")),
                au=_instant(o.get("dateTo")),
                sources=_textes(o.get("sourceCode")),
            )
            for o in _objets(d.get("registryOwners"))
        ],
        autorisations=[
            AutorisationNavire(
                sources=_textes(a.get("sourceCode")),
                du=_instant(a.get("dateFrom")),
                au=_instant(a.get("dateTo")),
            )
            for a in _objets(
                d.get("registryPublicAuthorizations") or d.get("registryAuthorizations")
            )
        ],
        fraicheur=FraicheurIdentite(
            recupere_a=reponse.recupere_a, en_cache=reponse.en_cache, perime=reponse.perime
        ),
        attribution=_attribution(p),
        avertissement=AVERTISSEMENT_IDENTITE,
    )
