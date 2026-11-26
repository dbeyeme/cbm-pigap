"""Services M7 — règles d'alertes explicites (§5.7)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_Intersects
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, not_found
from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte, TypeZone
from app.db.models import (
    Alerte,
    Capture,
    Embarcation,
    Pecheur,
    Position,
    Utilisateur,
    ZoneReglementee,
)
from app.modules.alertes import traitement
from app.modules.alertes.schemas import (
    AlerteDetailRead,
    AlerteRead,
    AlerteTraitement,
    AlerteUpdateStatut,
    DescriptionAlerte,
    EtatPossible,
    EtatRead,
    EtatsRead,
    JournalRead,
)
from app.modules.geolocalisation.geo import point_to_wkt
from app.schemas.common import PointGeoJSON


def to_read(row: Alerte) -> AlerteRead:
    return AlerteRead.model_validate(row)


# --------------------------------------------------------------------------- #
# Lot 9 : liste filtrée et paginée, description, traitement, journal
# --------------------------------------------------------------------------- #


async def _embarcations(db: AsyncSession, rows: list[Alerte]) -> dict[UUID, Embarcation]:
    ids = {r.embarcation_id for r in rows if r.embarcation_id is not None}
    if not ids:
        return {}
    result = await db.execute(select(Embarcation).where(Embarcation.id.in_(ids)))
    return {e.id: e for e in result.scalars().all()}


def _lecture(row: Alerte, embarcation: Embarcation | None, regle, descriptions) -> AlerteRead:
    etat = regle.etat(row.etat_traitement)
    return AlerteRead.model_validate(row).model_copy(
        update={
            "etat_libelle": regle.libelle(row.etat_traitement),
            "ouverte": etat.ouvert if etat is not None else None,
            "description": DescriptionAlerte.model_validate(
                traitement.decrire(row, embarcation, regle, descriptions)
            ),
        }
    )


def _refus_filtre(message: str) -> ApiError:
    return ApiError(422, message, "FILTRE_INVALIDE")


async def list_alertes(
    db: AsyncSession,
    *,
    type_alerte: TypeAlerte | None = None,
    statut: StatutAlerte | None = None,
    embarcation_id: UUID | None = None,
    limit: int | None = None,
    offset: int = 0,
    etats: list[str] | None = None,
    gravites: list[NiveauGravite] | None = None,
    regle_code: str | None = None,
    depuis: datetime | None = None,
    jusqu_a: datetime | None = None,
) -> tuple[list[AlerteRead], int]:
    """Alertes de la plus récente à la plus ancienne, filtrées, avec le total avant pagination."""
    regle, descriptions, _ = traitement.regle_traitement()
    limite = regle.liste_limite_defaut if limit is None else limit
    if limite > regle.liste_limite_max:
        raise _refus_filtre(f"Une page compte au plus {regle.liste_limite_max} alertes.")
    for etat in etats or []:
        if regle.etat(etat) is None:
            raise _refus_filtre(f"État inconnu : « {etat} ».")
    # Une date sans fuseau est lue en temps universel
    if depuis is not None and depuis.tzinfo is None:
        depuis = depuis.replace(tzinfo=UTC)
    if jusqu_a is not None and jusqu_a.tzinfo is None:
        jusqu_a = jusqu_a.replace(tzinfo=UTC)
    if depuis is not None and jusqu_a is not None and depuis >= jusqu_a:
        raise _refus_filtre("La date de début doit précéder la date de fin.")

    filtres = []
    if type_alerte is not None:
        filtres.append(Alerte.type == type_alerte)
    if statut is not None:
        filtres.append(Alerte.statut == statut)
    if embarcation_id is not None:
        filtres.append(Alerte.embarcation_id == embarcation_id)
    if etats:
        filtres.append(Alerte.etat_traitement.in_(etats))
    if gravites:
        filtres.append(Alerte.niveau_gravite.in_(gravites))
    if regle_code:
        filtres.append(Alerte.declencheur["regle"].as_string() == regle_code)
    if depuis is not None:
        filtres.append(Alerte.horodatage >= depuis)
    if jusqu_a is not None:
        filtres.append(Alerte.horodatage < jusqu_a)

    total = int((await db.execute(select(func.count(Alerte.id)).where(*filtres))).scalar_one() or 0)
    rows = list(
        (
            await db.execute(
                select(Alerte)
                .where(*filtres)
                .order_by(Alerte.horodatage.desc(), Alerte.id)
                .limit(limite)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    bateaux = await _embarcations(db, rows)
    return [_lecture(r, bateaux.get(r.embarcation_id), regle, descriptions) for r in rows], total


async def detail_alerte(db: AsyncSession, alerte_id: UUID) -> AlerteDetailRead:
    regle, descriptions, _ = traitement.regle_traitement()
    row = await db.get(Alerte, alerte_id)
    if row is None:
        raise not_found("Alerte introuvable", "ALERTE_NOT_FOUND")
    bateau = await db.get(Embarcation, row.embarcation_id) if row.embarcation_id else None
    lecture = _lecture(row, bateau, regle, descriptions)
    lignes = await traitement.journal(db, row.id)
    return AlerteDetailRead(
        **lecture.model_dump(),
        journal=[
            JournalRead(
                id=ligne.id,
                horodatage=ligne.horodatage,
                etat_avant=ligne.etat_avant,
                etat_avant_libelle=regle.libelle(ligne.etat_avant),
                etat_apres=ligne.etat_apres,
                etat_apres_libelle=regle.libelle(ligne.etat_apres),
                commentaire=ligne.commentaire,
                auteur_nom=ligne.auteur_nom,
                auteur_role=ligne.auteur_role,
                origine=ligne.origine,
            )
            for ligne in lignes
        ],
        transitions_possibles=[
            EtatPossible(code=c, libelle=regle.libelle(c))
            for c in regle.suivants(row.etat_traitement)
        ],
    )


async def traiter(
    db: AsyncSession, alerte_id: UUID, data: AlerteTraitement, auteur: Utilisateur
) -> AlerteDetailRead:
    """Changement d'état : transition permise, commentaire exigé, journal inscrit."""
    regle, _descriptions, _ = traitement.regle_traitement()
    alerte = await traitement.alerte_verrouillee(db, alerte_id)
    commentaire = traitement.commentaire_valide(data.commentaire, regle)
    traitement.changer_etat(
        db,
        alerte,
        arrivee=data.etat,
        commentaire=commentaire,
        auteur=auteur,
        origine="traitement",
        regle=regle,
        controler=True,
    )
    await db.commit()
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "alerte_statut", "id": str(alerte_id)})
    return await detail_alerte(db, alerte_id)


