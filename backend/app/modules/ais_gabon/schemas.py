"""Schémas API — AIS ZEE Gabon (couche surveillance, pas GPS pêcheurs)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import PointGeoJSON


class AisVesselRead(BaseModel):
    mmsi: str
    nom: str
    position: PointGeoJSON
    horodatage: datetime
    sog_kn: float | None = Field(None, description="Vitesse (nœuds) si connue")
    cog_deg: float | None = Field(None, description="Cap (° ) si connu")
    ship_type: str | None = None
    provider: str = "openwaters"
    demo: bool = Field(False, description="True si marqueur de démonstration")


class AisLiveResponse(BaseModel):
    enabled: bool
    vessels: list[AisVesselRead]
    fetched_at: datetime | None = None
    source: str
    note: str = ""
    eez_filter: bool = True
