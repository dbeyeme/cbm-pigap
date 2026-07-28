"""Purge + semis de trajectoires narratives (fleuves, bras de mer, ZEE)."""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.enums import SourcePosition
from app.db.models import Embarcation, Position
from app.db.session import AsyncSessionLocal
from app.modules.geolocalisation.gabon_routes import DEMO_ROUTE_META, DEMO_ROUTES
from app.modules.geolocalisation.geo import point_to_wkt
from app.schemas.common import PointGeoJSON
from sqlalchemy import delete, select

# (scenario, offset_hours) réparti sur plusieurs bateaux — multi-sorties OK
PLAN: list[list[tuple[str, int]]] = [
    [("sortie_cote_mer", 0), ("entree_mondah", 5)],
    [("remontee_komo", 1), ("mer_vers_ogooue", 7)],
    [("ogooue_interieur", 2)],
    [("entree_etranger", 3)],
    [("ntem_fleuve", 4)],
    [("mayumba_cote", 6)],
]


async def _add_path(session, *, boat_id, scenario: str, base: datetime) -> None:
    path = DEMO_ROUTES[scenario]
    for j, (lon, lat) in enumerate(path):
        session.add(
            Position(
                embarcation_id=boat_id,
                position=point_to_wkt(PointGeoJSON(coordinates=(lon, lat))),
                horodatage=base + timedelta(minutes=j * 12),
                source=SourcePosition.mobile,
                synchronise_a=datetime.now(UTC),
            )
        )


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Position))
        await session.flush()
        boats = list(
            (await session.execute(select(Embarcation).order_by(Embarcation.nom))).scalars().all()
        )
        preferred = [b for b in boats if "M2" in (b.immatriculation or "")]
        pool = preferred if preferred else boats
        if not pool:
            await session.commit()
            print("Aucune embarcation — crée-en via l’app agent.")
            return

        day = datetime.now(UTC).replace(hour=5, minute=0, second=0, microsecond=0)
        for i, trips in enumerate(PLAN):
            boat = pool[i % len(pool)]
            for scenario, hours in trips:
                await _add_path(
                    session,
                    boat_id=boat.id,
                    scenario=scenario,
                    base=day + timedelta(hours=hours),
                )
                meta = DEMO_ROUTE_META[scenario]
                print(f"• {boat.nom} ({boat.immatriculation}) " f"« {meta['label']} » +{hours}h")

        await session.commit()
        print(f"Purge OK — {sum(len(t) for t in PLAN)} trajectoires semées.")


if __name__ == "__main__":
    asyncio.run(main())