async def update_statut(
    db: AsyncSession, alerte_id: UUID, data: AlerteUpdateStatut, auteur: Utilisateur
) -> AlerteRead:
    """Ancien point d'accès (statut historique), gardé pour le portail existant.

    Le statut est traduit en état de traitement par le paramétrage, et le
    changement est inscrit au journal comme tout autre.
    """
    regle, descriptions, _ = traitement.regle_traitement()
    alerte = await traitement.alerte_verrouillee(db, alerte_id)
    arrivee = regle.ancien_ecran.statut_vers_etat.get(data.statut)
    if arrivee is None:
        raise ApiError(422, "Statut non reconnu.", "ETAT_INCONNU")
    actuel = regle.etat(alerte.etat_traitement)
    # Déjà dans un état qui correspond à ce statut (« prise en charge » pour « nouvelle »,
    # par exemple) : rien ne change, rien n'est inscrit.
    deja = actuel is not None and actuel.statut_historique == data.statut
    if not deja:
        texte = (data.commentaire or "").strip()
        commentaire = (
            traitement.commentaire_valide(texte, regle)
            if texte
            else regle.ancien_ecran.commentaire_par_defaut
        )
        traitement.changer_etat(
            db,
            alerte,
            arrivee=arrivee,
            commentaire=commentaire,
            auteur=auteur,
            origine="ancien_ecran",
            regle=regle,
            controler=regle.ancien_ecran.controle_des_transitions,
        )
        await db.commit()
        from app.modules.notifications.hub import hub

        await hub.publish({"kind": "alerte_statut", "id": str(alerte.id)})
    await db.refresh(alerte)
    bateau = await db.get(Embarcation, alerte.embarcation_id) if alerte.embarcation_id else None
    return _lecture(alerte, bateau, regle, descriptions)


