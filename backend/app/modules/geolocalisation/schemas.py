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


class DeclarationPresenceRead(BaseModel):
    """Déclaration de capture rapprochée d'un port et de la présence GPS."""

    embarcation_id: UUID
    embarcation_nom: str
    port_id: str
    port_nom: str
    date: datetime
    quantite_kg: float
    coherence: str = Field(
        ..., description="coherente | incoherente | non_verifiable (absence de GPS)"
    )


class EmbarcationPresenceRead(BaseModel):
    embarcation_id: UUID
    nom: str
    immatriculation: str
    type: str | None = None
    statut: str = Field(..., description="a_quai | en_manoeuvre | en_mer | sans_signal")
    port_id: str | None = None
    port_nom: str | None = None
    depuis: datetime | None = Field(None, description="Début de l'état courant")
    derniere_position: datetime | None = None
    age_s: int | None = None
    dernier_port_id: str | None = None
    dernier_port_nom: str | None = None
    dernier_depart: datetime | None = None
    declaration: DeclarationPresenceRead | None = None


class PortPresenceRead(BaseModel):
    id: str
    nom: str
    type: str
    lon: float
    lat: float
    rayon_km: float
    a_quai: int = 0
    en_manoeuvre: int = 0
    arrivees: int = Field(0, description="Arrivées détectées sur la fenêtre")
    departs: int = Field(0, description="Départs détectés sur la fenêtre")
    debarquements_declares: int = 0
    embarcations: list[EmbarcationPresenceRead] = Field(default_factory=list)


class PortPresenceResponse(BaseModel):
    fetched_at: datetime
    fenetre_heures: int
    seuil_minutes: int
    ports: list[PortPresenceRead]
    en_mer: list[EmbarcationPresenceRead] = Field(default_factory=list)
    sans_signal: int = 0
    total_suivies: int = 0
    incoherences: list[DeclarationPresenceRead] = Field(default_factory=list)
