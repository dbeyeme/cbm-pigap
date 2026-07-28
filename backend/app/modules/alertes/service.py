"""Services M7 — règles d'alertes explicites (§5.7)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from geoalchemy2.functions import ST_Intersects
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found
from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte, TypeZone
from app.db.models import Alerte, Capture, ZoneReglementee
from app.modules.alertes.schemas import AlerteRead, AlerteUpdateStatut
from app.modules.geolocalisation.geo import point_to_wkt
from app.schemas.common import PointGeoJSON


def to_read(row: Alerte) -> AlerteRead:
    return AlerteRead.model_validate(row)


async def list_alertes(
    db: AsyncSession,
    *,
    type_alerte: TypeAlerte | None = None,
    statut: StatutAlerte | None = None,
    embarcation_id: UUID | None = None,
    limit: int = 100,
) -> list[AlerteRead]:
    stmt = select(Alerte).order_by(Alerte.horodatage.desc()).limit(min(limit, 500))
    if type_alerte is not None:
        stmt = stmt.where(Alerte.type == type_alerte)
    if statut is not None:
        stmt = stmt.where(Alerte.statut == statut)
    if embarcation_id is not None:
        stmt = stmt.where(Alerte.embarcation_id == embarcation_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [to_read(r) for r in rows]


async def update_statut(
    db: AsyncSession, alerte_id: UUID, data: AlerteUpdateStatut
) -> AlerteRead:
    row = await db.get(Alerte, alerte_id)
    if row is None:
        raise not_found("Alerte introuvable", "ALERTE_NOT_FOUND")
    row.statut = data.statut
    await db.commit()
    await db.refresh(row)
    return to_read(row)


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


async def evaluate_after_position(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
) -> None:
    await evaluate_zone_interdite(
        db, position=position, embarcation_id=embarcation_id
    )


async def evaluate_after_capture(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    position: PointGeoJSON | None = None,
    reference: datetime | None = None,
) -> None:
    if position is not None:
        await evaluate_zone_interdite(
            db, position=position, embarcation_id=embarcation_id, a_la_date=reference
        )
    await evaluate_tendance_embarcation(
        db, embarcation_id=embarcation_id, reference=reference
    )
