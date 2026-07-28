"""Services M5 — quotas & alertes de dépassement (§5.5)."""

from __future__ import annotations

from datetime import UTC, datetime, time
from uuid import UUID

from geoalchemy2.functions import ST_Intersects
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, not_found
from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte
from app.db.models import Alerte, Capture, Quota, ZoneReglementee
from app.modules.quotas.schemas import QuotaCreate, QuotaRead, QuotaUpdate


def _taux(autorise: float, consomme: float) -> float:
    if autorise <= 0:
        return 0.0
    return round(consomme / autorise, 4)


def to_read(quota: Quota) -> QuotaRead:
    return QuotaRead(
        id=quota.id,
        espece=quota.espece,
        zone_id=quota.zone_id,
        periode_debut=quota.periode_debut,
        periode_fin=quota.periode_fin,
        volume_autorise_kg=quota.volume_autorise_kg,
        volume_consomme_kg=quota.volume_consomme_kg,
        taux_consommation=_taux(quota.volume_autorise_kg, quota.volume_consomme_kg),
    )


def _normalize_espece(espece: str) -> str:
    return espece.strip().lower()


async def create_quota(db: AsyncSession, data: QuotaCreate) -> QuotaRead:
    if data.periode_fin < data.periode_debut:
        raise bad_request("periode_fin avant periode_debut", "QUOTA_PERIODE_INVALIDE")
    espece = _normalize_espece(data.espece)
    if data.zone_id is not None:
        zone = await db.get(ZoneReglementee, data.zone_id)
        if zone is None:
            raise not_found("Zone introuvable", "ZONE_NOT_FOUND")

    row = Quota(
        espece=espece,
        zone_id=data.zone_id,
        periode_debut=data.periode_debut,
        periode_fin=data.periode_fin,
        volume_autorise_kg=data.volume_autorise_kg,
        volume_consomme_kg=0.0,
    )
    db.add(row)
    await db.flush()
    await _recompute_quota(db, row)
    await db.commit()
    await db.refresh(row)
    return to_read(row)


async def list_quotas(
    db: AsyncSession,
    *,
    espece: str | None = None,
) -> list[QuotaRead]:
    stmt = select(Quota).order_by(Quota.periode_debut.desc(), Quota.espece)
    if espece:
        stmt = stmt.where(Quota.espece == _normalize_espece(espece))
    result = await db.execute(stmt)
    return [to_read(q) for q in result.scalars().all()]


async def get_quota(db: AsyncSession, quota_id: UUID) -> QuotaRead:
    quota = await db.get(Quota, quota_id)
    if quota is None:
        raise not_found("Quota introuvable", "QUOTA_NOT_FOUND")
    return to_read(quota)


async def update_quota(db: AsyncSession, quota_id: UUID, data: QuotaUpdate) -> QuotaRead:
    quota = await db.get(Quota, quota_id)
    if quota is None:
        raise not_found("Quota introuvable", "QUOTA_NOT_FOUND")

    payload = data.model_dump(exclude_unset=True)
    if "espece" in payload and payload["espece"] is not None:
        payload["espece"] = _normalize_espece(payload["espece"])
    if "zone_id" in payload and payload["zone_id"] is not None:
        zone = await db.get(ZoneReglementee, payload["zone_id"])
        if zone is None:
            raise not_found("Zone introuvable", "ZONE_NOT_FOUND")

    for key, value in payload.items():
        setattr(quota, key, value)

    if quota.periode_fin < quota.periode_debut:
        raise bad_request("periode_fin avant periode_debut", "QUOTA_PERIODE_INVALIDE")

    await _recompute_quota(db, quota)
    await db.commit()
    await db.refresh(quota)
    return to_read(quota)


async def delete_quota(db: AsyncSession, quota_id: UUID) -> None:
    quota = await db.get(Quota, quota_id)
    if quota is None:
        raise not_found("Quota introuvable", "QUOTA_NOT_FOUND")
    await db.delete(quota)
    await db.commit()


