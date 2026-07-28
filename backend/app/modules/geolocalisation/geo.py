"""Helpers géométrie PostGIS ↔ GeoJSON (SRID 4326)."""

from __future__ import annotations

import json
from typing import Any

from geoalchemy2 import WKTElement
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.schemas.common import PointGeoJSON


def point_to_wkt(point: PointGeoJSON) -> WKTElement:
    lon, lat = point.coordinates
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def geojson_text_to_point(raw: str | None) -> PointGeoJSON | None:
    if not raw:
        return None
    data: dict[str, Any] = json.loads(raw)
    coords = data.get("coordinates")
    if not coords or len(coords) < 2:
        return None
    return PointGeoJSON(coordinates=(float(coords[0]), float(coords[1])))


def with_point_geojson(stmt: Select, geom_column: ColumnElement) -> Select:
    return stmt.add_columns(ST_AsGeoJSON(geom_column).label("position_geojson"))


async def fetch_rows_with_geojson(db: AsyncSession, stmt: Select) -> list[Any]:
    result = await db.execute(stmt)
    return list(result.all())
