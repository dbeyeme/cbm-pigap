"""Routes M4 — déclaration & sync des captures (§5.4)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.captures import service
from app.modules.captures.schemas import (
    ESPECES_MVP,
    METHODES_MVP,
    CaptureCreate,
    CaptureRead,
    CaptureSyncBatch,
    CaptureSyncResult,
    CaptureUpdate,
    EspecesCatalog,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/captures", tags=["m4-captures"])

CaptureWriter = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
        )
    ),
]

CaptureReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
        )
    ),
]


@router.get("/catalog", response_model=EspecesCatalog)
async def get_catalog(_: CaptureReader) -> EspecesCatalog:
    """Listes fermées espèces / méthodes (formulaire mobile)."""
    return EspecesCatalog(especes=list(ESPECES_MVP), methodes=list(METHODES_MVP))


@router.post("", response_model=CaptureRead, status_code=201)
async def create_capture(
    payload: CaptureCreate,
    db: DbSession,
    user: CaptureWriter,
) -> CaptureRead:
    return await service.create_capture(db, user, payload)


@router.post("/sync", response_model=CaptureSyncResult)
async def sync_captures(
    payload: CaptureSyncBatch,
    db: DbSession,
    user: CaptureWriter,
) -> CaptureSyncResult:
    """Batch offline → serveur ; idempotent via `id` client (UUID)."""
    return await service.sync_captures(db, user, payload)


@router.get("", response_model=list[CaptureRead])
async def list_captures(
    db: DbSession,
    user: CaptureReader,
    pecheur_id: UUID | None = None,
    embarcation_id: UUID | None = None,
    espece: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[CaptureRead]:
    return await service.list_captures(
        db,
        user,
        pecheur_id=pecheur_id,
        embarcation_id=embarcation_id,
        espece=espece,
        limit=limit,
        offset=offset,
    )


@router.get("/{capture_id}", response_model=CaptureRead)
async def get_capture(
    capture_id: UUID,
    db: DbSession,
    user: CaptureReader,
) -> CaptureRead:
    return await service.get_capture(db, user, capture_id)


@router.patch("/{capture_id}", response_model=CaptureRead)
async def update_capture(
    capture_id: UUID,
    payload: CaptureUpdate,
    db: DbSession,
    user: CaptureWriter,
) -> CaptureRead:
    """Correction champs métier — pêcheur limité à ses captures."""
    return await service.update_capture(db, user, capture_id, payload)


@router.delete("/{capture_id}", response_model=MessageResponse)
async def delete_capture(
    capture_id: UUID,
    db: DbSession,
    user: CaptureWriter,
) -> MessageResponse:
    """Suppression hard — pêcheur limité à ses captures."""
    await service.delete_capture(db, user, capture_id)
    return MessageResponse(detail="Capture supprimée")
