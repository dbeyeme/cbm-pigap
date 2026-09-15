"""Contrats API M6 — tableau de bord (§5.6)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.alertes.schemas import AlerteRead
from app.schemas.common import PointGeoJSON


class RepartitionEspece(BaseModel):
    espece: str
    volume_kg: float


class ZoneActivite(BaseModel):
    """Point agrégé pour la carte « zones à forte activité »."""

    label: str | None = None
    centre: PointGeoJSON
    nb_captures: int
    volume_kg: float


class DashboardQuery(BaseModel):
    debut: datetime | None = None
    fin: datetime | None = None


class DashboardRead(BaseModel):
    pecheurs_actifs: int
    volume_total_kg: float
    repartition_especes: list[RepartitionEspece]
    alertes_actives: list[AlerteRead]
    zones_forte_activite: list[ZoneActivite]
    periode_debut: datetime | None = None
    periode_fin: datetime | None = None
    genere_a: datetime = Field(..., description="Horodatage de calcul des indicateurs")


class DashboardEmbarcationFilter(BaseModel):
    embarcation_id: UUID | None = None


GrainSerie = Literal["jour", "semaine", "mois"]


class VolumePeriode(BaseModel):
    periode: str
    volume_kg: float


class EspecePeriode(BaseModel):
    periode: str
    espece: str
    volume_kg: float


class AlertePeriode(BaseModel):
    periode: str
    type: str
    count: int


class SaisonPeriode(BaseModel):
    periode: str
    saison: str


class DashboardSeriesRead(BaseModel):
    grain: GrainSerie
    volume_par_periode: list[VolumePeriode]
    especes_par_periode: list[EspecePeriode]
    alertes_par_periode: list[AlertePeriode]
    saisons: list[SaisonPeriode]
    periode_debut: datetime | None = None
    periode_fin: datetime | None = None
    genere_a: datetime
