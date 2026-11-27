"""Services M2 — positions GPS et trajectoires."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import bad_request, not_found
from app.core.log_acces import enregistrer as journaliser_acces
from app.db.enums import RoleUtilisateur, SourcePosition
from app.db.models import Embarcation, Pecheur, Position, Utilisateur
from app.modules.geolocalisation.gabon_routes import is_on_water, segment_stays_on_water
from app.modules.geolocalisation.geo import geojson_text_to_point, point_to_wkt
from app.modules.geolocalisation.schemas import (
    BaliseIngestPayload,
    BaliseIngestResult,
    EmbarcationTrackRead,
    LicenceDossierRead,
    LiveVesselRead,
    PositionBatchCreate,
    PositionCreate,
    PositionRead,
    TrajectorySegmentRead,
)
from app.modules.perimetre.filtre import (
    agent_id_pour_filtre,
    au_moins_une_zone_active,
    clause_point_dans_emprise_active,
)
from app.schemas.common import PointGeoJSON

logger = structlog.get_logger(__name__)


def _stmt_filtre_perimetre(stmt, user: Utilisateur | None = None):
    clause = clause_point_dans_emprise_active(
        Position.position, agent_id=agent_id_pour_filtre(user)
    )
    if clause is not None:
        return stmt.where(clause)
    return stmt


async def _get_embarcation(db: AsyncSession, embarcation_id: UUID) -> Embarcation:
    emb = await db.get(Embarcation, embarcation_id)
    if emb is None:
        raise not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
    return emb


async def _assert_can_access_embarcation(
    db: AsyncSession, user: Utilisateur, embarcation_id: UUID
) -> Embarcation:
    emb = await _get_embarcation(db, embarcation_id)
    if user.role in (
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.admin,
        RoleUtilisateur.autorite,
        RoleUtilisateur.chercheur,
    ):
        return emb
    if user.role == RoleUtilisateur.pecheur:
        result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
        pecheur = result.scalar_one_or_none()
        if pecheur is None or emb.pecheur_id != pecheur.id:
            raise not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
        return emb
    raise bad_request("Rôle non autorisé pour la géolocalisation", "ROLE_FORBIDDEN")


async def _assert_pecheur_abonnement_write(
    db: AsyncSession, user: Utilisateur, embarcation_id: UUID
) -> None:
    """Si enforcement actif, un pêcheur doit avoir un abonnement (ou couverture flotte)."""
    if user.role != RoleUtilisateur.pecheur:
        return
    result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
    pecheur = result.scalar_one_or_none()
    if pecheur is None:
        return
    from app.modules.abonnements import service as abo_service

    await abo_service.assert_pecheur_couvert(db, pecheur.id)


def _to_read(position: Position, geojson_raw: str | None) -> PositionRead:
    point = geojson_text_to_point(geojson_raw)
    if point is None:
        point = PointGeoJSON(coordinates=(0.0, 0.0))
    return PositionRead(
        id=position.id,
        embarcation_id=position.embarcation_id,
        position=point,
        horodatage=position.horodatage,
        source=position.source,
        synchronise_a=position.synchronise_a,
    )


def _assert_on_water(point: PointGeoJSON) -> None:
    lon, lat = point.coordinates
    if not is_on_water(lon, lat):
        raise bad_request(
            "Position refusée : une embarcation de pêche doit être en mer, "
            "bras de mer ou fleuve (Ogooué, Ntem, Estuaire) — pas en ville / à terre. "
            "Utilisez un corridor de démo ou un GPS réel en zone d'eau gabonaise.",
            "POSITION_HORS_EAU",
        )


def _assert_batch_no_land_crossing(positions: list[PositionCreate]) -> None:
    """Interdit un saut terrestre entre deux points d'une même embarcation."""
    by_emb: dict[UUID, list[PositionCreate]] = {}
    for item in positions:
        by_emb.setdefault(item.embarcation_id, []).append(item)
    for items in by_emb.values():
        ordered = sorted(items, key=lambda p: p.horodatage)
        for i in range(len(ordered) - 1):
            a = ordered[i].position.coordinates
            b = ordered[i + 1].position.coordinates
            if not segment_stays_on_water(a, b):
                raise bad_request(
                    "Trajectoire refusée : le segment entre deux positions traverse "
                    "la terre ferme (pas de passage en eau). Corrigez le parcours "
                    "(mer, bras de mer ou fleuve).",
                    "TRAJECTOIRE_PASSAGE_TERRESTRE",
                )


