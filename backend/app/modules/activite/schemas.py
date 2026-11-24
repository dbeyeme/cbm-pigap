"""Contrats API : activité par maille, captures par zone, rapport de zone (lot 5)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import PolygonGeoJSON


class PeriodeRead(BaseModel):
    """Période demi-ouverte : `debut` inclus, `fin` exclue (UTC)."""

    debut: datetime
    fin: datetime


class RegleRead(BaseModel):
    """Règle appliquée, avec son statut : « Proposé » tant qu'elle n'est pas validée."""

    version: str
    statut: str
    parametres: dict[str, Any]


class ZoneRef(BaseModel):
    genre: Literal["zone_reglementee", "secteur"]
    id: str
    nom: str
    type: str | None = Field(None, description="Type de zone réglementée ou de secteur")


class SecteurRead(BaseModel):
    id: str
    nom: str
    type: str | None = None
    lon: float
    lat: float
    rayon_km: float


# --- A. Heures d'activité par maille ---------------------------------------- #


class MailleProprietes(BaseModel):
    heures_activite: float
    nb_embarcations: int
    nb_intervalles: int = Field(..., description="Intervalles entre deux relevés comptés")
    sources: list[str] = Field(..., description="mobile, balise")


class MailleFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str = Field(..., description="Indices de la maille, « colonne:ligne »")
    geometry: PolygonGeoJSON
    properties: MailleProprietes


class FiltresActivite(BaseModel):
    secteur: str | None = None
    zone_id: UUID | None = None
    embarcation_id: UUID | None = None
    source: str | None = None


class TotauxActivite(BaseModel):
    heures_activite: float
    nb_embarcations: int
    nb_intervalles: int
    nb_mailles: int


class MaillesActiviteRead(BaseModel):
    """Collection GeoJSON : une maille par entité, avec la période et la règle appliquée."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[MailleFeature]
    periode: PeriodeRead
    emprise: list[float] | None = Field(
        None, description="[lon min, lat min, lon max, lat max] demandée, sinon vide"
    )
    taille_maille_deg: float
    filtres: FiltresActivite
    totaux: TotauxActivite
    regle: RegleRead
    genere_a: datetime


# --- B. Captures par zone ---------------------------------------------------- #


class VolumeEspece(BaseModel):
    espece: str
    nom: str
    quantite_kg: float
    nb_declarations: int


class GroupeCaptures(BaseModel):
    quantite_kg: float = 0.0
    nb_declarations: int = 0
    par_espece: list[VolumeEspece] = Field(default_factory=list)


class CapturesZone(BaseModel):
    dans_la_zone: GroupeCaptures
    sans_position: GroupeCaptures = Field(
        ..., description="Déclarations sans lieu de pêche : comptées à part, jamais attribuées"
    )
    positionnees_hors_zone: GroupeCaptures


class CapturesZoneRead(CapturesZone):
    zone: ZoneRef
    periode: PeriodeRead
    genere_a: datetime


# --- C. Rapport de zone ------------------------------------------------------ #


class ActiviteZone(BaseModel):
    heures_activite: float
    nb_embarcations_actives: int
    nb_intervalles: int


class EmbarcationPresente(BaseModel):
    embarcation_id: UUID
    nom: str
    immatriculation: str
    type: str | None = None
    nb_releves: int
    premier_releve: datetime
    dernier_releve: datetime
    heures_activite: float
    sources: list[str]


class AlerteZone(BaseModel):
    id: UUID
    type: str
    niveau_gravite: str
    statut: str
    horodatage: datetime
    regle: str
    embarcation_id: UUID | None = None


class AlertesZone(BaseModel):
    total: int
    par_type: dict[str, int]
    par_gravite: dict[str, int]
    elements: list[AlerteZone] = Field(..., description="Les plus récentes, liste bornée")
    sans_position: int = Field(
        ..., description="Alertes de la période sans lieu connu : comptées à part"
    )


class RapportZoneRead(BaseModel):
    zone: ZoneRef
    periode: PeriodeRead
    activite: ActiviteZone
    nb_embarcations_presentes: int
    embarcations: list[EmbarcationPresente] = Field(
        ..., description="Embarcations ayant au moins un relevé dans la zone, liste bornée"
    )
    captures: CapturesZone
    alertes: AlertesZone
    regle: RegleRead
    genere_a: datetime