def _captures_sum_stmt(quota: Quota) -> Select:
    """Somme des captures matching espèce + période (+ zone optionnelle via ST_Intersects)."""
    start = datetime.combine(quota.periode_debut, time.min, tzinfo=UTC)
    end = datetime.combine(quota.periode_fin, time.max, tzinfo=UTC)
    stmt = select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(
        Capture.espece == quota.espece,
        Capture.date_capture >= start,
        Capture.date_capture <= end,
    )
    if quota.zone_id is not None:
        stmt = stmt.join(ZoneReglementee, ZoneReglementee.id == quota.zone_id).where(
            Capture.position_capture.is_not(None),
            ST_Intersects(Capture.position_capture, ZoneReglementee.geometrie),
        )
    return stmt


async def _recompute_quota(db: AsyncSession, quota: Quota) -> list[Alerte]:
    """Met à jour volume_consomme_kg et émet alertes 90 % / 100 % si besoin."""
    result = await db.execute(_captures_sum_stmt(quota))
    consomme = float(result.scalar_one() or 0.0)
    quota.volume_consomme_kg = round(consomme, 3)
    await db.flush()
    return await _emit_threshold_alerts(db, quota)


async def _has_seuil_alert(db: AsyncSession, quota_id: UUID, seuil: float) -> bool:
    # Comparaison texte JSONB — seuils stockés en nombre JSON (0.9 / 1.0)
    result = await db.execute(
        select(Alerte.id)
        .where(
            Alerte.type == TypeAlerte.depassement_quota,
            Alerte.declencheur["quota_id"].as_string() == str(quota_id),
            Alerte.declencheur["seuil"].as_string() == str(seuil),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _emit_threshold_alerts(db: AsyncSession, quota: Quota) -> list[Alerte]:
    taux = _taux(quota.volume_autorise_kg, quota.volume_consomme_kg)
    created: list[Alerte] = []

    thresholds: list[tuple[float, NiveauGravite]] = [
        (0.9, NiveauGravite.attention),
        (1.0, NiveauGravite.critique),
    ]
    for seuil, gravite in thresholds:
        if taux + 1e-9 < seuil:
            continue
        if await _has_seuil_alert(db, quota.id, seuil):
            continue
        alerte = Alerte(
            type=TypeAlerte.depassement_quota,
            niveau_gravite=gravite,
            embarcation_id=None,
            declencheur={
                "regle": "quota_seuil",
                "quota_id": str(quota.id),
                "espece": quota.espece,
                "zone_id": str(quota.zone_id) if quota.zone_id else None,
                "seuil": seuil,
                "taux": taux,
                "volume_autorise_kg": quota.volume_autorise_kg,
                "volume_consomme_kg": quota.volume_consomme_kg,
                "periode_debut": quota.periode_debut.isoformat(),
                "periode_fin": quota.periode_fin.isoformat(),
            },
            statut=StatutAlerte.nouvelle,
        )
        db.add(alerte)
        created.append(alerte)

    if created:
        await db.flush()
    return created


async def refresh_quotas_for_especes(
    db: AsyncSession, especes: set[str]
) -> list[Alerte]:
    """Recalcule tous les quotas touchés par un ensemble d'espèces (après capture)."""
    if not especes:
        return []
    normalized = {_normalize_espece(e) for e in especes}
    result = await db.execute(select(Quota).where(Quota.espece.in_(normalized)))
    alertes: list[Alerte] = []
    for quota in result.scalars().all():
        alertes.extend(await _recompute_quota(db, quota))
    return alertes


async def list_quota_alertes(
    db: AsyncSession,
    *,
    statut: StatutAlerte | None = None,
    limit: int = 50,
) -> list[Alerte]:
    stmt = (
        select(Alerte)
        .where(Alerte.type == TypeAlerte.depassement_quota)
        .order_by(Alerte.horodatage.desc())
        .limit(min(limit, 200))
    )
    if statut is not None:
        stmt = stmt.where(Alerte.statut == statut)
    result = await db.execute(stmt)
    return list(result.scalars().all())
