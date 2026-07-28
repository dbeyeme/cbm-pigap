"""Contrats API M4 — captures (§5.4)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import OrmModel, PointGeoJSON

# Liste fermée MVP Gabon (espèces côtières / artisanales plausibles).
# À valider avec Christian / autorités pour la zone pilote — documenté README.
ESPECES_MVP = (
    "capitaine",
    "merou",
    "crevette",
    "thon",
    "barracuda",
    "sardine",
    "autre",
)

METHODES_MVP = (
    "filet",
    "ligne",
    "nasse",
    "senne",
    "palangre",
    "autre",
)

EspeceMVP = Literal[
    "capitaine",
    "merou",
    "crevette",
    "thon",
    "barracuda",
    "sardine",
    "autre",
]

MethodeMVP = Literal["filet", "ligne", "nasse", "senne", "palangre", "autre"]


class CaptureCreate(BaseModel):
    id: UUID | None = Field(
        None,
        description="UUID client pour sync offline sans duplication",
    )
    pecheur_id: UUID
    embarcation_id: UUID
    espece: str = Field(..., min_length=1, max_length=128)
    quantite_kg: float = Field(..., gt=0)
    methode: str = Field(..., min_length=1, max_length=128)
    position_capture: PointGeoJSON | None = None
    point_debarquement: str = Field(..., min_length=1, max_length=255)
    date_capture: datetime

    @field_validator("espece")
    @classmethod
    def espece_fermee(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ESPECES_MVP:
            raise ValueError(
                f"Espèce hors liste fermée MVP ({', '.join(ESPECES_MVP)})"
            )
        return normalized

    @field_validator("methode")
    @classmethod
    def methode_fermee(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in METHODES_MVP:
            raise ValueError(
                f"Méthode hors liste fermée MVP ({', '.join(METHODES_MVP)})"
            )
        return normalized

    @field_validator("point_debarquement")
    @classmethod
    def debarquement_non_vide(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Point de débarquement requis")
        return cleaned


class CaptureSyncBatch(BaseModel):
    captures: list[CaptureCreate] = Field(..., min_length=1, max_length=100)


class CaptureUpdate(BaseModel):
    """Correction MVP — champs métier (pas de changement d'`id`)."""

    pecheur_id: UUID | None = None
    embarcation_id: UUID | None = None
    espece: str | None = Field(None, min_length=1, max_length=128)
    quantite_kg: float | None = Field(None, gt=0)
    methode: str | None = Field(None, min_length=1, max_length=128)
    position_capture: PointGeoJSON | None = None
    point_debarquement: str | None = Field(None, min_length=1, max_length=255)
    date_capture: datetime | None = None

    @field_validator("espece")
    @classmethod
    def espece_fermee(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in ESPECES_MVP:
            raise ValueError(
                f"Espèce hors liste fermée MVP ({', '.join(ESPECES_MVP)})"
            )
        return normalized

    @field_validator("methode")
    @classmethod
    def methode_fermee(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in METHODES_MVP:
            raise ValueError(
                f"Méthode hors liste fermée MVP ({', '.join(METHODES_MVP)})"
            )
        return normalized

    @field_validator("point_debarquement")
    @classmethod
    def debarquement_non_vide(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Point de débarquement requis")
        return cleaned


class CaptureRead(OrmModel):
    id: UUID
    pecheur_id: UUID
    embarcation_id: UUID
    espece: str
    quantite_kg: float
    methode: str | None
    position_capture: PointGeoJSON | None
    point_debarquement: str | None
    date_capture: datetime
    synchronise_a: datetime | None


class CaptureSyncResult(BaseModel):
    accepts: list[UUID]
    duplicates: list[UUID]
    rejects: list[dict]


class EspecesCatalog(BaseModel):
    especes: list[str]
    methodes: list[str]
