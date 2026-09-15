"""Contrats API M2 — géolocalisation (§5.2)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.enums import SourcePosition
from app.schemas.common import OrmModel, PointGeoJSON


class PositionCreate(BaseModel):
    embarcation_id: UUID
    position: PointGeoJSON
    horodatage: datetime
    source: SourcePosition = SourcePosition.mobile


class PositionBatchCreate(BaseModel):
    positions: list[PositionCreate] = Field(..., min_length=1)


class PositionRead(OrmModel):
    id: UUID
    embarcation_id: UUID
    position: PointGeoJSON
    horodatage: datetime
    source: SourcePosition
    synchronise_a: datetime | None


class TrajectoryQuery(BaseModel):
    embarcation_id: UUID
    debut: datetime | None = None
    fin: datetime | None = None


class EmbarcationTrackRead(OrmModel):
    """Embarcation listée pour le suivi GPS, avec indicateur de trajectoire."""

    id: UUID
    pecheur_id: UUID
    nom: str
    immatriculation: str
    type: str | None
    positions_count: int = 0
    derniere_position_a: datetime | None = None


class LiveVesselRead(BaseModel):
    """Dernière position connue d'une embarcation (vue circulation / near-live)."""

    embarcation_id: UUID
    nom: str
    immatriculation: str
    type: str | None = None
    position: PointGeoJSON
    horodatage: datetime
    source: SourcePosition
    age_seconds: int = Field(..., description="Âge de la dernière position (s)")
    statut: str = Field(
        ...,
        description="actif (<5 min) | recent (<30 min) | silence (dans la fenêtre)",
    )
    secteur: str = Field(
        ...,
        description="cote | bras_mer | fleuve — classification indicative Gabon",
    )


class TrajectorySegmentRead(BaseModel):
    """Une sortie / trajet (plusieurs possibles par embarcation)."""

    id: str
    embarcation_id: UUID
    embarcation_nom: str
    immatriculation: str
    type: str | None = None
    index: int = Field(..., description="N° de sortie pour cette embarcation (1..n)")
    debut: datetime
    fin: datetime
    points_count: int
    points: list[PositionRead]


class LicenceDossierRead(BaseModel):
    """Dossier licence + trajectoires (recherche M2)."""

    pecheur_id: UUID
    nom: str
    prenom: str
    numero_licence: str
    statut: str
    embarcations: list[EmbarcationTrackRead]
    trajectories: list[TrajectorySegmentRead]
    # Anticipation M7 (pas encore d'alertes métier) — cadre d'interprétation
    note_infractions: str = (
        "Module M2 : historique GPS uniquement. En M7, si une alerte "
        "(zone interdite / quota) cible une embarcation de cette licence valide, "
        "cela constituera une infraction à traiter."
    )
