"""Routes M5 — gestion des quotas (§5.5)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur, StatutAlerte
from app.db.models import Utilisateur
from app.modules.alertes.schemas import AlerteRead
from app.modules.quotas import service
from app.modules.quotas.schemas import QuotaCreate, QuotaRead, QuotaUpdate
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/quotas", tags=["m5-quotas"])

QuotaAdmin = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
        )
    ),
]

QuotaReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.chercheur,
        )
    ),
]


@router.post("", response_model=QuotaRead, status_code=201)
async def create_quota(
    payload: QuotaCreate,
    db: DbSession,
    _: QuotaAdmin,
) -> QuotaRead:
    return await service.create_quota(db, payload)


@router.get("", response_model=list[QuotaRead])
async def list_quotas(
    db: DbSession,
    _: QuotaReader,
    espece: str | None = None,
) -> list[QuotaRead]:
    return await service.list_quotas(db, espece=espece)


@router.get("/alertes", response_model=list[AlerteRead])
async def list_quota_alertes(
    db: DbSession,
    _: QuotaReader,
    statut: StatutAlerte | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AlerteRead]:
    """Alertes dépassement quota — visible portail / préparation M6 (§5.5)."""
    rows = await service.list_quota_alertes(db, statut=statut, limit=limit)
    return [AlerteRead.model_validate(r) for r in rows]


@router.get("/{quota_id}", response_model=QuotaRead)
async def get_quota(
    quota_id: UUID,
    db: DbSession,
    _: QuotaReader,
) -> QuotaRead:
    return await service.get_quota(db, quota_id)


@router.patch("/{quota_id}", response_model=QuotaRead)
async def update_quota(
    quota_id: UUID,
    payload: QuotaUpdate,
    db: DbSession,
    _: QuotaAdmin,
) -> QuotaRead:
    return await service.update_quota(db, quota_id, payload)


@router.delete("/{quota_id}", response_model=MessageResponse)
async def delete_quota(
    quota_id: UUID,
    db: DbSession,
    _: QuotaAdmin,
) -> MessageResponse:
    await service.delete_quota(db, quota_id)
    return MessageResponse(detail="Quota supprimé")
