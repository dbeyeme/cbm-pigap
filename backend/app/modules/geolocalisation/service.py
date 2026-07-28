"""Services M2 — positions GPS et trajectoires."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import bad_request, not_found
from app.db.enums import RoleUtilisateur, SourcePosition
from app.db.models import Embarcation, Pecheur, Position, Utilisateur
from app.modules.geolocalisation.gabon_routes import is_on_water, segment_stays_on_water
from app.modules.geolocalisation.geo import geojson_text_to_point, point_to_wkt
from app.modules.geolocalisation.schemas import (
    EmbarcationTrackRead,
    LicenceDossierRead,
    PositionBatchCreate,
    PositionCreate,
    PositionRead,
    TrajectorySegmentRead,
)
from app.schemas.common import PointGeoJSON


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


async def create_position(
    db: AsyncSession, user: Utilisateur, data: PositionCreate
) -> PositionRead:
    await _assert_can_access_embarcation(db, user, data.embarcation_id)
    _assert_on_water(data.position)
    now = datetime.now(UTC)
    row = Position(
        embarcation_id=data.embarcation_id,
        position=point_to_wkt(data.position),
        horodatage=data.horodatage,
        source=data.source or SourcePosition.mobile,
        synchronise_a=now,
    )
    db.add(row)
    await db.flush()
    from app.modules.alertes.service import evaluate_after_position

    await evaluate_after_position(
        db, position=data.position, embarcation_id=data.embarcation_id
    )
    await db.commit()
    await db.refresh(row)
    geo = await db.scalar(select(ST_AsGeoJSON(Position.position)).where(Position.id == row.id))
    return _to_read(row, geo)


async def create_positions_batch(
    db: AsyncSession, user: Utilisateur, data: PositionBatchCreate
) -> list[PositionRead]:
    if not data.positions:
        raise bad_request("Aucune position fournie", "EMPTY_BATCH")
    # Vérifier accès pour chaque embarcation distincte
    emb_ids = {p.embarcation_id for p in data.positions}
    for emb_id in emb_ids:
        await _assert_can_access_embarcation(db, user, emb_id)
    for item in data.positions:
        _assert_on_water(item.position)
    _assert_batch_no_land_crossing(data.positions)

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
            )
        )
    db.add_all(rows)
    await db.flush()
    from app.modules.alertes.service import evaluate_after_position

    for item in data.positions:
        await evaluate_after_position(
            db, position=item.position, embarcation_id=item.embarcation_id
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
    stmt = (
        select(Position, ST_AsGeoJSON(Position.position).label("position_geojson"))
        .where(Position.embarcation_id == embarcation_id)
        .order_by(Position.horodatage.asc())
    )
    if debut is not None:
        stmt = stmt.where(Position.horodatage >= debut)
    if fin is not None:
        stmt = stmt.where(Position.horodatage <= fin)
    result = await db.execute(stmt)
    rows = [_to_read(pos, geo) for pos, geo in result.all()]
    # Ne jamais renvoyer de points à terre / hors eau (historique anomal)
    return [r for r in rows if is_on_water(r.position.coordinates[0], r.position.coordinates[1])]


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
    result = await db.execute(select(Embarcation).order_by(Embarcation.nom).limit(2000))
    return list(result.scalars().all())


async def list_embarcations_tracked(
    db: AsyncSession, user: Utilisateur
) -> list[tuple[Embarcation, int, datetime | None]]:
    """Embarcations visibles + nombre de points GPS + dernière position."""
    emb_list = await list_embarcations_for_user(db, user)
    if not emb_list:
        return []
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

    emb_by_id = {e.id: e for e in emb_list}
    ids = list(emb_by_id.keys())
    result = await db.execute(
        select(Position, ST_AsGeoJSON(Position.position).label("position_geojson"))
        .where(Position.embarcation_id.in_(ids))
        .order_by(Position.embarcation_id, Position.horodatage.asc())
    )
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

    return LicenceDossierRead(
        pecheur_id=pecheur.id,
        nom=pecheur.nom,
        prenom=pecheur.prenom,
        numero_licence=pecheur.numero_licence,
        statut=pecheur.statut.value if hasattr(pecheur.statut, "value") else str(pecheur.statut),
        embarcations=tracked,
        trajectories=trajectories,
    )
