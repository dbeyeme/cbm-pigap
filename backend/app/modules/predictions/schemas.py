"""Contrats API — prédictions consultatives (ADR-006)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import PointGeoJSON

HorizonJours = Literal[7, 30]
ModePrediction = Literal["ok", "insuffisant"]
RisquePenurie = Literal["faible", "moyen", "eleve"]


class PechePrediction(BaseModel):
    espece: str
    volume_prevu_kg: float
    intervalle_bas_kg: float
    intervalle_haut_kg: float
    justification: dict[str, Any]


class PenuriePrediction(BaseModel):
    espece: str
    risque: RisquePenurie
    volume_4sem_kg: float
    baseline_saison_kg: float
    volume_prevu_30j_kg: float
    justification: dict[str, Any]


class IntrusionPrediction(BaseModel):
    zone_id: UUID | None = None
    zone_nom: str
    count_prevu: float
    score: float = Field(..., ge=0.0, le=1.0)
    justification: dict[str, Any]


class ZoneIncidentPrediction(BaseModel):
    zone_id: UUID | None = None
    zone_nom: str
    centre: PointGeoJSON | None = None
    score: float
    count_intrusions_hist: int
    volume_captures_kg: float
    quota_taux_max: float | None = None
    justification: dict[str, Any]


class PredictionsRead(BaseModel):
    horizon_jours: int
    mode: ModePrediction
    peches: list[PechePrediction]
    penuries: list[PenuriePrediction]
    intrusions: list[IntrusionPrediction]
    zones_incidents: list[ZoneIncidentPrediction]
    genere_a: datetime
