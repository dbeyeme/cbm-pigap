"""Services M4 — déclaration & sync offline des captures (§5.4)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, bad_request, conflict, not_found
from app.db.enums import RoleUtilisateur
from app.db.models import Capture, Embarcation, Pecheur, Utilisateur
from app.modules.captures.schemas import (
    CaptureCreate,
    CaptureRead,
    CaptureSyncBatch,
    CaptureSyncResult,
    CaptureUpdate,
)
from app.modules.geolocalisation.geo import geojson_text_to_point, point_to_wkt
from app.schemas.common import PointGeoJSON


async def _get_pecheur_for_user(db: AsyncSession, user: Utilisateur) -> Pecheur | None:
    result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
    return result.scalar_one_or_none()


async def _assert_can_write_capture(
    db: AsyncSession, user: Utilisateur, pecheur_id: UUID, embarcation_id: UUID
) -> Embarcation:
    emb = await db.get(Embarcation, embarcation_id)
    if emb is None:
        raise not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
    if emb.pecheur_id != pecheur_id:
        raise bad_request(
            "L'embarcation n'appartient pas à ce pêcheur",
            "EMBARCATION_PECHEUR_MISMATCH",
        )

    if user.role in (
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.admin,
        RoleUtilisateur.autorite,
    ):
        return emb

    if user.role == RoleUtilisateur.pecheur:
        own = await _get_pecheur_for_user(db, user)
        if own is None or own.id != pecheur_id:
            raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
        from app.modules.abonnements import service as abo_service

        await abo_service.assert_pecheur_couvert(db, pecheur_id)
        return emb

    raise bad_request("Rôle non autorisé pour déclarer une capture", "ROLE_FORBIDDEN")


async def _assert_can_read(db: AsyncSession, user: Utilisateur, capture: Capture) -> None:
    if user.role in (
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.admin,
        RoleUtilisateur.autorite,
        RoleUtilisateur.chercheur,
    ):
        return
    if user.role == RoleUtilisateur.pecheur:
        own = await _get_pecheur_for_user(db, user)
        if own is not None and own.id == capture.pecheur_id:
            return
        raise not_found("Capture introuvable", "CAPTURE_NOT_FOUND")
    raise bad_request("Rôle non autorisé", "ROLE_FORBIDDEN")


def _to_read(capture: Capture, geojson_raw: str | None) -> CaptureRead:
    point: PointGeoJSON | None = geojson_text_to_point(geojson_raw)
    return CaptureRead(
        id=capture.id,
        pecheur_id=capture.pecheur_id,
        embarcation_id=capture.embarcation_id,
        espece=capture.espece,
        quantite_kg=capture.quantite_kg,
        methode=capture.methode,
        position_capture=point,
        point_debarquement=capture.point_debarquement,
        date_capture=capture.date_capture,
        synchronise_a=capture.synchronise_a,
    )


async def _load_read(db: AsyncSession, capture_id: UUID) -> CaptureRead:
    result = await db.execute(
        select(Capture, ST_AsGeoJSON(Capture.position_capture).label("geo")).where(
            Capture.id == capture_id
        )
    )
    row = result.one()
    return _to_read(row[0], row[1])


def _build_row(data: CaptureCreate, *, now: datetime) -> Capture:
    capture_id = data.id or uuid.uuid4()
    geom = point_to_wkt(data.position_capture) if data.position_capture else None
    return Capture(
        id=capture_id,
        pecheur_id=data.pecheur_id,
        embarcation_id=data.embarcation_id,
        espece=data.espece,
        quantite_kg=data.quantite_kg,
        methode=data.methode,
        position_capture=geom,
        point_debarquement=data.point_debarquement,
        date_capture=data.date_capture,
        synchronise_a=now,
    )


async def create_capture(
    db: AsyncSession, user: Utilisateur, data: CaptureCreate
) -> CaptureRead:
    await _assert_can_write_capture(db, user, data.pecheur_id, data.embarcation_id)
    now = datetime.now(UTC)

    if data.id is not None:
        existing = await db.get(Capture, data.id)
        if existing is not None:
            # Anti-IDOR : ne renvoyer que si le client est autorisé sur CET enregistrement
            # et que l'idempotence porte sur le même pêcheur / embarcation.
            if (
                existing.pecheur_id != data.pecheur_id
                or existing.embarcation_id != data.embarcation_id
            ):
                raise conflict(
                    "Identifiant de capture déjà utilisé pour une autre déclaration",
                    "CAPTURE_ID_CONFLICT",
                )
            await _assert_can_read(db, user, existing)
            return await _load_read(db, existing.id)

    row = _build_row(data, now=now)
    db.add(row)
    await db.flush()
    from app.modules.alertes.service import evaluate_after_capture
    from app.modules.quotas.service import refresh_quotas_for_especes

    await refresh_quotas_for_especes(db, {row.espece})
    await evaluate_after_capture(
        db,
        embarcation_id=row.embarcation_id,
        position=data.position_capture,
        reference=row.date_capture,
    )
    await db.commit()
    return await _load_read(db, row.id)


async def sync_captures(
    db: AsyncSession, user: Utilisateur, batch: CaptureSyncBatch
) -> CaptureSyncResult:
    """Sync offline : accepte / dédoublonne / rejette sans perdre le reste du lot."""
    accepts: list[UUID] = []
    duplicates: list[UUID] = []
    rejects: list[dict] = []
    touched_especes: set[str] = set()
    now = datetime.now(UTC)

    for item in batch.captures:
        client_id = item.id
        try:
            await _assert_can_write_capture(
                db, user, item.pecheur_id, item.embarcation_id
            )
            if client_id is not None:
                existing = await db.get(Capture, client_id)
                if existing is not None:
                    if (
                        existing.pecheur_id != item.pecheur_id
                        or existing.embarcation_id != item.embarcation_id
                    ):
                        raise conflict(
                            "Identifiant de capture déjà utilisé pour une autre déclaration",
                            "CAPTURE_ID_CONFLICT",
                        )
                    await _assert_can_read(db, user, existing)
                    duplicates.append(client_id)
                    continue
            row = _build_row(item, now=now)
            db.add(row)
            await db.flush()
            accepts.append(row.id)
            touched_especes.add(row.espece)
            from app.modules.alertes.service import evaluate_after_capture

            await evaluate_after_capture(
                db,
                embarcation_id=row.embarcation_id,
                position=item.position_capture,
                reference=row.date_capture,
            )
        except ApiError as exc:
            rejects.append(
                {
                    "id": str(client_id) if client_id else None,
                    "detail": exc.detail,
                    "code": exc.code,
                }
            )
        except Exception as exc:  # validation résiduelle
            rejects.append(
                {
                    "id": str(client_id) if client_id else None,
                    "detail": str(exc),
                    "code": "SYNC_REJECTED",
                }
            )

    if touched_especes:
        from app.modules.quotas.service import refresh_quotas_for_especes

        await refresh_quotas_for_especes(db, touched_especes)

    await db.commit()
    return CaptureSyncResult(accepts=accepts, duplicates=duplicates, rejects=rejects)


async def get_capture(db: AsyncSession, user: Utilisateur, capture_id: UUID) -> CaptureRead:
    result = await db.execute(
        select(Capture, ST_AsGeoJSON(Capture.position_capture).label("geo")).where(
            Capture.id == capture_id
        )
    )
    row = result.one_or_none()
    if row is None:
        raise not_found("Capture introuvable", "CAPTURE_NOT_FOUND")
    await _assert_can_read(db, user, row[0])
    return _to_read(row[0], row[1])


async def _get_capture_row(db: AsyncSession, capture_id: UUID) -> Capture:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise not_found("Capture introuvable", "CAPTURE_NOT_FOUND")
    return capture


async def update_capture(
    db: AsyncSession, user: Utilisateur, capture_id: UUID, data: CaptureUpdate
) -> CaptureRead:
    capture = await _get_capture_row(db, capture_id)
    # Pêcheur : uniquement ses captures ; agent/autorité/admin : toutes
    await _assert_can_write_capture(
        db, user, capture.pecheur_id, capture.embarcation_id
    )

    payload = data.model_dump(exclude_unset=True)
    new_pecheur_id = payload.get("pecheur_id", capture.pecheur_id)
    new_embarcation_id = payload.get("embarcation_id", capture.embarcation_id)
    if "pecheur_id" in payload or "embarcation_id" in payload:
        await _assert_can_write_capture(db, user, new_pecheur_id, new_embarcation_id)

    if "position_capture" in payload:
        point = payload.pop("position_capture")
        capture.position_capture = point_to_wkt(point) if point is not None else None

    especes_before = {capture.espece}
    for key, value in payload.items():
        setattr(capture, key, value)

    from app.modules.quotas.service import refresh_quotas_for_especes

    await db.flush()
    await refresh_quotas_for_especes(db, especes_before | {capture.espece})
    await db.commit()
    return await _load_read(db, capture.id)


async def delete_capture(db: AsyncSession, user: Utilisateur, capture_id: UUID) -> None:
    """Suppression hard (aligné zones / pêcheurs — pas de soft-delete sur Capture)."""
    capture = await _get_capture_row(db, capture_id)
    await _assert_can_write_capture(
        db, user, capture.pecheur_id, capture.embarcation_id
    )
    espece = capture.espece
    await db.delete(capture)
    await db.flush()
    from app.modules.quotas.service import refresh_quotas_for_especes

    await refresh_quotas_for_especes(db, {espece})
    await db.commit()


async def list_captures(
    db: AsyncSession,
    user: Utilisateur,
    *,
    pecheur_id: UUID | None = None,
    embarcation_id: UUID | None = None,
    espece: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[CaptureRead]:
    stmt = select(Capture, ST_AsGeoJSON(Capture.position_capture).label("geo")).order_by(
        Capture.date_capture.desc()
    )

    if user.role == RoleUtilisateur.pecheur:
        own = await _get_pecheur_for_user(db, user)
        if own is None:
            return []
        stmt = stmt.where(Capture.pecheur_id == own.id)
    elif pecheur_id is not None:
        stmt = stmt.where(Capture.pecheur_id == pecheur_id)

    if embarcation_id is not None:
        stmt = stmt.where(Capture.embarcation_id == embarcation_id)
    if espece is not None:
        stmt = stmt.where(Capture.espece == espece.strip().lower())

    stmt = stmt.limit(min(limit, 500)).offset(max(offset, 0))
    result = await db.execute(stmt)
    return [_to_read(cap, geo) for cap, geo in result.all()]
