"""Contrats API M3 — zones réglementées (§5.3)."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.enums import TypeZone
from app.schemas.common import OrmModel, PointGeoJSON, PolygonGeoJSON


class ZoneCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=255)
    type: TypeZone
    geometrie: PolygonGeoJSON
    periode_debut: date | None = None
    periode_fin: date | None = None
    actif: bool = True


class ZoneUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=255)
    type: TypeZone | None = None
    geometrie: PolygonGeoJSON | None = None
    periode_debut: date | None = None
    periode_fin: date | None = None
    actif: bool | None = None


class ZoneRead(OrmModel):
    id: UUID
    nom: str
    type: TypeZone
    geometrie: PolygonGeoJSON
    periode_debut: date | None
    periode_fin: date | None
    actif: bool


class ZoneGeoJSONImport(BaseModel):
    """Import GeoJSON FeatureCollection simplifié (MVP §5.3)."""

    type: str = "FeatureCollection"
    features: list[dict]


class ZoneImportResult(BaseModel):
    imported: int
    zones: list[ZoneRead]


class IntersectionCheckRequest(BaseModel):
    position: PointGeoJSON
    types: list[TypeZone] | None = None
    a_la_date: date | None = Field(
        None,
        description="Date de référence pour periode_debut/fin (défaut: aujourd'hui)",
    )


class IntersectionCheckResponse(BaseModel):
    intersects: bool
    zones: list[ZoneRead]
    # Point d'extension M7 : pas d'alerte créée ici — uniquement la détection.
