"""Schémas lot 8 — périmètre de suivi."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import TypePerimetre
from app.schemas.common import PolygonGeoJSON


class PerimetreZoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    libelle: str
    type_zone: TypePerimetre
    actif: bool
    emprise: PolygonGeoJSON | None = None
    date_creation: datetime
    date_mise_a_jour: datetime


class PerimetreZonePatch(BaseModel):
    actif: bool = Field(..., description="Activation ou désactivation de la zone de périmètre")


class PerimetreFiltreRead(BaseModel):
    """Emprise union des zones actives (staff)."""

    codes_actifs: list[str]
    nombre_actifs: int
    emprise_geojson: dict | None = None


class AgentZonesRead(BaseModel):
    """Zones de périmètre affectées à un agent (§7)."""

    utilisateur_id: UUID
    codes: list[str]


class AgentZonesUpdate(BaseModel):
    """Remplace l'ensemble des zones affectées (codes de perimetre_zones)."""

    codes: list[str] = Field(default_factory=list, description="Codes de zones, ex. estuaire")
