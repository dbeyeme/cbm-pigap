"""Routes `/redevances` — taxe à la production, quittances, paiement."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.deps import CurrentUser, DbSession, require_role
from app.db.enums import RoleUtilisateur, StatutQuittance
from app.db.models import Utilisateur
from app.modules.redevances import service
from app.modules.redevances.schemas import (
    EncoursRead,
    PaiementQuittanceRead,
    PaiementQuittanceResponse,
    PayerQuittanceRequest,
    QuittanceCreate,
    QuittanceRead,
    SyntheseRedevancesRead,
)
from app.modules.referentiels.router import baremes_read
from app.modules.referentiels.schemas import BaremesRead

router = APIRouter(prefix="/redevances", tags=["redevances"])

Staff = Annotated[
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


@router.get("/baremes", response_model=BaremesRead)
async def get_baremes(_: CurrentUser) -> BaremesRead:
    return baremes_read()


@router.get("/encours", response_model=EncoursRead)
async def get_encours(
    db: DbSession,
    user: CurrentUser,
    pecheur_id: UUID | None = Query(None),
    organisation_id: UUID | None = Query(None),
) -> EncoursRead:
    """Taxes dues non encore quittancées (pêcheur : lui-même ; organisation : ses membres)."""
    return await service.encours(db, user, pecheur_id=pecheur_id, organisation_id=organisation_id)


@router.get("/synthese", response_model=SyntheseRedevancesRead)
async def get_synthese(
    db: DbSession,
    _: Staff,
    debut: datetime | None = Query(None),
    fin: datetime | None = Query(None),
) -> SyntheseRedevancesRead:
    return await service.synthese(db, debut=debut, fin=fin)


@router.get("/quittances", response_model=list[QuittanceRead])
async def list_quittances(
    db: DbSession,
    user: CurrentUser,
    pecheur_id: UUID | None = Query(None),
    organisation_id: UUID | None = Query(None),
    statut: StatutQuittance | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[QuittanceRead]:
    rows = await service.list_quittances(
        db, user, pecheur_id=pecheur_id, organisation_id=organisation_id, statut=statut, limit=limit
    )
    return [await service.to_read(db, q) for q in rows]


@router.post("/quittances", response_model=QuittanceRead, status_code=201)
async def create_quittance(
    db: DbSession, user: CurrentUser, data: QuittanceCreate
) -> QuittanceRead:
    q = await service.creer_quittance(db, user, data)
    return await service.to_read(db, q)


@router.get("/quittances/{quittance_id}", response_model=QuittanceRead)
async def get_quittance(db: DbSession, user: CurrentUser, quittance_id: UUID) -> QuittanceRead:
    q = await service.get_quittance(db, user, quittance_id)
    return await service.to_read(db, q)


@router.get("/quittances/{quittance_id}/pdf")
async def get_quittance_pdf(db: DbSession, user: CurrentUser, quittance_id: UUID) -> Response:
    content, filename = await service.quittance_pdf(db, user, quittance_id)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/quittances/{quittance_id}/payer", response_model=PaiementQuittanceResponse, status_code=201
)
async def payer_quittance(
    db: DbSession, user: CurrentUser, quittance_id: UUID, data: PayerQuittanceRequest
) -> PaiementQuittanceResponse:
    """Dépôt Mobile Money initié depuis le numéro enregistré de l'acteur."""
    q, paiement = await service.initier_paiement(db, user, quittance_id, data)
    return PaiementQuittanceResponse(
        quittance=await service.to_read(db, q),
        paiement=PaiementQuittanceRead.model_validate(paiement),
    )


@router.post("/quittances/{quittance_id}/annuler", response_model=QuittanceRead)
async def annuler_quittance(db: DbSession, user: CurrentUser, quittance_id: UUID) -> QuittanceRead:
    q = await service.annuler_quittance(db, user, quittance_id)
    return await service.to_read(db, q)


@router.post("/paiements/{paiement_id}/confirmer-demo", response_model=PaiementQuittanceResponse)
async def confirmer_demo(
    db: DbSession, user: CurrentUser, paiement_id: UUID
) -> PaiementQuittanceResponse:
    q, paiement = await service.confirmer_demo(db, user, paiement_id)
    return PaiementQuittanceResponse(
        quittance=await service.to_read(db, q),
        paiement=PaiementQuittanceRead.model_validate(paiement),
    )
