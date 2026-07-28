"""Routes M7 — alertes intelligentes (§5.7)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur, StatutAlerte, TypeAlerte
from app.db.models import Utilisateur
from app.modules.alertes import service
from app.modules.alertes.schemas import AlerteRead, AlerteUpdateStatut

router = APIRouter(prefix="/alertes", tags=["m7-alertes"])

AlertesReader = Annotated[
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

AlertesAdmin = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
        )
    ),
]


@router.get("", response_model=list[AlerteRead])
async def list_alertes(
    db: DbSession,
    _: AlertesReader,
    type_alerte: Annotated[TypeAlerte | None, Query(alias="type")] = None,
    statut: StatutAlerte | None = None,
    embarcation_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[AlerteRead]:
    return await service.list_alertes(
        db,
        type_alerte=type_alerte,
        statut=statut,
        embarcation_id=embarcation_id,
        limit=limit,
    )


@router.patch("/{alerte_id}", response_model=AlerteRead)
async def patch_alerte_statut(
    alerte_id: UUID,
    payload: AlerteUpdateStatut,
    db: DbSession,
    _: AlertesAdmin,
) -> AlerteRead:
    return await service.update_statut(db, alerte_id, payload)
