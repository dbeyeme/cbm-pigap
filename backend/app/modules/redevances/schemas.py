"""Contrats API — redevances (taxe à la production, quittances, paiement)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.enums import OperateurMobileMoney, StatutPaiement, StatutQuittance, TaxeStatut
from app.schemas.common import OrmModel


class CaptureTaxeRead(OrmModel):
    id: UUID
    pecheur_id: UUID
    embarcation_id: UUID
    date_capture: datetime
    espece: str
    quantite_kg: float
    taxe_taux_kg: float | None
    taxe_fcfa: float | None
    taxe_statut: TaxeStatut
    quittance_id: UUID | None


class GroupeMontant(BaseModel):
    groupe: str
    quantite_kg: float
    montant_fcfa: float


class EncoursRead(BaseModel):
    pecheur_id: UUID | None = None
    organisation_id: UUID | None = None
    nb_captures: int
    quantite_kg: float
    montant_fcfa: float
    par_groupe: list[GroupeMontant]
    captures: list[CaptureTaxeRead]
    depuis: datetime | None = None
    jusqu_a: datetime | None = None


class QuittanceCreate(BaseModel):
    """Regroupe les taxes dues d'un pêcheur, ou de tous les membres d'une organisation."""

    pecheur_id: UUID | None = None
    organisation_id: UUID | None = None
    jusqu_a: datetime | None = Field(
        None, description="Ne retenir que les captures jusqu'à cette date"
    )


class PaiementQuittanceRead(OrmModel):
    id: UUID
    quittance_id: UUID | None
    montant_fcfa: int
    operateur: OperateurMobileMoney
    msisdn: str | None
    statut: StatutPaiement
    reference_interne: str
    reference_operateur: str | None
    metadata_json: dict[str, Any] | None = None


class QuittanceRead(OrmModel):
    id: UUID
    numero: str
    pecheur_id: UUID | None
    organisation_id: UUID | None
    montant_fcfa: int
    nb_captures: int
    periode_debut: datetime | None
    periode_fin: datetime | None
    statut: StatutQuittance
    date_creation: datetime
    date_paiement: datetime | None
    metadata_json: dict[str, Any] | None = None
    paiement: PaiementQuittanceRead | None = None
    titulaire: str | None = None


class PayerQuittanceRequest(BaseModel):
    operateur: OperateurMobileMoney = OperateurMobileMoney.airtel_money
    msisdn: str | None = Field(None, description="Omis : téléphone enregistré de l'acteur")
    numero_tiers_autorise: bool = False


class PaiementQuittanceResponse(BaseModel):
    quittance: QuittanceRead
    paiement: PaiementQuittanceRead


class PeriodeMontant(BaseModel):
    periode: str
    due_fcfa: float
    payee_fcfa: float
    quantite_kg: float


class SyntheseRedevancesRead(BaseModel):
    periode_debut: datetime | None = None
    periode_fin: datetime | None = None
    taxe_due_fcfa: float
    taxe_payee_fcfa: float
    taxe_sans_bareme_kg: float
    nb_captures_dues: int
    nb_quittances_en_attente: int
    nb_quittances_payees: int
    par_groupe: list[GroupeMontant]
    par_mois: list[PeriodeMontant]
    genere_a: datetime
