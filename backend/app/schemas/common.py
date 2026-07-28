"""Schémas partagés — erreurs API §6, géométrie GeoJSON, pagination."""

from __future__ import annotations

from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    """Format d'erreur uniforme (§6)."""

    detail: str
    code: str


class PointGeoJSON(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float] = Field(
        ...,
        description="[longitude, latitude] — SRID 4326",
    )


class PolygonGeoJSON(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]] = Field(
        ...,
        description="Anneaux [longitude, latitude] — SRID 4326",
    )


class MessageResponse(BaseModel):
    detail: str


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class IdResponse(BaseModel):
    id: UUID


class DeclencheurAlerte(BaseModel):
    """Structure minimale attendue dans Alerte.declencheur (§4 traçabilité)."""

    regle: str
    seuil: Any | None = None
    donnees: dict[str, Any] = Field(default_factory=dict)