async def _appareil_emetteur(
    db: AsyncSession,
    user: Utilisateur,
    appareil_brut: str | None,
    releves: list[tuple[UUID, datetime]],
):
    """Appareil rattaché qui envoie ces relevés (ADR-012), ou rien s'il n'y en a pas.

    Pour un pêcheur : 403 si l'appareil n'est pas rattaché à son compte, 409 et
    alerte si un autre appareil suit déjà l'embarcation. Les autres rôles, les
    balises et l'ancienne application sans en-tête ne sont pas concernés.
    """
    from app.modules.appareils import service as appareils_service

    appareil = await appareils_service.appareil_pour_envoi(db, user, appareil_brut)
    if appareil is not None:
        await appareils_service.verifier_exclusivite(db, appareil, releves)
        appareils_service.marquer_utilisation(appareil)
    return appareil


async def create_position(
    db: AsyncSession,
    user: Utilisateur,
    data: PositionCreate,
    *,
    appareil_brut: str | None = None,
) -> PositionRead:
    await _assert_can_access_embarcation(db, user, data.embarcation_id)
    await _assert_pecheur_abonnement_write(db, user, data.embarcation_id)
    _assert_on_water(data.position)
    appareil = await _appareil_emetteur(
        db, user, appareil_brut, [(data.embarcation_id, data.horodatage)]
    )
    now = datetime.now(UTC)
    row = Position(
        embarcation_id=data.embarcation_id,
        position=point_to_wkt(data.position),
        horodatage=data.horodatage,
        source=data.source or SourcePosition.mobile,
        synchronise_a=now,
        appareil_id=appareil.id if appareil is not None else None,
    )
    db.add(row)
    await db.flush()
    from app.modules.alertes.service import evaluate_after_position

    await evaluate_after_position(
        db,
        position=data.position,
        embarcation_id=data.embarcation_id,
        a_la_date=data.horodatage,
    )
    await db.commit()
    await db.refresh(row)
    geo = await db.scalar(select(ST_AsGeoJSON(Position.position)).where(Position.id == row.id))
    return _to_read(row, geo)


async def create_positions_batch(
    db: AsyncSession,
    user: Utilisateur,
    data: PositionBatchCreate,
    *,
    appareil_brut: str | None = None,
) -> list[PositionRead]:
    if not data.positions:
        raise bad_request("Aucune position fournie", "EMPTY_BATCH")
    # Vérifier accès pour chaque embarcation distincte
    emb_ids = {p.embarcation_id for p in data.positions}
    for emb_id in emb_ids:
        await _assert_can_access_embarcation(db, user, emb_id)
        await _assert_pecheur_abonnement_write(db, user, emb_id)
    for item in data.positions:
        _assert_on_water(item.position)
    _assert_batch_no_land_crossing(data.positions)
    appareil = await _appareil_emetteur(
        db, user, appareil_brut, [(p.embarcation_id, p.horodatage) for p in data.positions]
    )
    appareil_id = appareil.id if appareil is not None else None

    now = datetime.now(UTC)
    rows: list[Position] = []
    for item in data.positions:
        rows.append(
            Position(
                embarcation_id=item.embarcation_id,
                position=point_to_wkt(item.position),
                horodatage=item.horodatage,
                source=item.source or SourcePosition.mobile,
                synchronise_a=now,
                appareil_id=appareil_id,
            )
        )
    db.add_all(rows)
    await db.flush()
    from app.modules.alertes.service import evaluate_after_position

    for item in data.positions:
        await evaluate_after_position(
            db,
            position=item.position,
            embarcation_id=item.embarcation_id,
            a_la_date=item.horodatage,
        )
    await db.commit()
    for row in rows:
        await db.refresh(row)

    ids = [r.id for r in rows]
    result = await db.execute(
        select(Position, ST_AsGeoJSON(Position.position).label("position_geojson")).where(
            Position.id.in_(ids)
        )
    )
    by_id = {pos.id: (pos, geo) for pos, geo in result.all()}
    ordered: list[PositionRead] = []
    for row in rows:
        pos, geo = by_id[row.id]
        ordered.append(_to_read(pos, geo))
    return ordered


