"""Routes `/controles` (agents) et `/public/verif` (QR codes, sans authentification)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur, StatutMission
from app.db.models import Utilisateur
from app.modules.controles import service
from app.modules.controles.schemas import (
    ControleCreate,
    ControleRead,
    MissionCreate,
    MissionRead,
    MissionUpdate,
    VerificationLicenceRead,
    VerifPubliqueRead,
)
from app.modules.referentiels.schemas import ItemRead

router = APIRouter(prefix="/controles", tags=["controles"])
public_router = APIRouter(prefix="/public", tags=["public"])

Agent = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.agent_controle, RoleUtilisateur.autorite, RoleUtilisateur.admin
        )
    ),
]
Lecteur = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.autorite,
            RoleUtilisateur.admin,
            RoleUtilisateur.chercheur,
        )
    ),
]


@router.get("/categories-infraction", response_model=list[ItemRead])
async def categories_infraction(_: Lecteur) -> list[ItemRead]:
    return [ItemRead(code=c["code"], nom=c["nom"]) for c in service.categories()]


@router.get("/missions", response_model=list[MissionRead])
async def list_missions(
    db: DbSession,
    _: Lecteur,
    statut: Annotated[StatutMission | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[MissionRead]:
    return await service.list_missions(db, statut=statut, limit=limit)


@router.post("/missions", response_model=MissionRead, status_code=201)
async def create_mission(db: DbSession, user: Agent, data: MissionCreate) -> MissionRead:
    return await service.create_mission(db, user, data)


@router.patch("/missions/{mission_id}", response_model=MissionRead)
async def update_mission(
    db: DbSession, _: Agent, mission_id: UUID, data: MissionUpdate
) -> MissionRead:
    return await service.update_mission(db, mission_id, data)


@router.get("", response_model=list[ControleRead])
async def list_controles(
    db: DbSession,
    _: Lecteur,
    mission_id: Annotated[UUID | None, Query()] = None,
    embarcation_id: Annotated[UUID | None, Query()] = None,
    pecheur_id: Annotated[UUID | None, Query()] = None,
    infraction: Annotated[bool | None, Query()] = None,
    debut: Annotated[datetime | None, Query()] = None,
    fin: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[ControleRead]:
    return await service.list_controles(
        db,
        mission_id=mission_id,
        embarcation_id=embarcation_id,
        pecheur_id=pecheur_id,
        infraction=infraction,
        debut=debut,
        fin=fin,
        limit=limit,
    )


@router.post("", response_model=ControleRead, status_code=201)
async def create_controle(db: DbSession, user: Agent, data: ControleCreate) -> ControleRead:
    return await service.create_controle(db, user, data)


@router.get("/verifier-licence", response_model=VerificationLicenceRead)
async def verifier_licence(
    db: DbSession, _: Agent, numero: Annotated[str, Query(min_length=1)]
) -> VerificationLicenceRead:
    """Vérification complète d'une licence (saisie ou lecture du QR code)."""
    return await service.verifier_licence(db, numero)


@router.get("/{controle_id}", response_model=ControleRead)
async def get_controle(db: DbSession, _: Lecteur, controle_id: UUID) -> ControleRead:
    return await service.get_controle(db, controle_id)


@public_router.get("/verif/licence/{numero}", response_model=VerifPubliqueRead)
async def verif_licence_publique(db: DbSession, numero: str) -> VerifPubliqueRead:
    """Validité d'une licence depuis son QR code, sans donnée personnelle."""
    return await service.verif_publique_licence(db, numero)


@public_router.get("/verif/quittance/{numero}", response_model=VerifPubliqueRead)
async def verif_quittance_publique(db: DbSession, numero: str) -> VerifPubliqueRead:
    return await service.verif_publique_quittance(db, numero)
