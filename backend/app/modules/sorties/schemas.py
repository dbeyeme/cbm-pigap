"""Contrats API des sorties en mer et du lieu de pêche proposé (lot 11)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import PointGeoJSON

StatutSortie = Literal["en_cours", "en_retard", "terminee"]


class SortieCreate(BaseModel):
    """Déclaration idempotente : un renvoi du même `client_id` complète la sortie."""

    client_id: UUID = Field(..., description="Identifiant donné par le téléphone")
    embarcation_id: UUID
    port_depart_id: str | None = Field(None, min_length=1, max_length=64)
    position_depart: PointGeoJSON | None = None
    depart_a: datetime
    retour_prevu_a: datetime
    secteur_vise: str | None = Field(None, min_length=1, max_length=64)
    retour_a: datetime | None = None
    port_retour_id: str | None = Field(None, min_length=1, max_length=64)
    position_retour: PointGeoJSON | None = None


class SortieRetour(BaseModel):
    retour_a: datetime | None = Field(None, description="Vide : maintenant")
    port_retour_id: str | None = Field(None, min_length=1, max_length=64)
    position_retour: PointGeoJSON | None = None


class SortieRead(BaseModel):
    id: UUID
    client_id: UUID
    embarcation_id: UUID
    embarcation_nom: str
    immatriculation: str
    pecheur_id: UUID
    pecheur_nom: str
    port_depart_id: str | None
    port_depart_nom: str | None
    position_depart: PointGeoJSON | None
    depart_a: datetime
    retour_prevu_a: datetime
    secteur_vise: str | None
    secteur_vise_nom: str | None
    retour_a: datetime | None
    port_retour_id: str | None
    port_retour_nom: str | None
    position_retour: PointGeoJSON | None
    statut: StatutSortie
    retard_minutes: int = Field(0, description="Minutes au-delà de l'heure de retour prévue")
    alerte_emise: bool
    retour_constate_par: str | None
    derniere_position: PointGeoJSON | None
    derniere_position_a: datetime | None


class EnteteRegle(BaseModel):
    version: str
    statut: str
    valideurs: list[str]


class LieuDePecheRead(BaseModel):
    disponible: bool
    position: PointGeoJSON | None
    debut: datetime
    fin: datetime
    releves: int = Field(0, description="Relevés retenus hors des abords des ports")
    duree_minutes: int = Field(0, description="Temps cumulé autour du point proposé")
    motif: str
    regle: EnteteRegle
