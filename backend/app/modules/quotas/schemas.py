"""Contrats API M5 — quotas (§5.5)."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel


class QuotaCreate(BaseModel):
    espece: str = Field(..., min_length=1, max_length=128)
    zone_id: UUID | None = None
    periode_debut: date
    periode_fin: date
    volume_autorise_kg: float = Field(..., gt=0)


class QuotaUpdate(BaseModel):
    espece: str | None = Field(None, min_length=1, max_length=128)
    zone_id: UUID | None = None
    periode_debut: date | None = None
    periode_fin: date | None = None
    volume_autorise_kg: float | None = Field(None, gt=0)


class QuotaRead(OrmModel):
    id: UUID
    espece: str
    zone_id: UUID | None
    periode_debut: date
    periode_fin: date
    volume_autorise_kg: float
    volume_consomme_kg: float
    taux_consommation: float = Field(
        ...,
        description="volume_consomme_kg / volume_autorise_kg (0–1+)",
    )