def etats() -> EtatsRead:
    regle, _descriptions, entete = traitement.regle_traitement()
    return EtatsRead(
        etats=[
            EtatRead(
                code=e.code,
                libelle=e.libelle,
                ouvert=e.ouvert,
                statut_historique=e.statut_historique,
                transitions=[
                    EtatPossible(code=c, libelle=regle.libelle(c))
                    for c in regle.transitions.get(e.code, [])
                ],
            )
            for e in regle.etats
        ],
        etat_initial=regle.etat_initial,
        commentaire_min_caracteres=regle.commentaire_min_caracteres,
        commentaire_max_caracteres=regle.commentaire_max_caracteres,
        statut_regles=entete["statut"],
    )


async def _has_similar(
    db: AsyncSession,
    *,
    type_alerte: TypeAlerte,
    embarcation_id: UUID | None,
    fingerprint: str,
    since: datetime,
) -> bool:
    """Anti-doublon court : même type + empreinte dans declencheur depuis `since`."""
    stmt = select(Alerte.id).where(
        Alerte.type == type_alerte,
        Alerte.horodatage >= since,
        Alerte.declencheur["fingerprint"].as_string() == fingerprint,
    )
    if embarcation_id is not None:
        stmt = stmt.where(Alerte.embarcation_id == embarcation_id)
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none() is not None


async def _create(
    db: AsyncSession,
    *,
    type_alerte: TypeAlerte,
    gravite: NiveauGravite,
    embarcation_id: UUID | None,
    declencheur: dict[str, Any],
) -> Alerte | None:
    fp = str(declencheur.get("fingerprint", ""))
    since = datetime.now(UTC) - timedelta(hours=12)
    if fp and await _has_similar(
        db,
        type_alerte=type_alerte,
        embarcation_id=embarcation_id,
        fingerprint=fp,
        since=since,
    ):
        return None
    row = Alerte(
        type=type_alerte,
        niveau_gravite=gravite,
        embarcation_id=embarcation_id,
        declencheur=declencheur,
        statut=StatutAlerte.nouvelle,
    )
    db.add(row)
    await db.flush()
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "alerte", "id": str(row.id)})
    return row


