"""Routes CRUD staff — agents de contrôle & administrateurs."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.utilisateurs import service
from app.modules.utilisateurs.schemas import StaffCreate, StaffRead, StaffUpdate

router = APIRouter(prefix="/utilisateurs", tags=["utilisateurs-staff"])

AdminOnly = Annotated[
    Utilisateur,
    Depends(require_role(RoleUtilisateur.admin)),
]


@router.post("", response_model=StaffRead, status_code=201)
async def create_utilisateur(
    payload: StaffCreate,
    db: DbSession,
    _: AdminOnly,
) -> StaffRead:
    user = await service.create_staff(db, payload)
    return StaffRead.model_validate(user)


@router.get("", response_model=list[StaffRead])
async def list_utilisateurs(
    db: DbSession,
    _: AdminOnly,
    role: str | None = Query(None, description="agent_controle | admin"),
    q: str | None = Query(None, description="Recherche nom / email / téléphone"),
) -> list[StaffRead]:
    users = await service.list_staff(db, role=role, q=q)
    return [StaffRead.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=StaffRead)
async def get_utilisateur(
    user_id: UUID,
    db: DbSession,
    _: AdminOnly,
) -> StaffRead:
    user = await service.get_staff(db, user_id)
    return StaffRead.model_validate(user)


@router.patch("/{user_id}", response_model=StaffRead)
async def update_utilisateur(
    user_id: UUID,
    payload: StaffUpdate,
    db: DbSession,
    actor: AdminOnly,
) -> StaffRead:
    user = await service.update_staff(db, actor, user_id, payload)
    return StaffRead.model_validate(user)


@router.delete("/{user_id}", status_code=204)
async def delete_utilisateur(
    user_id: UUID,
    db: DbSession,
    actor: AdminOnly,
) -> None:
    await service.delete_staff(db, actor, user_id)
