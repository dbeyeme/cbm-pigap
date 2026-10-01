"""Contrats API M4 — captures (§5.4)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.modules.referentiels import service as referentiels
from app.schemas.common import OrmModel, PointGeoJSON

# Listes issues du référentiel métier (data/open-data/gabon/referentiels_peche.json) :
# 26 espèces des tableurs de l'administration avec leur groupe (pélagique,
# démersal, crustacé), engins observés dans les dossiers d'autorisation.
# Les anciens codes MVP (barracuda, filet, ligne…) restent acceptés comme alias.


def especes_valides() -> tuple[str, ...]:
    return tuple(referentiels.espece_codes())


def methodes_valides() -> tuple[str, ...]:
    ref = referentiels.load_referentiels()
    return tuple(e["code"] for e in referentiels.engins()) + tuple(ref.get("engins_generiques", []))


ESPECES_MVP = especes_valides()
METHODES_MVP = methodes_valides()


def _valider_espece(value: str) -> str:
    normalized = value.strip().lower()
    if not referentiels.espece_valide(normalized):
        raise ValueError(
            "Espèce hors référentiel : choisissez un code du catalogue "
            f"({', '.join(especes_valides()[:8])}, …)"
        )
    return normalized


def _valider_methode(value: str) -> str:
    normalized = value.strip().lower()
    if not referentiels.engin_valide(normalized):
        raise ValueError(
            "Engin hors référentiel : choisissez un code du catalogue "
            f"({', '.join(methodes_valides())})"
        )
    return normalized


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
        return _valider_espece(value)

    @field_validator("methode")
    @classmethod
    def methode_fermee(cls, value: str) -> str:
        return _valider_methode(value)

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
        return None if value is None else _valider_espece(value)

    @field_validator("methode")
    @classmethod
    def methode_fermee(cls, value: str | None) -> str | None:
        return None if value is None else _valider_methode(value)

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
    taxe_fcfa: float | None = None
    taxe_taux_kg: float | None = None
    taxe_statut: str | None = None
    quittance_id: UUID | None = None


class CaptureSyncResult(BaseModel):
    accepts: list[UUID]
    duplicates: list[UUID]
    rejects: list[dict]


class EspeceCatalogItem(BaseModel):
    code: str
    nom: str
    groupe: str
    taux_taxe_fcfa_kg: float | None = None
    protegee: bool = False


class EnginCatalogItem(BaseModel):
    code: str
    nom: str


class EspecesCatalog(BaseModel):
    especes: list[str]
    methodes: list[str]
    especes_detail: list[EspeceCatalogItem] = []
    engins_detail: list[EnginCatalogItem] = []
    sites_debarquement: list[str] = []
    especes_protegees: list[str] = []