async def get_trajectory(
    db: AsyncSession,
    user: Utilisateur,
    *,
    embarcation_id: UUID,
    debut: datetime | None = None,
    fin: datetime | None = None,
) -> list[PositionRead]:
    await _assert_can_access_embarcation(db, user, embarcation_id)
    if not await au_moins_une_zone_active(db):
        return []
    stmt = (
        select(Position, ST_AsGeoJSON(Position.position).label("position_geojson"))
        .where(Position.embarcation_id == embarcation_id)
        .order_by(Position.horodatage.asc())
    )
    if debut is not None:
        stmt = stmt.where(Position.horodatage >= debut)
    if fin is not None:
        stmt = stmt.where(Position.horodatage <= fin)
    stmt = _stmt_filtre_perimetre(stmt, user)
    result = await db.execute(stmt)
    rows = [_to_read(pos, geo) for pos, geo in result.all()]
    # Ne jamais renvoyer de points à terre / hors eau (historique anomal)
    out = [r for r in rows if is_on_water(r.position.coordinates[0], r.position.coordinates[1])]
    if user.role != RoleUtilisateur.pecheur:
        await journaliser_acces(
            db,
            utilisateur_id=user.id,
            ressource="geoloc_trajectoire",
            action="consultation",
            detail=f"embarcation={embarcation_id};points={len(out)}",
            commit=True,
        )
    return out


async def list_embarcations_for_user(db: AsyncSession, user: Utilisateur) -> list[Embarcation]:
    if user.role == RoleUtilisateur.pecheur:
        result = await db.execute(
            select(Embarcation)
            .join(Pecheur, Embarcation.pecheur_id == Pecheur.id)
            .where(Pecheur.utilisateur_id == user.id)
            .options(selectinload(Embarcation.pecheur))
            .order_by(Embarcation.nom)
        )
        return list(result.scalars().all())
    # Toute la flotte pour les rôles de pilotage : un plafond tronquait la liste par
    # ordre alphabétique et faisait disparaître des embarcations du suivi sans message.
    result = await db.execute(select(Embarcation).order_by(Embarcation.nom))
    return list(result.scalars().all())


async def list_embarcations_tracked(
    db: AsyncSession, user: Utilisateur
) -> list[tuple[Embarcation, int, datetime | None]]:
    """Embarcations visibles + nombre de points GPS + dernière position."""
    emb_list = await list_embarcations_for_user(db, user)
    if not emb_list:
        return []
    ids = [e.id for e in emb_list]
    stats_stmt = (
        select(
            Position.embarcation_id,
            func.count(Position.id),
            func.max(Position.horodatage),
        )
        .where(Position.embarcation_id.in_(ids))
        .group_by(Position.embarcation_id)
    )
    stats_stmt = _stmt_filtre_perimetre(stats_stmt, user)
    stats = await db.execute(stats_stmt)
    by_id = {row[0]: (int(row[1]), row[2]) for row in stats.all()}
    out: list[tuple[Embarcation, int, datetime | None]] = []
    for emb in emb_list:
        count, last = by_id.get(emb.id, (0, None))
        out.append((emb, count, last))
    return out


async def clear_positions_for_embarcation(
    db: AsyncSession, user: Utilisateur, embarcation_id: UUID
) -> int:
    """Efface l'historique GPS d'une embarcation (nettoyage démo / anomalies)."""
    await _assert_can_access_embarcation(db, user, embarcation_id)
    result = await db.execute(
        delete(Position).where(Position.embarcation_id == embarcation_id).returning(Position.id)
    )
    deleted = len(result.all())
    await db.commit()
    return deleted


