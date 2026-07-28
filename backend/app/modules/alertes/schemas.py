"""Contrats API M7 — alertes (§5.7)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte
from app.schemas.common import OrmModel


class AlerteCreate(BaseModel):
    """Création manuelle rare ; la plupart sont générées par règles."""

    type: TypeAlerte
    niveau_gravite: NiveauGravite
    embarcation_id: UUID | None = None
    declencheur: dict[str, Any] = Field(..., min_length=1)
    horodatage: datetime | None = None
    statut: StatutAlerte = StatutAlerte.nouvelle


class AlerteUpdateStatut(BaseModel):
    statut: StatutAlerte


class AlerteRead(OrmModel):
    id: UUID
    type: TypeAlerte
    niveau_gravite: NiveauGravite
    embarcation_id: UUID | None
    declencheur: dict[str, Any]
    horodatage: datetime
    statut: StatutAlerte


class AlerteFilter(BaseModel):
    type: TypeAlerte | None = None
    statut: StatutAlerte | None = None
    embarcation_id: UUID | None = None
