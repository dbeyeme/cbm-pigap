"""Schémas Pydantic — abonnements & Mobile Money."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.enums import (
    CanalAbonnement,
    CodeOffreAbonnement,
    OperateurMobileMoney,
    PeriodeAbonnement,
    StatutAbonnement,
    StatutPaiement,
)


class OffreRead(BaseModel):
    code: CodeOffreAbonnement
    canal: CanalAbonnement
    periode: PeriodeAbonnement
    montant_fcfa: int
    libelle: str
    description: str
    embarcations_incluses: int


class AbonnementRead(BaseModel):
    id: UUID
    canal: CanalAbonnement
    code_offre: CodeOffreAbonnement
    periode: PeriodeAbonnement
    montant_fcfa: int
    statut: StatutAbonnement
    pecheur_id: UUID | None
    organisation_id: UUID | None
    embarcations_incluses: int
    date_debut: datetime | None
    date_fin: datetime | None
    auto_renouvellement: bool
    notes: str | None
    date_creation: datetime

    model_config = {"from_attributes": True}


class PaiementRead(BaseModel):
    id: UUID
    abonnement_id: UUID
    montant_fcfa: int
    operateur: OperateurMobileMoney
    msisdn: str | None
    statut: StatutPaiement
    reference_interne: str
    reference_operateur: str | None
    date_creation: datetime
    date_confirmation: datetime | None
    instructions: str | None = None

    model_config = {"from_attributes": True}


class InitierB2CRequest(BaseModel):
    code_offre: CodeOffreAbonnement = Field(description="b2c_mensuel ou b2c_annuel")
    pecheur_id: UUID | None = None
    numero_licence: str | None = None
    operateur: OperateurMobileMoney = OperateurMobileMoney.demo
    msisdn: str | None = Field(default=None, description="Ex. 077xxxxxx (Gabon)")


class InitierB2BRequest(BaseModel):
    code_offre: CodeOffreAbonnement
    organisation_id: UUID
    embarcations: int = Field(default=10, ge=1, le=500)
    operateur: OperateurMobileMoney = OperateurMobileMoney.demo
    msisdn: str | None = None
    activer_demo: bool = Field(
        default=False,
        description="Si true et mode demo : active immédiatement sans webhook",
    )


class ConfirmerDemoRequest(BaseModel):
    """Confirme un paiement en mode démo (simulacre Mobile Money)."""

    reference_interne: str | None = None


class WebhookMobileMoneyRequest(BaseModel):
    reference_interne: str
    statut: str = Field(description="reussi|echoue|expire")
    reference_operateur: str | None = None
    secret: str | None = None


class CouvertureRead(BaseModel):
    """État d'accès usage pour un pêcheur (B2C ou flotte B2B)."""

    pecheur_id: UUID
    numero_licence: str
    couvert: bool
    motif: str
    abonnement: AbonnementRead | None = None
    enforce: bool
    source_couverture: str | None = None  # b2c | b2b_flotte | pilote | none


class InitierResponse(BaseModel):
    abonnement: AbonnementRead
    paiement: PaiementRead
