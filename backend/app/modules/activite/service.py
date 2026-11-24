"""Services : heures d'activité par maille, captures par zone, rapport de zone.

Source : les positions de la plateforme (application et balises), les seules à
couvrir les pirogues, et les captures déclarées. Les données d'un éditeur tiers
n'entrent pas dans ces calculs.

Règle de calcul, statut « Proposé » (valideurs : Christian, expert halieutique),
paramétrée dans `data/regles/activite_zones.json` :

1. les relevés d'une embarcation sont lus dans l'ordre du temps ;
2. l'intervalle entre deux relevés consécutifs compte s'il dure au plus
   `intervalle_max_minutes` et, quand `vitesse_max_noeuds` est renseignée, si la
   vitesse moyenne sur l'intervalle ne la dépasse pas ;
3. un intervalle est localisé par son relevé de départ : c'est ce relevé qui
   décide de la maille, de la zone et de l'exclusion des abords d'un port ;
4. un intervalle appartient à la période si son relevé de départ s'y trouve :
   deux périodes qui se suivent s'additionnent sans perte ni double compte.

Les captures sans lieu de pêche et les alertes sans position sont comptées à
part : rien n'est attribué à une zone par supposition.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    DateTime,
    Float,
    Integer,
    Numeric,
    String,
    and_,
    case,
    cast,
    distinct,
    extract,
    func,
    literal,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Subquery

from app.core.errors import bad_request, not_found
from app.core.perimetre import Perimetre, perimetre_de
from app.db.enums import SourcePosition
from app.db.models import (
    Alerte,
    Capture,
    Embarcation,
    LogAcces,
    Position,
    Utilisateur,
    ZoneReglementee,
)
from app.modules.activite.regles import RegleActivite, regle_activite
from app.modules.activite.schemas import (
    ActiviteZone,
    AlertesZone,
    AlerteZone,
    CapturesZone,
    CapturesZoneRead,
    EmbarcationPresente,
    FiltresActivite,
    GroupeCaptures,
    MailleFeature,
    MailleProprietes,
    MaillesActiviteRead,
    PeriodeRead,
    RapportZoneRead,
    RegleRead,
    SecteurRead,
    TotauxActivite,
    VolumeEspece,
    ZoneRef,
)
from app.modules.ais_gabon.ports import load_ports
from app.modules.referentiels import service as referentiels
from app.schemas.common import PolygonGeoJSON

# Un nœud en mètres par seconde (un mille marin, 1 852 m, par heure)
_NOEUD_M_S = 1852.0 / 3600.0
# Bornes de taille des listes renvoyées (lisibilité de la réponse, pas une règle métier)
_ALERTES_LISTE_MAX = 50
_EMBARCATIONS_LISTE_MAX = 200
# Bornes techniques des dates acceptées (les calculs de dates débordent au-delà)
_DATE_MIN = datetime(1900, 1, 1, tzinfo=UTC)
_DATE_MAX = datetime(2200, 1, 1, tzinfo=UTC)


# --------------------------------------------------------------------------- #
# Période, emprise, zone ou secteur
# --------------------------------------------------------------------------- #


def _utc(value: datetime) -> datetime:
    """Date lue en UTC ; une date hors des bornes du calendrier utile est refusée (400)."""
    hors_bornes = bad_request(
        "Date hors des bornes acceptées : indiquez une date entre 1900 et 2200.",
        "PERIODE_INVALIDE",
    )
    try:
        lue = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    except OverflowError as exc:
        raise hors_bornes from exc
    if not (_DATE_MIN <= lue <= _DATE_MAX):
        raise hors_bornes
    return lue


def _periode(
    debut: datetime | None, fin: datetime | None, regle: RegleActivite
) -> tuple[datetime, datetime]:
    """Période demi-ouverte [debut, fin) en UTC, bornée par la règle."""
    fin_utc = _utc(fin) if fin is not None else datetime.now(UTC)
    debut_utc = (
        _utc(debut)
        if debut is not None
        else fin_utc - timedelta(days=int(regle.periode_defaut_jours))
    )
    if debut_utc >= fin_utc:
        raise bad_request("La date de début doit précéder la date de fin.", "PERIODE_INVALIDE")
    if fin_utc - debut_utc > timedelta(days=int(regle.periode_max_jours)):
        raise bad_request(
            f"La période demandée dépasse {int(regle.periode_max_jours)} jours : "
            "réduisez l'intervalle entre les deux dates.",
            "PERIODE_TROP_LONGUE",
        )
    return debut_utc, fin_utc


def _lire_emprise(emprise: str | None) -> tuple[float, float, float, float] | None:
    """`lon min,lat min,lon max,lat max` en degrés décimaux."""
    if emprise is None or not emprise.strip():
        return None
    invalide = bad_request(
        "Emprise invalide : indiquez quatre nombres séparés par des virgules, "
        "longitude minimale, latitude minimale, longitude maximale, latitude maximale.",
        "EMPRISE_INVALIDE",
    )
    morceaux = [m.strip() for m in emprise.split(",")]
    if len(morceaux) != 4:
        raise invalide
    try:
        x1, y1, x2, y2 = (float(m) for m in morceaux)
    except ValueError as exc:
        raise invalide from exc
    if not (-180 <= x1 < x2 <= 180 and -90 <= y1 < y2 <= 90):
        raise invalide
    return x1, y1, x2, y2


def _point(lon: Any, lat: Any) -> ColumnElement:
    return func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)


@dataclass(frozen=True)
class Espace:
    """Zone réglementée (polygone en base) ou secteur de mer (cercle du référentiel)."""

    ref: ZoneRef
    zone_id: UUID | None = None
    centre: tuple[float, float] = (0.0, 0.0)
    rayon_m: float = 0.0

    def contient(self, geom: ColumnElement) -> ColumnElement:
        if self.zone_id is not None:
            return (
                select(ZoneReglementee.id)
                .where(
                    ZoneReglementee.id == self.zone_id,
                    func.ST_Intersects(ZoneReglementee.geometrie, geom),
                )
                .exists()
            )
        return func.ST_DistanceSphere(geom, _point(*self.centre)) <= self.rayon_m


def secteurs() -> list[SecteurRead]:
    """Secteurs de mer du référentiel (`secteurs_mer.json`), partagés avec le bulletin."""
    from app.modules.meteo_marine.service import load_referentiel

    out: list[SecteurRead] = []
    for item in load_referentiel().get("secteurs") or []:
        try:
            out.append(
                SecteurRead(
                    id=str(item["id"]),
                    nom=str(item["nom"]),
                    type=item.get("type"),
                    lon=float(item["lon"]),
                    lat=float(item["lat"]),
                    rayon_km=float(item["rayon_km"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


async def _espace(
    db: AsyncSession, *, zone_id: UUID | None, secteur: str | None, obligatoire: bool
) -> Espace | None:
    secteur_id = (secteur or "").strip()
    if zone_id is not None and secteur_id:
        raise bad_request(
            "Indiquez une zone réglementée ou un secteur, pas les deux.", "ZONE_OU_SECTEUR"
        )
    if zone_id is not None:
        zone = await db.get(ZoneReglementee, zone_id)
        if zone is None:
            raise not_found("Zone réglementée introuvable", "ZONE_NOT_FOUND")
        ref = ZoneRef(genre="zone_reglementee", id=str(zone.id), nom=zone.nom, type=zone.type.value)
        return Espace(ref=ref, zone_id=zone.id)
    if secteur_id:
        for s in secteurs():
            if s.id == secteur_id:
                ref = ZoneRef(genre="secteur", id=s.id, nom=s.nom, type=s.type)
                return Espace(ref=ref, centre=(s.lon, s.lat), rayon_m=s.rayon_km * 1000.0)
        raise not_found("Secteur introuvable", "SECTEUR_NOT_FOUND")
    if obligatoire:
        raise bad_request(
            "Indiquez une zone réglementée (zone_id) ou un secteur (secteur).", "ZONE_OU_SECTEUR"
        )
    return None


async def _embarcation_visible(
    db: AsyncSession, perimetre: Perimetre, embarcation_id: UUID
) -> None:
    """Hors périmètre ou inexistante : même réponse, pour ne rien révéler."""
    introuvable = not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
    if not perimetre.voit_embarcation(embarcation_id):
        raise introuvable
    if perimetre.tout and await db.get(Embarcation, embarcation_id) is None:
        raise introuvable


def _regle_read(regle: RegleActivite, entete: dict[str, Any]) -> RegleRead:
    # Les valideurs restent dans le fichier de règles : ils ne sont pas diffusés
    return RegleRead(
        version=entete["version"], statut=entete["statut"], parametres=regle.model_dump()
    )


def _heures(secondes: float | None) -> float:
    return round(float(secondes or 0.0) / 3600.0, 2)


# --------------------------------------------------------------------------- #
# Intervalles d'activité (cœur de la règle)
# --------------------------------------------------------------------------- #


def _intervalles(
    regle: RegleActivite,
    *,
    debut: datetime,
    fin: datetime,
    perimetre: Perimetre,
    embarcation_id: UUID | None = None,
    source: SourcePosition | None = None,
    emprise: tuple[float, float, float, float] | None = None,
    espace: Espace | None = None,
) -> Subquery:
    """Sous-requête : un rang par intervalle compté (embarcation, source, durée, maille)."""
    ecart = timedelta(minutes=float(regle.intervalle_max_minutes))
    # Tri départagé par l'identifiant : deux relevés au même instant gardent un ordre stable
    fenetre = {
        "partition_by": Position.embarcation_id,
        "order_by": (Position.horodatage, Position.id),
    }
    lon = func.ST_X(Position.position)
    lat = func.ST_Y(Position.position)
    # Le relevé suivant peut tomber après la fin de la période : la lecture va
    # jusqu'à `fin + ecart`, seuls les relevés de départ antérieurs à `fin` comptent.
    releves = select(
        Position.embarcation_id.label("embarcation_id"),
        Position.horodatage.label("t1"),
        cast(Position.source, String).label("source"),
        lon.label("lon1"),
        lat.label("lat1"),
        func.lead(Position.horodatage, type_=DateTime(timezone=True)).over(**fenetre).label("t2"),
        func.lead(lon, type_=Float).over(**fenetre).label("lon2"),
        func.lead(lat, type_=Float).over(**fenetre).label("lat2"),
    ).where(Position.horodatage >= debut, Position.horodatage < fin + ecart)
    # Le périmètre s'applique toujours, y compris avec un filtre par embarcation
    if not perimetre.tout:
        releves = releves.where(Position.embarcation_id.in_(tuple(perimetre.embarcation_ids)))
    if embarcation_id is not None:
        releves = releves.where(Position.embarcation_id == embarcation_id)
    # Filtre de source : seuls les relevés de cette source sont lus, puis la règle
    # s'applique. Pour une embarcation qui émet par les deux sources à la fois, les
    # heures par source ne s'additionnent donc pas.
    if source is not None:
        releves = releves.where(Position.source == source)
    r = releves.subquery("r")

    depart = _point(r.c.lon1, r.c.lat1)
    duree_s = cast(extract("epoch", r.c.t2 - r.c.t1), Float)
    conditions: list[ColumnElement] = [
        r.c.t2.is_not(None),
        r.c.t1 < fin,
        r.c.t2 > r.c.t1,
        (r.c.t2 - r.c.t1) <= ecart,
    ]
    if regle.vitesse_max_noeuds is not None:
        vitesse_max_m_s = float(regle.vitesse_max_noeuds) * _NOEUD_M_S
        conditions.append(
            func.ST_DistanceSphere(depart, _point(r.c.lon2, r.c.lat2)) <= duree_s * vitesse_max_m_s
        )
    if regle.exclusion_ports.actif:
        for port in load_ports():
            rayon_km = regle.exclusion_ports.rayon_km or port.rayon_km
            conditions.append(
                func.ST_DistanceSphere(depart, _point(port.lon, port.lat))
                > float(rayon_km) * 1000.0
            )
    if emprise is not None:
        x1, y1, x2, y2 = emprise
        # Emprise demi-ouverte, comme les mailles : un relevé posé sur le bord commun
        # de deux emprises voisines n'est compté que dans une seule.
        conditions += [r.c.lon1 >= x1, r.c.lon1 < x2, r.c.lat1 >= y1, r.c.lat1 < y2]
    if espace is not None:
        conditions.append(espace.contient(depart))

    # Indices de maille en arithmétique décimale : pas d'erreur d'arrondi aux bords
    pas = literal(Decimal(str(regle.taille_maille_deg)), Numeric())
    return (
        select(
            r.c.embarcation_id.label("embarcation_id"),
            r.c.source.label("source"),
            duree_s.label("duree_s"),
            cast(func.floor(cast(r.c.lon1, Numeric()) / pas), Integer).label("ix"),
            cast(func.floor(cast(r.c.lat1, Numeric()) / pas), Integer).label("iy"),
        )
        .where(*conditions)
        .subquery("i")
    )


def _maille(ix: int, iy: int, pas: Decimal) -> PolygonGeoJSON:
    x0, y0 = float(pas * ix), float(pas * iy)
    x1, y1 = float(pas * (ix + 1)), float(pas * (iy + 1))
    return PolygonGeoJSON(coordinates=[[(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]])


# --------------------------------------------------------------------------- #
# A. Heures d'activité par maille
# --------------------------------------------------------------------------- #


async def mailles_activite(
    db: AsyncSession,
    user: Utilisateur,
    *,
    debut: datetime | None = None,
    fin: datetime | None = None,
    emprise: str | None = None,
    secteur: str | None = None,
    zone_id: UUID | None = None,
    embarcation_id: UUID | None = None,
    source: SourcePosition | None = None,
) -> MaillesActiviteRead:
    regle, entete = regle_activite()
    debut_utc, fin_utc = _periode(debut, fin, regle)
    bbox = _lire_emprise(emprise)
    perimetre = await perimetre_de(db, user)
    if embarcation_id is not None:
        await _embarcation_visible(db, perimetre, embarcation_id)
    espace = await _espace(db, zone_id=zone_id, secteur=secteur, obligatoire=False)

    features: list[MailleFeature] = []
    totaux = TotauxActivite(heures_activite=0.0, nb_embarcations=0, nb_intervalles=0, nb_mailles=0)
    if perimetre.tout or perimetre.embarcation_ids:
        i = _intervalles(
            regle,
            debut=debut_utc,
            fin=fin_utc,
            perimetre=perimetre,
            embarcation_id=embarcation_id,
            source=source,
            emprise=bbox,
            espace=espace,
        )
        lignes = (
            await db.execute(
                select(
                    i.c.ix,
                    i.c.iy,
                    func.sum(i.c.duree_s),
                    func.count(),
                    func.count(distinct(i.c.embarcation_id)),
                    func.array_agg(distinct(i.c.source), type_=ARRAY(String)),
                )
                .group_by(i.c.ix, i.c.iy)
                .order_by(i.c.ix, i.c.iy)
                .limit(int(regle.mailles_max) + 1)
            )
        ).all()
        if len(lignes) > int(regle.mailles_max):
            raise bad_request(
                f"La demande couvre plus de {int(regle.mailles_max)} mailles : "
                "réduisez l'emprise ou la période.",
                "EMPRISE_TROP_LARGE",
            )
        pas = Decimal(str(regle.taille_maille_deg))
        for ix, iy, secondes, nb, nb_emb, sources in lignes:
            features.append(
                MailleFeature(
                    id=f"{ix}:{iy}",
                    geometry=_maille(int(ix), int(iy), pas),
                    properties=MailleProprietes(
                        heures_activite=_heures(secondes),
                        nb_embarcations=int(nb_emb),
                        nb_intervalles=int(nb),
                        sources=sorted(s for s in (sources or []) if s),
                    ),
                )
            )
        secondes, nb, nb_emb = (
            await db.execute(
                select(
                    func.coalesce(func.sum(i.c.duree_s), 0.0),
                    func.count(),
                    func.count(distinct(i.c.embarcation_id)),
                )
            )
        ).one()
        totaux = TotauxActivite(
            heures_activite=_heures(secondes),
            nb_embarcations=int(nb_emb),
            nb_intervalles=int(nb),
            nb_mailles=len(features),
        )

    return MaillesActiviteRead(
        features=features,
        periode=PeriodeRead(debut=debut_utc, fin=fin_utc),
        emprise=list(bbox) if bbox else None,
        taille_maille_deg=float(regle.taille_maille_deg),
        filtres=FiltresActivite(
            secteur=espace.ref.id if espace and espace.ref.genre == "secteur" else None,
            zone_id=espace.zone_id if espace else None,
            embarcation_id=embarcation_id,
            source=source.value if source else None,
        ),
        totaux=totaux,
        regle=_regle_read(regle, entete),
        genere_a=datetime.now(UTC),
    )


# --------------------------------------------------------------------------- #
# B. Captures par zone
# --------------------------------------------------------------------------- #

_GROUPES = ("dans_la_zone", "sans_position", "positionnees_hors_zone")


async def _captures(
    db: AsyncSession, perimetre: Perimetre, espace: Espace, debut: datetime, fin: datetime
) -> CapturesZone:
    vides = {nom: GroupeCaptures() for nom in _GROUPES}
    if not perimetre.tout and not perimetre.pecheur_ids:
        return CapturesZone(**vides)

    # Une capture sans lieu de pêche n'est rattachée à aucune zone
    groupe = case(
        (Capture.position_capture.is_(None), "sans_position"),
        (espace.contient(Capture.position_capture), "dans_la_zone"),
        else_="positionnees_hors_zone",
    )
    base = select(
        groupe.label("groupe"),
        Capture.espece.label("espece"),
        Capture.quantite_kg.label("quantite_kg"),
    ).where(Capture.date_capture >= debut, Capture.date_capture < fin)
    if not perimetre.tout:
        base = base.where(Capture.pecheur_id.in_(tuple(perimetre.pecheur_ids)))
    c = base.subquery("c")
    lignes = (
        await db.execute(
            select(c.c.groupe, c.c.espece, func.sum(c.c.quantite_kg), func.count()).group_by(
                c.c.groupe, c.c.espece
            )
        )
    ).all()

    # Regroupement par code canonique du référentiel (un alias ne crée pas une ligne à part)
    cumul: dict[str, dict[str, list[float]]] = {nom: {} for nom in _GROUPES}
    for nom_groupe, espece, kg, nb in lignes:
        code = referentiels.canonical_espece(espece) or str(espece)
        ligne = cumul[str(nom_groupe)].setdefault(code, [0.0, 0])
        ligne[0] += float(kg or 0.0)
        ligne[1] += int(nb or 0)

    groupes: dict[str, GroupeCaptures] = {}
    for nom_groupe in _GROUPES:
        par_espece = [
            VolumeEspece(
                espece=code,
                nom=referentiels.nom_espece(code),
                quantite_kg=round(kg, 3),
                nb_declarations=int(nb),
            )
            for code, (kg, nb) in cumul[nom_groupe].items()
        ]
        par_espece.sort(key=lambda v: (-v.quantite_kg, v.espece))
        groupes[nom_groupe] = GroupeCaptures(
            quantite_kg=round(sum(v.quantite_kg for v in par_espece), 3),
            nb_declarations=sum(v.nb_declarations for v in par_espece),
            par_espece=par_espece,
        )
    return CapturesZone(**groupes)


async def captures_par_zone(
    db: AsyncSession,
    user: Utilisateur,
    *,
    zone_id: UUID | None = None,
    secteur: str | None = None,
    debut: datetime | None = None,
    fin: datetime | None = None,
) -> CapturesZoneRead:
    regle, _entete = regle_activite()
    debut_utc, fin_utc = _periode(debut, fin, regle)
    espace = await _espace(db, zone_id=zone_id, secteur=secteur, obligatoire=True)
    assert espace is not None
    perimetre = await perimetre_de(db, user)
    captures = await _captures(db, perimetre, espace, debut_utc, fin_utc)
    return CapturesZoneRead(
        zone=espace.ref,
        periode=PeriodeRead(debut=debut_utc, fin=fin_utc),
        genere_a=datetime.now(UTC),
        **captures.model_dump(),
    )


# --------------------------------------------------------------------------- #
# C. Rapport de zone
# --------------------------------------------------------------------------- #


def _nombre_json(*chemin: Any) -> ColumnElement:
    """Valeur numérique d'un chemin du déclencheur, vide si absente ou d'un autre type."""
    noeud = Alerte.declencheur[chemin]
    return case((func.jsonb_typeof(noeud) == "number", noeud.as_float()), else_=None)


async def _alertes(db: AsyncSession, espace: Espace, debut: datetime, fin: datetime) -> AlertesZone:
    """Alertes de la période rattachées à la zone : par référence de zone ou par position.

    Les règles d'alerte enregistrent le lieu dans le déclencheur, sous deux formes
    (point GeoJSON ou couple longitude et latitude). Une alerte sans lieu ni
    référence de zone n'est rattachée à aucune zone : elle est comptée à part.
    """
    lon = func.coalesce(_nombre_json("position", "coordinates", 0), _nombre_json("position", "lon"))
    lat = func.coalesce(_nombre_json("position", "coordinates", 1), _nombre_json("position", "lat"))
    a = (
        select(
            Alerte.id.label("id"),
            Alerte.type.label("type"),
            Alerte.niveau_gravite.label("niveau_gravite"),
            Alerte.statut.label("statut"),
            Alerte.horodatage.label("horodatage"),
            Alerte.embarcation_id.label("embarcation_id"),
            Alerte.declencheur["regle"].as_string().label("regle"),
            Alerte.declencheur["zone_id"].as_string().label("zone_ref"),
            lon.label("lon"),
            lat.label("lat"),
        )
        .where(Alerte.horodatage >= debut, Alerte.horodatage < fin)
        .subquery("a")
    )
    localisee = and_(a.c.lon.is_not(None), a.c.lat.is_not(None))
    rattachee = and_(localisee, espace.contient(_point(a.c.lon, a.c.lat)))
    if espace.zone_id is not None:
        rattachee = or_(a.c.zone_ref == str(espace.zone_id), rattachee)

    comptes = (
        await db.execute(
            select(a.c.type, a.c.niveau_gravite, func.count())
            .where(rattachee)
            .group_by(a.c.type, a.c.niveau_gravite)
        )
    ).all()
    par_type: dict[str, int] = {}
    par_gravite: dict[str, int] = {}
    for type_alerte, gravite, nb in comptes:
        cle_type = str(getattr(type_alerte, "value", type_alerte))
        cle_gravite = str(getattr(gravite, "value", gravite))
        par_type[cle_type] = par_type.get(cle_type, 0) + int(nb)
        par_gravite[cle_gravite] = par_gravite.get(cle_gravite, 0) + int(nb)

    recentes = (
        await db.execute(
            select(
                a.c.id,
                a.c.type,
                a.c.niveau_gravite,
                a.c.statut,
                a.c.horodatage,
                a.c.regle,
                a.c.embarcation_id,
            )
            .where(rattachee)
            .order_by(a.c.horodatage.desc())
            .limit(_ALERTES_LISTE_MAX)
        )
    ).all()
    sans_position = int(
        (
            await db.execute(
                select(func.count())
                .select_from(a)
                .where(or_(a.c.lon.is_(None), a.c.lat.is_(None)), a.c.zone_ref.is_(None))
            )
        ).scalar_one()
        or 0
    )
    return AlertesZone(
        total=sum(par_type.values()),
        par_type=dict(sorted(par_type.items())),
        par_gravite=dict(sorted(par_gravite.items())),
        elements=[
            AlerteZone(
                id=row.id,
                type=str(getattr(row.type, "value", row.type)),
                niveau_gravite=str(getattr(row.niveau_gravite, "value", row.niveau_gravite)),
                statut=str(getattr(row.statut, "value", row.statut)),
                horodatage=row.horodatage,
                regle=row.regle or "",
                embarcation_id=row.embarcation_id,
            )
            for row in recentes
        ],
        sans_position=sans_position,
    )


async def rapport_zone(
    db: AsyncSession,
    user: Utilisateur,
    *,
    zone_id: UUID | None = None,
    secteur: str | None = None,
    debut: datetime | None = None,
    fin: datetime | None = None,
    action: str = "consultation",
) -> RapportZoneRead:
    """Heures d'activité, embarcations présentes, captures par espèce et alertes d'une zone.

    Réservé aux rôles de pilotage (toute la flotte). Chaque consultation est
    inscrite au journal des accès (cahier §7) : le rapport nomme des embarcations.
    """
    regle, entete = regle_activite()
    debut_utc, fin_utc = _periode(debut, fin, regle)
    espace = await _espace(db, zone_id=zone_id, secteur=secteur, obligatoire=True)
    assert espace is not None
    perimetre = await perimetre_de(db, user)
    if not perimetre.tout:
        # La route n'admet que des rôles de pilotage : tout autre cas échoue fermé
        raise not_found("Zone introuvable", "ZONE_NOT_FOUND")

    i = _intervalles(regle, debut=debut_utc, fin=fin_utc, perimetre=perimetre, espace=espace)
    par_embarcation = {
        emb_id: (float(secondes or 0.0), int(nb))
        for emb_id, secondes, nb in (
            await db.execute(
                select(i.c.embarcation_id, func.sum(i.c.duree_s), func.count()).group_by(
                    i.c.embarcation_id
                )
            )
        ).all()
    }
    activite = ActiviteZone(
        heures_activite=_heures(sum(s for s, _ in par_embarcation.values())),
        nb_embarcations_actives=len(par_embarcation),
        nb_intervalles=sum(n for _, n in par_embarcation.values()),
    )

    # Embarcations présentes : au moins un relevé dans la zone sur la période
    nb_releves = func.count()
    presents = (
        await db.execute(
            select(
                Position.embarcation_id,
                nb_releves,
                func.min(Position.horodatage),
                func.max(Position.horodatage),
                func.array_agg(distinct(cast(Position.source, String)), type_=ARRAY(String)),
            )
            .where(
                Position.horodatage >= debut_utc,
                Position.horodatage < fin_utc,
                espace.contient(Position.position),
            )
            .group_by(Position.embarcation_id)
            .order_by(nb_releves.desc(), Position.embarcation_id)
        )
    ).all()
    retenus = presents[:_EMBARCATIONS_LISTE_MAX]
    fiches = {
        emb.id: emb
        for emb in (
            await db.execute(
                select(Embarcation).where(Embarcation.id.in_([row[0] for row in retenus]))
            )
        )
        .scalars()
        .all()
    }
    embarcations = [
        EmbarcationPresente(
            embarcation_id=emb_id,
            nom=fiches[emb_id].nom,
            immatriculation=fiches[emb_id].immatriculation,
            type=fiches[emb_id].type,
            nb_releves=int(nb),
            premier_releve=premier,
            dernier_releve=dernier,
            heures_activite=_heures(par_embarcation.get(emb_id, (0.0, 0))[0]),
            sources=sorted(s for s in (sources or []) if s),
        )
        for emb_id, nb, premier, dernier, sources in retenus
        if emb_id in fiches
    ]

    captures = await _captures(db, perimetre, espace, debut_utc, fin_utc)
    alertes = await _alertes(db, espace, debut_utc, fin_utc)

    db.add(
        LogAcces(
            utilisateur_id=user.id,
            ressource="rapport_zone",
            action=action,
            detail=(
                f"{espace.ref.genre}={espace.ref.id} "
                f"{debut_utc.isoformat()} {fin_utc.isoformat()}"
            )[:500],
        )
    )
    await db.commit()

    return RapportZoneRead(
        zone=espace.ref,
        periode=PeriodeRead(debut=debut_utc, fin=fin_utc),
        activite=activite,
        nb_embarcations_presentes=len(presents),
        embarcations=embarcations,
        captures=captures,
        alertes=alertes,
        regle=_regle_read(regle, entete),
        genere_a=datetime.now(UTC),
    )
