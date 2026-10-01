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


class RepartitionLibelle(BaseModel):
    code: str
    libelle: str
    volume_kg: float
    nb_captures: int = 0


class DashboardRead(BaseModel):
    pecheurs_actifs: int
    volume_total_kg: float
    repartition_especes: list[RepartitionEspece]
    alertes_actives: list[AlerteRead]
    zones_forte_activite: list[ZoneActivite]
    periode_debut: datetime | None = None
    periode_fin: datetime | None = None
    genere_a: datetime = Field(..., description="Horodatage de calcul des indicateurs")
    # Indicateurs d'effort et de recettes (repères des tableurs 2024 de l'administration)
    nb_debarquements: int = 0
    jours_de_peche: int = 0
    kg_par_jour_de_peche: float = 0.0
    valeur_estimee_fcfa: float = 0.0
    valeur_estimee_couverture_pct: float = 0.0
    taxe_due_fcfa: float = 0.0
    taxe_payee_fcfa: float = 0.0
    licences_expirees: int = 0
    licences_valides: int = 0
    controles_periode: int = 0
    infractions_periode: int = 0
    repartition_groupes: list[RepartitionLibelle] = []
    repartition_engins: list[RepartitionLibelle] = []
    repartition_sites: list[RepartitionLibelle] = []


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
