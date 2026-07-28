"""Routes M1 — organisations, pêcheurs, embarcations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.pecheurs import service
from app.modules.pecheurs.schemas import (
    EmbarcationCreate,
    EmbarcationRead,
    EmbarcationUpdate,
    OrganisationCreate,
    OrganisationRead,
    OrganisationUpdate,
    PecheurCreate,
    PecheurRead,
    PecheurUpdate,
)

router = APIRouter(tags=["m1-pecheurs"])

AgentOrAdmin = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
        )
    ),
]


@router.post("/organisations", response_model=OrganisationRead, status_code=201)
async def create_organisation(
    payload: OrganisationCreate,
    db: DbSession,
    _: AgentOrAdmin,
) -> OrganisationRead:
    org = await service.create_organisation(db, payload)
    return OrganisationRead.model_validate(org)


@router.get("/organisations", response_model=list[OrganisationRead])
async def list_organisations(
    db: DbSession,
    _: AgentOrAdmin,
    actif: bool | None = None,
) -> list[OrganisationRead]:
    orgs = await service.list_organisations(db, actif=actif)
    return [OrganisationRead.model_validate(o) for o in orgs]


@router.get("/organisations/{org_id}", response_model=OrganisationRead)
async def get_organisation(
    org_id: UUID,
    db: DbSession,
    _: AgentOrAdmin,
) -> OrganisationRead:
    org = await service.get_organisation(db, org_id)
    return OrganisationRead.model_validate(org)


@router.patch("/organisations/{org_id}", response_model=OrganisationRead)
async def update_organisation(
    org_id: UUID,
    payload: OrganisationUpdate,
    db: DbSession,
    _: AgentOrAdmin,
) -> OrganisationRead:
    org = await service.update_organisation(db, org_id, payload)
    return OrganisationRead.model_validate(org)


@router.post("/pecheurs", response_model=PecheurRead, status_code=201)
async def create_pecheur(
    payload: PecheurCreate,
    db: DbSession,
    _: AgentOrAdmin,
) -> PecheurRead:
    pecheur = await service.create_pecheur(db, payload)
    return PecheurRead.model_validate(pecheur)


@router.get("/pecheurs", response_model=list[PecheurRead])
async def list_or_search_pecheurs(
    db: DbSession,
    _: AgentOrAdmin,
    q: Annotated[str | None, Query(description="Nom, prénom ou numéro de licence")] = None,
) -> list[PecheurRead]:
    if q:
        items = await service.search_pecheurs(db, q)
    else:
        items = await service.list_pecheurs(db)
    return [PecheurRead.model_validate(p) for p in items]


@router.get("/pecheurs/{pecheur_id}", response_model=PecheurRead)
async def get_pecheur(
    pecheur_id: UUID,
    db: DbSession,
    _: AgentOrAdmin,
) -> PecheurRead:
    pecheur = await service.get_pecheur(db, pecheur_id)
    return PecheurRead.model_validate(pecheur)


@router.patch("/pecheurs/{pecheur_id}", response_model=PecheurRead)
async def update_pecheur(
    pecheur_id: UUID,
    payload: PecheurUpdate,
    db: DbSession,
    _: AgentOrAdmin,
) -> PecheurRead:
    pecheur = await service.update_pecheur(db, pecheur_id, payload)
    return PecheurRead.model_validate(pecheur)


@router.delete("/pecheurs/{pecheur_id}", status_code=204)
async def delete_pecheur(
    pecheur_id: UUID,
    db: DbSession,
    _: AgentOrAdmin,
) -> None:
    await service.delete_pecheur(db, pecheur_id)


@router.post("/embarcations", response_model=EmbarcationRead, status_code=201)
async def create_embarcation(
    payload: EmbarcationCreate,
    db: DbSession,
    _: AgentOrAdmin,
) -> EmbarcationRead:
    embarcation = await service.create_embarcation(db, payload)
    return EmbarcationRead.model_validate(embarcation)


@router.get("/embarcations", response_model=list[EmbarcationRead])
async def list_embarcations(
    db: DbSession,
    _: AgentOrAdmin,
    pecheur_id: UUID | None = None,
) -> list[EmbarcationRead]:
    items = await service.list_embarcations(db, pecheur_id=pecheur_id)
    return [EmbarcationRead.model_validate(e) for e in items]


@router.get("/embarcations/{embarcation_id}", response_model=EmbarcationRead)
async def get_embarcation(
    embarcation_id: UUID,
    db: DbSession,
    _: AgentOrAdmin,
) -> EmbarcationRead:
    embarcation = await service.get_embarcation(db, embarcation_id)
    return EmbarcationRead.model_validate(embarcation)


@router.patch("/embarcations/{embarcation_id}", response_model=EmbarcationRead)
async def update_embarcation(
    embarcation_id: UUID,
    payload: EmbarcationUpdate,
    db: DbSession,
    _: AgentOrAdmin,
) -> EmbarcationRead:
    embarcation = await service.update_embarcation(db, embarcation_id, payload)
    return EmbarcationRead.model_validate(embarcation)


@router.delete("/embarcations/{embarcation_id}", status_code=204)
async def delete_embarcation(
    embarcation_id: UUID,
    db: DbSession,
    _: AgentOrAdmin,
) -> None:
    await service.delete_embarcation(db, embarcation_id)
