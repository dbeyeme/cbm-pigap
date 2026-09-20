"""Routes abonnements & Mobile Money."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

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
    OrgModulesRead,
    OrgModulesUpdate,
    OrgPortalRead,
    PaiementConfigRead,
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


@router.get("/paiement-config", response_model=PaiementConfigRead)
async def get_paiement_config() -> PaiementConfigRead:
    """Mode démo/live et opérateurs disponibles (public)."""
    return PaiementConfigRead(**service.paiement_config())


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
    user: CurrentUser,
) -> InitierResponse:
    if user.role == RoleUtilisateur.organisation:
        if not user.organisation_id or user.organisation_id != payload.organisation_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organisation non autorisée")
    elif user.role not in (
        RoleUtilisateur.admin,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.autorite,
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")
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
        RoleUtilisateur.organisation,
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")
    ab, paiement = await service.confirmer_demo(db, paiement_id, payload)
    return InitierResponse(
        abonnement=AbonnementRead.model_validate(ab),
        paiement=_paiement_read(paiement),
    )


@router.post("/paiements/{paiement_id}/synchroniser", response_model=InitierResponse)
async def synchroniser_paiement(
    paiement_id: UUID,
    db: DbSession,
    user: CurrentUser,
) -> InitierResponse:
    """Interroge PawaPay (live) et met à jour le statut local si final."""
    if user.role not in (
        RoleUtilisateur.pecheur,
        RoleUtilisateur.admin,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.autorite,
        RoleUtilisateur.organisation,
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")
    ab, paiement = await service.synchroniser_paiement(db, paiement_id)
    return InitierResponse(
        abonnement=AbonnementRead.model_validate(ab),
        paiement=_paiement_read(paiement),
    )


@router.post("/webhook/mobile-money", response_model=PaiementRead)
async def webhook_mm(
    payload: WebhookMobileMoneyRequest,
    db: DbSession,
) -> PaiementRead:
    """Endpoint legacy (secret) — SingPay / tests manuels."""
    paiement = await service.webhook_mobile_money(db, payload)
    return _paiement_read(paiement)


@router.post("/webhook/pawapay/deposits", response_model=PaiementRead)
async def webhook_pawapay_deposits(
    payload: dict[str, Any],
    db: DbSession,
) -> PaiementRead:
    """Callback PawaPay (à configurer dans le dashboard PawaPay)."""
    paiement = await service.webhook_pawapay_deposit(db, payload)
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


@router.post("/{abonnement_id}/annuler", response_model=AbonnementRead)
async def annuler(
    abonnement_id: UUID,
    db: DbSession,
    _: StaffRoles,
    notes: str | None = Query(default="Annulation admin"),
) -> AbonnementRead:
    ab = await service.annuler_abonnement(db, abonnement_id, notes=notes)
    return AbonnementRead.model_validate(ab)


@router.get("/modules/catalog")
async def modules_catalog(_: StaffRoles) -> list[dict[str, str]]:
    from app.modules.abonnements.modules import MODULE_KEYS

    return [{"key": k, "label": lab} for k, lab in MODULE_KEYS]


@router.get("/organisations/{organisation_id}/modules", response_model=OrgModulesRead)
async def get_modules(
    organisation_id: UUID,
    db: DbSession,
    user: CurrentUser,
) -> OrgModulesRead:
    from app.modules.abonnements.modules import MODULE_KEYS

    if user.role == RoleUtilisateur.organisation:
        if user.organisation_id != organisation_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Accès refusé")
    elif user.role not in (
        RoleUtilisateur.admin,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.autorite,
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")

    mods = await service.get_org_modules(db, organisation_id)
    couvert, motif, ab = await service.couverture_organisation(db, organisation_id)
    from app.db.models import Organisation

    org = await db.get(Organisation, organisation_id)
    attrs = (org.attributs if org else {}) or {}
    return OrgModulesRead(
        organisation_id=organisation_id,
        modules=mods,
        catalog=[{"key": k, "label": lab} for k, lab in MODULE_KEYS],
        inscription_validee=bool(attrs.get("inscription_validee")),
        abonnement=AbonnementRead.model_validate(ab) if ab else None,
        couvert=couvert,
        motif=motif,
    )


@router.patch("/organisations/{organisation_id}/modules", response_model=OrgModulesRead)
async def patch_modules(
    organisation_id: UUID,
    payload: OrgModulesUpdate,
    db: DbSession,
    user: CurrentUser,
) -> OrgModulesRead:
    """Superadmin uniquement — active/désactive les modules selon la formule B2B."""
    if user.role != RoleUtilisateur.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Réservé au superadmin")

    await service.set_org_modules(db, organisation_id, payload.modules)
    return await get_modules(organisation_id, db, user)


@router.get("/portail/me", response_model=OrgPortalRead)
async def portail_org_me(db: DbSession, user: CurrentUser) -> OrgPortalRead:
    if user.role != RoleUtilisateur.organisation or not user.organisation_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Compte organisation requis")
    from sqlalchemy import func, select

    from app.db.models import Embarcation, Organisation, Pecheur

    org = await db.get(Organisation, user.organisation_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organisation introuvable")
    mods = await service.get_org_modules(db, org.id)
    couvert, motif, ab = await service.couverture_organisation(db, org.id)
    attrs = org.attributs or {}
    n_pec = await db.scalar(
        select(func.count()).select_from(Pecheur).where(Pecheur.organisation_id == org.id)
    )
    n_emb = await db.scalar(
        select(func.count())
        .select_from(Embarcation)
        .join(Pecheur, Embarcation.pecheur_id == Pecheur.id)
        .where(Pecheur.organisation_id == org.id)
    )
    return OrgPortalRead(
        organisation_id=org.id,
        organisation_nom=org.nom,
        inscription_validee=bool(attrs.get("inscription_validee", True)),
        couvert=couvert,
        motif=motif,
        abonnement=AbonnementRead.model_validate(ab) if ab else None,
        modules=mods,
        pecheurs_count=int(n_pec or 0),
        embarcations_count=int(n_emb or 0),
    )


@router.get("/{abonnement_id}", response_model=AbonnementRead)
async def get_one(
    abonnement_id: UUID,
    db: DbSession,
    _: StaffRoles,
) -> AbonnementRead:
    ab = await service.get_abonnement(db, abonnement_id)
    return AbonnementRead.model_validate(ab)
