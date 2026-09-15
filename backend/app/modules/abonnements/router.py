"""Routes abonnements & Mobile Money."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, require_role
from app.db.enums import CanalAbonnement, RoleUtilisateur, StatutAbonnement
from app.db.models import Pecheur, Utilisateur
from app.modules.abonnements import service
from app.modules.abonnements.schemas import (
    AbonnementRead,
    ConfirmerDemoRequest,
    CouvertureRead,
    InitierB2BRequest,
    InitierB2CRequest,
    InitierResponse,
    OffreRead,
    PaiementRead,
    WebhookMobileMoneyRequest,
)

router = APIRouter(prefix="/abonnements", tags=["abonnements"])

StaffRoles = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.admin,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.autorite,
        )
    ),
]


def _paiement_read(p) -> PaiementRead:
    instructions = None
    if isinstance(p.metadata_json, dict):
        instructions = p.metadata_json.get("instructions")
    return PaiementRead(
        id=p.id,
        abonnement_id=p.abonnement_id,
        montant_fcfa=p.montant_fcfa,
        operateur=p.operateur,
        msisdn=p.msisdn,
        statut=p.statut,
        reference_interne=p.reference_interne,
        reference_operateur=p.reference_operateur,
        date_creation=p.date_creation,
        date_confirmation=p.date_confirmation,
        instructions=instructions,
    )


@router.get("/offres", response_model=list[OffreRead])
async def get_offres() -> list[OffreRead]:
    """Catalogue public (tarifs modèle économique)."""
    return service.list_offres()


@router.get("", response_model=list[AbonnementRead])
async def list_abonnements(
    db: DbSession,
    _: StaffRoles,
    canal: CanalAbonnement | None = None,
    statut: StatutAbonnement | None = None,
    pecheur_id: UUID | None = None,
    organisation_id: UUID | None = None,
) -> list[AbonnementRead]:
    rows = await service.list_abonnements(
        db,
        canal=canal,
        statut=statut,
        pecheur_id=pecheur_id,
        organisation_id=organisation_id,
    )
    return [AbonnementRead.model_validate(r) for r in rows]


@router.get("/couverture/{pecheur_id}", response_model=CouvertureRead)
async def get_couverture(
    pecheur_id: UUID,
    db: DbSession,
    user: CurrentUser,
) -> CouvertureRead:
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pêcheur introuvable")
    # Pêcheur : uniquement soi-même
    if user.role == RoleUtilisateur.pecheur and pecheur.utilisateur_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Accès refusé")
    if user.role not in (
        RoleUtilisateur.pecheur,
        RoleUtilisateur.admin,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.autorite,
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")

    couvert, motif, ab, source = await service.couverture_pecheur(db, pecheur)
    return CouvertureRead(
        pecheur_id=pecheur.id,
        numero_licence=pecheur.numero_licence,
        couvert=couvert,
        motif=motif,
        abonnement=AbonnementRead.model_validate(ab) if ab else None,
        enforce=settings.abonnement_enforce,
        source_couverture=source,
    )


@router.get("/me", response_model=CouvertureRead)
async def couverture_me(db: DbSession, user: CurrentUser) -> CouvertureRead:
    pecheur = await service.find_pecheur_for_user(db, user.id)
    if pecheur is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Aucun profil pêcheur lié à ce compte",
        )
    couvert, motif, ab, source = await service.couverture_pecheur(db, pecheur)
    return CouvertureRead(
        pecheur_id=pecheur.id,
        numero_licence=pecheur.numero_licence,
        couvert=couvert,
        motif=motif,
        abonnement=AbonnementRead.model_validate(ab) if ab else None,
        enforce=settings.abonnement_enforce,
        source_couverture=source,
    )


@router.post("/initier-b2c", response_model=InitierResponse, status_code=201)
async def initier_b2c(
    payload: InitierB2CRequest,
    db: DbSession,
    user: CurrentUser,
) -> InitierResponse:
    # Pêcheur ne peut initier que pour soi
    if user.role == RoleUtilisateur.pecheur:
        pecheur = await service.find_pecheur_for_user(db, user.id)
        if pecheur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Profil pêcheur manquant")
        payload = payload.model_copy(update={"pecheur_id": pecheur.id, "numero_licence": None})
    elif user.role not in (
        RoleUtilisateur.admin,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.autorite,
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")

    ab, paiement = await service.initier_b2c(db, payload)
    return InitierResponse(
        abonnement=AbonnementRead.model_validate(ab),
        paiement=_paiement_read(paiement),
    )


@router.post("/initier-b2b", response_model=InitierResponse, status_code=201)
async def initier_b2b(
    payload: InitierB2BRequest,
    db: DbSession,
    _: StaffRoles,
) -> InitierResponse:
    ab, paiement = await service.initier_b2b(db, payload)
    return InitierResponse(
        abonnement=AbonnementRead.model_validate(ab),
        paiement=_paiement_read(paiement),
    )


@router.post("/paiements/{paiement_id}/confirmer-demo", response_model=InitierResponse)
async def confirmer_demo(
    paiement_id: UUID,
    db: DbSession,
    user: CurrentUser,
    payload: ConfirmerDemoRequest | None = None,
) -> InitierResponse:
    if user.role not in (
        RoleUtilisateur.pecheur,
        RoleUtilisateur.admin,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.autorite,
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")
    ab, paiement = await service.confirmer_demo(db, paiement_id, payload)
    return InitierResponse(
        abonnement=AbonnementRead.model_validate(ab),
        paiement=_paiement_read(paiement),
    )


@router.post("/webhook/mobile-money", response_model=PaiementRead)
async def webhook_mm(
    payload: WebhookMobileMoneyRequest,
    db: DbSession,
) -> PaiementRead:
    """Endpoint public pour agrégateur (SingPay / PViT) — protégé par secret."""
    paiement = await service.webhook_mobile_money(db, payload)
    return _paiement_read(paiement)


@router.post("/{abonnement_id}/activer-manuel", response_model=AbonnementRead)
async def activer_manuel(
    abonnement_id: UUID,
    db: DbSession,
    _: StaffRoles,
    notes: str | None = Query(default="Activation manuelle pilote"),
) -> AbonnementRead:
    ab = await service.activer_manuel(db, abonnement_id, notes=notes)
    return AbonnementRead.model_validate(ab)


@router.get("/{abonnement_id}", response_model=AbonnementRead)
async def get_one(
    abonnement_id: UUID,
    db: DbSession,
    _: StaffRoles,
) -> AbonnementRead:
    ab = await service.get_abonnement(db, abonnement_id)
    return AbonnementRead.model_validate(ab)
