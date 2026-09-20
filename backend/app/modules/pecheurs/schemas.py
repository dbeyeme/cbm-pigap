"""Contrats API M1 — pêcheurs, embarcations, organisations (§5.1 / ADR-003)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.db.enums import StatutPecheur
from app.schemas.common import OrmModel


class OrganisationCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=255)
    nom_commercial: str | None = Field(None, max_length=255)
    type_organisation: str | None = Field(None, max_length=64)
    forme_juridique: str | None = Field(None, max_length=128)
    numero_registre: str | None = Field(None, max_length=128)
    numero_fiscal: str | None = Field(None, max_length=128)
    email: EmailStr | None = None
    telephone: str | None = Field(None, max_length=32)
    telephone_secondaire: str | None = Field(None, max_length=32)
    site_web: str | None = Field(None, max_length=512)
    adresse_ligne1: str | None = Field(None, max_length=255)
    adresse_ligne2: str | None = Field(None, max_length=255)
    ville: str | None = Field(None, max_length=128)
    province_region: str | None = Field(None, max_length=128)
    code_postal: str | None = Field(None, max_length=32)
    pays: str = Field(default="GA", min_length=2, max_length=2)
    zone_activite: str | None = Field(None, max_length=255)
    attributs: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    actif: bool = True


class OrganisationUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=255)
    nom_commercial: str | None = None
    type_organisation: str | None = None
    forme_juridique: str | None = None
    numero_registre: str | None = None
    numero_fiscal: str | None = None
    email: EmailStr | None = None
    telephone: str | None = None
    telephone_secondaire: str | None = None
    site_web: str | None = None
    adresse_ligne1: str | None = None
    adresse_ligne2: str | None = None
    ville: str | None = None
    province_region: str | None = None
    code_postal: str | None = None
    pays: str | None = Field(None, min_length=2, max_length=2)
    zone_activite: str | None = None
    attributs: dict[str, Any] | None = None
    notes: str | None = None
    actif: bool | None = None


class OrganisationRead(OrmModel):
    id: UUID
    nom: str
    nom_commercial: str | None
    type_organisation: str | None
    forme_juridique: str | None
    numero_registre: str | None
    numero_fiscal: str | None
    email: str | None
    telephone: str | None
    telephone_secondaire: str | None
    site_web: str | None
    adresse_ligne1: str | None
    adresse_ligne2: str | None
    ville: str | None
    province_region: str | None
    code_postal: str | None
    pays: str
    zone_activite: str | None
    attributs: dict[str, Any]
    notes: str | None
    actif: bool
    date_creation: datetime
    date_mise_a_jour: datetime


class PecheurCreate(BaseModel):
    """Création pêcheur avec compte utilisateur associé (flux agent)."""

    nom: str = Field(..., min_length=1, max_length=255)
    prenom: str = Field(..., min_length=1, max_length=255)
    # None = attribution automatique (voir app.core.numerotation)
    numero_licence: str | None = Field(None, min_length=1, max_length=64)
    date_delivrance_licence: date | None = None
    statut: StatutPecheur = StatutPecheur.actif
    organisation_id: UUID | None = None
    telephone: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    mot_de_passe: str = Field(..., min_length=8, max_length=128)

    @field_validator("numero_licence")
    @classmethod
    def licence_non_vide(cls, value: str | None) -> str | None:
        if value is None:
            return None  # attribution automatique
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "Numéro de licence vide : omettez le champ pour une attribution automatique"
            )
        return cleaned


class PecheurUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=255)
    prenom: str | None = Field(None, min_length=1, max_length=255)
    numero_licence: str | None = Field(None, min_length=1, max_length=64)
    date_delivrance_licence: date | None = None
    statut: StatutPecheur | None = None
    organisation_id: UUID | None = None


class PecheurRead(OrmModel):
    id: UUID
    utilisateur_id: UUID
    nom: str
    prenom: str
    numero_licence: str
    date_delivrance_licence: date | None
    statut: StatutPecheur
    organisation_id: UUID | None


class EmbarcationCreate(BaseModel):
    pecheur_id: UUID
    nom: str = Field(..., min_length=1, max_length=255)
    immatriculation: str = Field(..., min_length=1, max_length=64)
    type: str | None = Field(None, max_length=64)
    longueur: float | None = Field(None, gt=0)
    equipements: dict[str, Any] | None = None


class EmbarcationUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=255)
    immatriculation: str | None = Field(None, min_length=1, max_length=64)
    type: str | None = None
    longueur: float | None = Field(None, gt=0)
    equipements: dict[str, Any] | None = None


class EmbarcationRead(OrmModel):
    id: UUID
    pecheur_id: UUID
    nom: str
    immatriculation: str
    type: str | None
    longueur: float | None
    equipements: dict[str, Any] | None