async def evaluate_zone_interdite(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 1 : intrusion zone interdite (PostGIS ST_Intersects)."""
    when = a_la_date or datetime.now(UTC)
    point = point_to_wkt(position)
    stmt = (
        select(ZoneReglementee)
        .where(ZoneReglementee.actif.is_(True))
        .where(ZoneReglementee.type == TypeZone.interdite)
        .where(ST_Intersects(ZoneReglementee.geometrie, point))
    )
    zones = (await db.execute(stmt)).scalars().all()
    created: list[Alerte] = []
    for zone in zones:
        if zone.periode_debut and when.date() < zone.periode_debut:
            continue
        if zone.periode_fin and when.date() > zone.periode_fin:
            continue
        alerte = await _create(
            db,
            type_alerte=TypeAlerte.zone_interdite,
            gravite=NiveauGravite.critique,
            embarcation_id=embarcation_id,
            declencheur={
                "regle": "intrusion_zone_interdite",
                "fingerprint": f"zone:{zone.id}:emb:{embarcation_id}",
                "zone_id": str(zone.id),
                "zone_nom": zone.nom,
                "position": {
                    "type": "Point",
                    "coordinates": list(position.coordinates),
                },
            },
        )
        if alerte:
            created.append(alerte)
    return created


async def evaluate_tendance_embarcation(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    reference: datetime | None = None,
) -> list[Alerte]:
    """Règle 3 : volume 7j > 2× moyenne historique (fenêtres 7j antérieures)."""
    now = reference or datetime.now(UTC)
    window_start = now - timedelta(days=7)

    vol_7j = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(
                    Capture.embarcation_id == embarcation_id,
                    Capture.date_capture >= window_start,
                    Capture.date_capture <= now,
                )
            )
        ).scalar_one()
        or 0.0
    )

    # Historique : captures avant la fenêtre 7j
    hist_start_row = await db.execute(
        select(func.min(Capture.date_capture)).where(
            Capture.embarcation_id == embarcation_id,
            Capture.date_capture < window_start,
        )
    )
    hist_min = hist_start_row.scalar_one_or_none()
    if hist_min is None:
        return []

    vol_hist = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(
                    Capture.embarcation_id == embarcation_id,
                    Capture.date_capture < window_start,
                )
            )
        ).scalar_one()
        or 0.0
    )
    days_hist = max((window_start - hist_min).total_seconds() / 86400.0, 1.0)
    nb_fenetres = max(days_hist / 7.0, 1.0)
    moyenne_hist_7j = vol_hist / nb_fenetres

    if moyenne_hist_7j <= 0:
        return []
    if vol_7j <= 2.0 * moyenne_hist_7j:
        return []

    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.attention,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "activite_inhabituelle",
            "fingerprint": f"tendance:{embarcation_id}:{window_start.date().isoformat()}",
            "embarcation_id": str(embarcation_id),
            "volume_7j_kg": vol_7j,
            "moyenne_historique_7j_kg": round(moyenne_hist_7j, 3),
            "seuil_multiplicateur": 2.0,
            "fenetre_debut": window_start.isoformat(),
            "fenetre_fin": now.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_sortie_limite(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 4 : dépassement d'une limite géographique (§5.3).

    Les zones de type ``autorisee`` délimitent les eaux où la pêche est permise
    (zone artisanale, limites territoriales). Une position maritime relevée hors
    de toute zone autorisée active déclenche une alerte critique. Sans zone
    autorisée définie, la limite retenue est la ZEE gabonaise élargie de la
    marge côtière (eaux nationales). Les positions fluviales sont ignorées.
    """
    from app.modules.ais_gabon.service import point_in_gabon_waters
    from app.modules.geolocalisation.service import _classify_secteur

    lon, lat = position.coordinates
    if _classify_secteur(lon, lat) == "fleuve":
        return []
    when = a_la_date or datetime.now(UTC)
    point = point_to_wkt(position)
    stmt = (
        select(ZoneReglementee)
        .where(ZoneReglementee.actif.is_(True))
        .where(ZoneReglementee.type == TypeZone.autorisee)
    )
    zones = (await db.execute(stmt)).scalars().all()
    actives = [
        z
        for z in zones
        if not (z.periode_debut and when.date() < z.periode_debut)
        and not (z.periode_fin and when.date() > z.periode_fin)
    ]
    if actives:
        inside = await db.execute(
            select(ZoneReglementee.id)
            .where(ZoneReglementee.id.in_([z.id for z in actives]))
            .where(ST_Intersects(ZoneReglementee.geometrie, point))
            .limit(1)
        )
        if inside.scalar_one_or_none() is not None:
            return []
        limite = "zones_autorisees"
        reference = ", ".join(z.nom for z in actives[:5])
    else:
        if point_in_gabon_waters(lon, lat):
            return []
        limite = "zee_gabon"
        reference = "ZEE gabonaise (Marine Regions) élargie de la marge côtière"

    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.critique,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "sortie_limite_geographique",
            "fingerprint": f"limite:{embarcation_id}:{when.date().isoformat()}",
            "limite": limite,
            "reference": reference,
            "position": {"type": "Point", "coordinates": [lon, lat]},
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


def _cellule(lon: float, lat: float, *, pas_deg: float = 0.02) -> str:
    """Cellule de grille (~2 km) utilisée comme empreinte anti-doublon."""
    return f"{round(lon / pas_deg) * pas_deg:.2f},{round(lat / pas_deg) * pas_deg:.2f}"


async def evaluate_concentration(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 5 : concentration excessive de pêcheurs dans une zone (§5.7).

    Compte les embarcations distinctes ayant relevé une position dans le rayon
    ``alerte_concentration_rayon_km`` autour de la position, dans la fenêtre
    ``alerte_concentration_fenetre_min`` centrée sur l'horodatage. Au-delà du
    seuil ``alerte_concentration_seuil``, une alerte d'attention est émise au
    niveau de la zone (sans embarcation ciblée), une fois par cellule et par heure.
    """
    seuil = int(settings.alerte_concentration_seuil)
    if seuil <= 0:
        return []
    when = a_la_date or datetime.now(UTC)
    fenetre = timedelta(minutes=int(settings.alerte_concentration_fenetre_min))
    rayon_m = float(settings.alerte_concentration_rayon_km) * 1000.0
    lon, lat = position.coordinates
    point = point_to_wkt(position)
    stmt = select(func.count(func.distinct(Position.embarcation_id))).where(
        Position.horodatage >= when - fenetre,
        Position.horodatage <= when + fenetre,
        ST_DWithin(cast(Position.position, Geography), cast(point, Geography), rayon_m),
    )
    nb = int((await db.execute(stmt)).scalar_one() or 0)
    if nb < seuil:
        return []

    zone_nom: str | None = None
    zres = await db.execute(
        select(ZoneReglementee.nom)
        .where(ZoneReglementee.actif.is_(True))
        .where(ZoneReglementee.type != TypeZone.autorisee)
        .where(ST_Intersects(ZoneReglementee.geometrie, point))
        .limit(1)
    )
    zone_nom = zres.scalar_one_or_none()
    cellule = _cellule(lon, lat)
    heure = when.astimezone(UTC).strftime("%Y-%m-%dT%H")
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.attention,
        embarcation_id=None,
        declencheur={
            "regle": "concentration_zone",
            "fingerprint": f"concentration:{cellule}:{heure}",
            "cellule": cellule,
            "zone_nom": zone_nom,
            "nb_embarcations": nb,
            "seuil": seuil,
            "rayon_km": float(settings.alerte_concentration_rayon_km),
            "fenetre_min": int(settings.alerte_concentration_fenetre_min),
            "position": {"type": "Point", "coordinates": [lon, lat]},
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_espece_protegee(
    db: AsyncSession,
    *,
    espece: str | None,
    embarcation_id: UUID,
    reference: datetime | None = None,
) -> list[Alerte]:
    """Règle 6 : capture déclarée d'une espèce protégée (référentiel)."""
    from app.modules.referentiels import service as ref

    if not espece or not ref.espece_protegee(espece):
        return []
    when = reference or datetime.now(UTC)
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.critique,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "espece_protegee",
            "fingerprint": f"protegee:{embarcation_id}:{espece}:{when.date().isoformat()}",
            "espece": espece,
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_licence_pecheur(
    db: AsyncSession,
    *,
    pecheur_id: UUID | None,
    embarcation_id: UUID | None,
    reference: datetime | None = None,
) -> list[Alerte]:
    """Règle 7 : activité avec une autorisation annuelle expirée ou un pêcheur suspendu."""
    from app.core.licence import date_expiration, statut_licence

    if pecheur_id is None and embarcation_id is not None:
        emb = await db.get(Embarcation, embarcation_id)
        pecheur_id = emb.pecheur_id if emb else None
    if pecheur_id is None:
        return []
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        return []
    when = reference or datetime.now(UTC)
    statut = statut_licence(pecheur, today=when.date())
    if statut not in ("expiree", "suspendue"):
        return []
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.attention,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "licence_expiree" if statut == "expiree" else "pecheur_suspendu",
            "fingerprint": f"licence:{pecheur_id}:{when.strftime('%Y-%m')}",
            "pecheur_id": str(pecheur_id),
            "numero_licence": pecheur.numero_licence,
            "date_expiration": (date_expiration(pecheur) or when.date()).isoformat(),
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_declaration_manquante(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 8 : retour au port sans déclaration de capture dans le délai (rappel).

    Reconstitue les séjours port / mer des dernières heures depuis le GPS PIGAP :
    si le dernier séjour est au port depuis plus de ``alerte_rappel_declaration_heures``
    après une sortie en mer, et qu'aucune capture n'a été déclarée depuis le départ,
    une alerte d'information est émise (une par sortie).
    """
    from geoalchemy2.functions import ST_AsGeoJSON

    from app.modules.geolocalisation.geo import geojson_text_to_point
    from app.modules.geolocalisation.presence import _intervals

    when = a_la_date or datetime.now(UTC)
    fenetre = timedelta(hours=int(settings.presence_fenetre_heures))
    res = await db.execute(
        select(Position.horodatage, ST_AsGeoJSON(Position.position))
        .where(Position.embarcation_id == embarcation_id)
        .where(Position.horodatage >= when - fenetre, Position.horodatage <= when)
        .order_by(Position.horodatage.asc())
        .limit(500)
    )
    raw: list[tuple[datetime, float, float]] = []
    for ts, geo in res.all():
        pt = geojson_text_to_point(geo)
        if pt is None:
            continue
        lon, lat = pt.coordinates
        raw.append((ts.astimezone(UTC), lon, lat))
    intervals = _intervals(raw)
    if len(intervals) < 2:
        return []
    last, prev = intervals[-1], intervals[-2]
    if last.port_id is None or prev.port_id is not None:
        return []
    delai = timedelta(hours=float(settings.alerte_rappel_declaration_heures))
    if when - last.debut < delai:
        return []
    if prev.fin - prev.debut < timedelta(minutes=int(settings.presence_port_min_minutes)):
        return []  # simple manœuvre, pas une sortie
    declared = await db.execute(
        select(Capture.id)
        .where(Capture.embarcation_id == embarcation_id)
        .where(Capture.date_capture >= prev.debut - timedelta(hours=1))
        .limit(1)
    )
    if declared.scalar_one_or_none() is not None:
        return []
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.info,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "declaration_manquante",
            "fingerprint": f"declaration:{embarcation_id}:{prev.debut.isoformat()}",
            "sortie_debut": prev.debut.isoformat(),
            "retour_port": last.debut.isoformat(),
            "port_id": last.port_id,
            "delai_heures": float(settings.alerte_rappel_declaration_heures),
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def signaler_detresse(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    position: PointGeoJSON,
    a_la_date: datetime | None,
    origine: str,
) -> Alerte | None:
    """Alerte critique « détresse » déclenchée par le bouton d'une balise (ADR-009).

    Empreinte = embarcation + origine : un même bouton maintenu ne crée pas
    une alerte par message pendant 12 h (anti-doublon de `_create`).
    """
    lon, lat = position.coordinates
    return await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.critique,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "detresse_balise",
            "fingerprint": f"detresse:{embarcation_id}:{origine}",
            "origine": origine,
            "position": {"lon": lon, "lat": lat},
            "a_la_date": a_la_date.isoformat() if a_la_date else None,
            "message": "Signal de détresse émis par la balise de l'embarcation",
        },
    )


async def signaler_suivi_double(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    appareil_refuse_id: UUID,
    appareil_refuse: str,
    appareil_en_place: str | None,
    releve_refuse: datetime,
    releve_en_place: datetime,
    fenetre_minutes: float,
) -> Alerte | None:
    """Alerte « suivi par deux appareils » (ADR-012, règle R3).

    Un second appareil a tenté d'émettre pour une embarcation déjà suivie par un
    autre dans la fenêtre d'exclusivité. Les appareils ne figurent que par le
    début de leur empreinte, jamais par leur identifiant. Une alerte par
    embarcation et par appareil refusé sur 12 h (anti-doublon de `_create`).
    """
    return await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.attention,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "suivi_double_appareil",
            "fingerprint": f"double_appareil:{embarcation_id}:{appareil_refuse_id}",
            "embarcation_id": str(embarcation_id),
            "appareil_refuse": appareil_refuse,
            "appareil_en_place": appareil_en_place,
            "fenetre_minutes": fenetre_minutes,
            "releve_refuse": releve_refuse.isoformat(),
            "releve_en_place": releve_en_place.isoformat(),
            "message": (
                "Un second appareil a tenté d'émettre des positions pour cette embarcation "
                "alors qu'un autre appareil en assurait déjà le suivi."
            ),
        },
    )


async def evaluate_after_position(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> None:
    await evaluate_zone_interdite(
        db, position=position, embarcation_id=embarcation_id, a_la_date=a_la_date
    )
    await evaluate_sortie_limite(
        db, position=position, embarcation_id=embarcation_id, a_la_date=a_la_date
    )
    await evaluate_concentration(
        db, position=position, embarcation_id=embarcation_id, a_la_date=a_la_date
    )
    await evaluate_licence_pecheur(
        db, pecheur_id=None, embarcation_id=embarcation_id, reference=a_la_date
    )
    await evaluate_declaration_manquante(db, embarcation_id=embarcation_id, a_la_date=a_la_date)


async def evaluate_after_capture(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    position: PointGeoJSON | None = None,
    reference: datetime | None = None,
    espece: str | None = None,
    pecheur_id: UUID | None = None,
) -> None:
    if position is not None:
        await evaluate_zone_interdite(
            db, position=position, embarcation_id=embarcation_id, a_la_date=reference
        )
    await evaluate_tendance_embarcation(db, embarcation_id=embarcation_id, reference=reference)
    await evaluate_espece_protegee(
        db, espece=espece, embarcation_id=embarcation_id, reference=reference
    )
    await evaluate_licence_pecheur(
        db, pecheur_id=pecheur_id, embarcation_id=embarcation_id, reference=reference
    )
