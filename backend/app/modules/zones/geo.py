"""Helpers polygones PostGIS ↔ GeoJSON (SRID 4326)."""

from __future__ import annotations

import json
from typing import Any

from geoalchemy2 import WKTElement

from app.schemas.common import PolygonGeoJSON


def polygon_to_wkt(polygon: PolygonGeoJSON) -> WKTElement:
    rings_sql: list[str] = []
    for ring in polygon.coordinates:
        if len(ring) < 4:
            raise ValueError("Un anneau de polygone doit avoir au moins 4 positions")
        if ring[0] != ring[-1]:
            raise ValueError("Un anneau de polygone doit être fermé (premier = dernier point)")
        coords = ", ".join(f"{lon} {lat}" for lon, lat in ring)
        rings_sql.append(f"({coords})")
    return WKTElement(f"POLYGON({', '.join(rings_sql)})", srid=4326)


def geojson_text_to_polygon(raw: str | None) -> PolygonGeoJSON | None:
    if not raw:
        return None
    data: dict[str, Any] = json.loads(raw)
    coords = data.get("coordinates")
    if not coords:
        return None
    rings: list[list[tuple[float, float]]] = []
    for ring in coords:
        rings.append([(float(p[0]), float(p[1])) for p in ring])
    return PolygonGeoJSON(coordinates=rings)