def _segment_points(points: list[PositionRead], *, gap_hours: float) -> list[list[PositionRead]]:
    """Découpe une série chrono en sorties (écart > gap_hours = nouvelle trajectoire)."""
    if not points:
        return []
    gap = timedelta(hours=gap_hours)
    segments: list[list[PositionRead]] = [[points[0]]]
    for point in points[1:]:
        prev = segments[-1][-1]
        delta = point.horodatage - prev.horodatage
        if delta > gap:
            segments.append([point])
        else:
            segments[-1].append(point)
    return segments


async def list_trajectory_segments(
    db: AsyncSession,
    user: Utilisateur,
    *,
    gap_hours: float = 2.0,
    embarcation_id: UUID | None = None,
) -> list[TrajectorySegmentRead]:
    """Toutes les trajectoires (plusieurs sorties possibles par bateau/pirogue)."""
    if embarcation_id is not None:
        emb = await _assert_can_access_embarcation(db, user, embarcation_id)
        emb_list = [emb]
    else:
        emb_list = await list_embarcations_for_user(db, user)
    if not emb_list:
        return []
    if not await au_moins_une_zone_active(db):
        return []

    emb_by_id = {e.id: e for e in emb_list}
    ids = list(emb_by_id.keys())
    traj_stmt = (
        select(Position, ST_AsGeoJSON(Position.position).label("position_geojson"))
        .where(Position.embarcation_id.in_(ids))
        .order_by(Position.embarcation_id, Position.horodatage.asc())
    )
    traj_stmt = _stmt_filtre_perimetre(traj_stmt, user)
    result = await db.execute(traj_stmt)
    by_emb: dict[UUID, list[PositionRead]] = {eid: [] for eid in ids}
    for pos, geo in result.all():
        read = _to_read(pos, geo)
        if is_on_water(read.position.coordinates[0], read.position.coordinates[1]):
            by_emb[pos.embarcation_id].append(read)

    out: list[TrajectorySegmentRead] = []
    for eid, pts in by_emb.items():
        emb = emb_by_id[eid]
        for idx, segment in enumerate(_segment_points(pts, gap_hours=gap_hours), start=1):
            if not segment:
                continue
            debut = segment[0].horodatage
            fin = segment[-1].horodatage
            out.append(
                TrajectorySegmentRead(
                    id=f"{eid}:{idx}:{debut.isoformat()}",
                    embarcation_id=eid,
                    embarcation_nom=emb.nom,
                    immatriculation=emb.immatriculation,
                    type=emb.type,
                    index=idx,
                    debut=debut,
                    fin=fin,
                    points_count=len(segment),
                    points=segment,
                )
            )
    out.sort(key=lambda t: t.debut, reverse=True)
    return out


def _classify_secteur(lon: float, lat: float) -> str:
    """Classification indicative côte / bras de mer / fleuve (Gabon)."""
    if lon >= 10.0 or lat >= 1.5 or (lon >= 9.7 and lat <= -0.25):
        return "fleuve"
    if 9.15 <= lon <= 9.55 and -0.15 <= lat <= 1.05:
        return "bras_mer"
    return "cote"


def _live_statut(age_seconds: int) -> str:
    if age_seconds < 5 * 60:
        return "actif"
    if age_seconds < 30 * 60:
        return "recent"
    return "silence"


