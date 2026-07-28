"""Purge les positions GPS à terre / hors eau (anomalies démo)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.models import Position
from app.db.session import AsyncSessionLocal
from app.modules.geolocalisation.gabon_routes import is_on_water
from app.modules.geolocalisation.geo import geojson_text_to_point
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import delete, select


async def main() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Position, ST_AsGeoJSON(Position.position).label("geo"))
        )
        to_delete: list = []
        kept = 0
        for pos, geo in result.all():
            point = geojson_text_to_point(geo)
            if point is None:
                to_delete.append(pos.id)
                continue
            lon, lat = point.coordinates
            if is_on_water(lon, lat):
                kept += 1
            else:
                to_delete.append(pos.id)
        if to_delete:
            await session.execute(delete(Position).where(Position.id.in_(to_delete)))
            await session.commit()
        print(f"Purge OK — supprimées: {len(to_delete)} · conservées (eau): {kept}")


if __name__ == "__main__":
    asyncio.run(main())
