"""Schémas API commandes client → pêcheur (ADR-014)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.db.enums import StatutCommande


class ClientInscription(BaseModel):
    nom: str = Field(min_length=1, max_length=255)
    email: EmailStr
    mot_de_passe: str = Field(min_length=8, max_length=128)
    telephone: str | None = Field(default=None, max_length=32)


class ClientInscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nom: str
    email: EmailStr | None
    telephone: str | None


class PecheurVitrineRead(BaseModel):
    """Liste minimale pour qu'un client choisisse un pêcheur (sans données sensibles)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nom: str
    prenom: str
    numero_licence: str


class CommandeCreate(BaseModel):
    pecheur_id: UUID
    capture_id: UUID | None = None
    espece: str | None = Field(default=None, max_length=128)
    quantite_kg: float | None = Field(default=None, gt=0)
    montant_prevu_fcfa: int | None = Field(default=None, ge=0)
    message: str | None = Field(default=None, max_length=2000)

    @field_validator("espece")
    @classmethod
    def _espece_norm(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalise = value.strip()
        return normalise or None


class CommandeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    pecheur_id: UUID
    capture_id: UUID | None
    espece: str | None
    quantite_kg: float | None
    montant_prevu_fcfa: int | None
    message: str | None
    statut: StatutCommande
    date_creation: datetime
    date_mise_a_jour: datetime
    date_acceptee: datetime | None
    date_confirmee_vendeur: datetime | None
    date_confirmee_client: datetime | None
    date_annulee: datetime | None