async def list_live_vessels(
    db: AsyncSession,
    user: Utilisateur,
    *,
    since_minutes: int = 360,
) -> list[LiveVesselRead]:
    """Dernière position (eau) par embarcation dans la fenêtre."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(minutes=since_minutes)
    emb_list = await list_embarcations_for_user(db, user)
    if not emb_list:
        return []
    if not await au_moins_une_zone_active(db):
        return []
    emb_by_id = {e.id: e for e in emb_list}
    ids = list(emb_by_id.keys())
    latest_base = select(
        Position.embarcation_id,
        func.max(Position.horodatage).label("max_h"),
    ).where(Position.embarcation_id.in_(ids), Position.horodatage >= cutoff)
    latest_base = _stmt_filtre_perimetre(latest_base, user)
    latest = latest_base.group_by(Position.embarcation_id).subquery()
    live_stmt = (
        select(Position, ST_AsGeoJSON(Position.position).label("position_geojson"))
        .join(
            latest,
            (Position.embarcation_id == latest.c.embarcation_id)
            & (Position.horodatage == latest.c.max_h),
        )
        .order_by(Position.horodatage.desc())
    )
    live_stmt = _stmt_filtre_perimetre(live_stmt, user)
    result = await db.execute(live_stmt)
    from app.modules.geolocalisation.regles_carte import age_libelle, regle_carte
    from app.modules.geolocalisation.regularite import regularite_embarcations

    retenus = []
    for pos, geo in result.all():
        read = _to_read(pos, geo)
        lon, lat = read.position.coordinates
        if is_on_water(lon, lat):
            retenus.append((emb_by_id[pos.embarcation_id], read))
    # Régularité de toutes les embarcations affichées, en quelques requêtes (lot 4).
    # Calcul impossible (paramétrage illisible, base) : la carte s'affiche sans couleur
    # de régularité plutôt que de tomber entière, et l'anomalie est journalisée.
    carte = None
    regularites: list = [None] * len(retenus)
    try:
        carte, _alertes, _entete = regle_carte()
        regularites = await regularite_embarcations(
            db,
            [emb for emb, _ in retenus],
            [read.position.coordinates for _, read in retenus],
            now,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("carte_regularite_indisponible", cause=type(exc).__name__)
        carte = None
        await db.rollback()
    out: list[LiveVesselRead] = []
    for (emb, read), reg in zip(retenus, regularites, strict=True):
        lon, lat = read.position.coordinates
        age = max(0, int((now - read.horodatage.astimezone(UTC)).total_seconds()))
        out.append(
            LiveVesselRead(
                embarcation_id=emb.id,
                nom=emb.nom,
                immatriculation=emb.immatriculation,
                type=emb.type,
                position=read.position,
                horodatage=read.horodatage,
                source=read.source,
                age_seconds=age,
                statut=_live_statut(age),
                secteur=_classify_secteur(lon, lat),
                age_libelle=age_libelle(age),
                perimee=bool(carte and age > carte.positions_age_perimee_minutes * 60),
                regularite=reg.code if reg and carte else None,
                regularite_libelle=carte.libelle(reg.code) if reg and carte else None,
                motifs=reg.motifs if reg and carte else [],
            )
        )
    out.sort(key=lambda v: v.horodatage, reverse=True)
    return out


async def get_dossier_by_licence(
    db: AsyncSession, user: Utilisateur, *, licence: str
) -> LicenceDossierRead:
    """Dossier pêcheur par n° de licence + trajectoires des embarcations."""
    term = licence.strip()
    if not term:
        raise bad_request("Numéro de licence requis", "LICENCE_REQUIRED")
    result = await db.execute(select(Pecheur).where(Pecheur.numero_licence.ilike(term)))
    pecheur = result.scalar_one_or_none()
    if pecheur is None:
        # recherche partielle
        result = await db.execute(
            select(Pecheur)
            .where(Pecheur.numero_licence.ilike(f"%{term}%"))
            .order_by(Pecheur.numero_licence)
            .limit(1)
        )
        pecheur = result.scalar_one_or_none()
    if pecheur is None:
        raise not_found("Licence introuvable", "LICENCE_NOT_FOUND")

    # §7 : un pêcheur ne voit que son propre dossier
    if user.role == RoleUtilisateur.pecheur:
        own = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
        me = own.scalar_one_or_none()
        if me is None or me.id != pecheur.id:
            raise not_found("Licence introuvable", "LICENCE_NOT_FOUND")

    emb_result = await db.execute(
        select(Embarcation).where(Embarcation.pecheur_id == pecheur.id).order_by(Embarcation.nom)
    )
    emb_list = list(emb_result.scalars().all())
    tracked: list[EmbarcationTrackRead] = []
    if emb_list:
        ids = [e.id for e in emb_list]
        stats = await db.execute(
            select(
                Position.embarcation_id,
                func.count(Position.id),
                func.max(Position.horodatage),
            )
            .where(Position.embarcation_id.in_(ids))
            .group_by(Position.embarcation_id)
        )
        by_id = {row[0]: (int(row[1]), row[2]) for row in stats.all()}
        for emb in emb_list:
            count, last = by_id.get(emb.id, (0, None))
            tracked.append(
                EmbarcationTrackRead(
                    id=emb.id,
                    pecheur_id=emb.pecheur_id,
                    nom=emb.nom,
                    immatriculation=emb.immatriculation,
                    type=emb.type,
                    positions_count=count,
                    derniere_position_a=last,
                )
            )

    trajectories: list[TrajectorySegmentRead] = []
    for emb in emb_list:
        trajectories.extend(await list_trajectory_segments(db, user, embarcation_id=emb.id))
    trajectories.sort(key=lambda t: t.debut, reverse=True)

    if user.role != RoleUtilisateur.pecheur:
        await journaliser_acces(
            db,
            utilisateur_id=user.id,
            ressource="geoloc_dossier",
            action="consultation",
            detail=f"licence={pecheur.numero_licence};pecheur={pecheur.id}",
            commit=True,
        )

    return LicenceDossierRead(
        pecheur_id=pecheur.id,
        nom=pecheur.nom,
        prenom=pecheur.prenom,
        numero_licence=pecheur.numero_licence,
        statut=pecheur.statut.value if hasattr(pecheur.statut, "value") else str(pecheur.statut),
        embarcations=tracked,
        trajectories=trajectories,
    )


# --- Ingestion des balises satellitaires (ADR-009, source=balise) ---


async def ingest_balises(db: AsyncSession, payload: BaliseIngestPayload) -> BaliseIngestResult:
    """Intègre un lot de messages de balises comme positions `source=balise`.

    Règles : balise inconnue ignorée (listée) ; position à terre ignorée ;
    doublon (même embarcation, même horodatage, même source) ignoré ;
    message avec `alerte` → alerte critique « détresse » (type anomalie).
    Les règles métier (zone interdite, limite, concentration…) s'appliquent
    comme pour une position mobile.
    """
    ids = sorted({m.balise_id.strip() for m in payload.messages})
    result = await db.execute(select(Embarcation).where(Embarcation.balise_id.in_(ids)))
    by_balise = {e.balise_id: e for e in result.scalars().all()}

    now = datetime.now(UTC)
    integres = doublons = hors_eau = detresse = 0
    inconnues: set[str] = set()
    for msg in sorted(payload.messages, key=lambda m: m.horodatage):
        balise_id = msg.balise_id.strip()
        emb = by_balise.get(balise_id)
        if emb is None:
            inconnues.add(balise_id)
            continue
        if not is_on_water(msg.lon, msg.lat):
            hors_eau += 1
            continue
        existing = await db.scalar(
            select(Position.id).where(
                Position.embarcation_id == emb.id,
                Position.horodatage == msg.horodatage,
                Position.source == SourcePosition.balise,
            )
        )
        if existing is not None:
            doublons += 1
            continue
        point = PointGeoJSON(coordinates=(msg.lon, msg.lat))
        db.add(
            Position(
                embarcation_id=emb.id,
                position=point_to_wkt(point),
                horodatage=msg.horodatage,
                source=SourcePosition.balise,
                synchronise_a=now,
            )
        )
        await db.flush()
        integres += 1

        from app.modules.alertes.service import evaluate_after_position, signaler_detresse

        await evaluate_after_position(
            db, position=point, embarcation_id=emb.id, a_la_date=msg.horodatage
        )
        if msg.alerte:
            created = await signaler_detresse(
                db,
                embarcation_id=emb.id,
                position=point,
                a_la_date=msg.horodatage,
                origine=f"balise:{payload.fournisseur}:{balise_id}",
            )
            if created is not None:
                detresse += 1
    await db.commit()
    return BaliseIngestResult(
        recus=len(payload.messages),
        integres=integres,
        doublons=doublons,
        hors_eau=hors_eau,
        balises_inconnues=sorted(inconnues),
        alertes_detresse=detresse,
    )
