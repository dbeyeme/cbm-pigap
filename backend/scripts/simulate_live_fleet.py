#!/usr/bin/env python3
"""Simule une flotte légère en circulation (côte + fleuves) le long des corridors open data.

Poste périodiquement la position suivante de chaque embarcation (horodatage = maintenant).
Near-live MVP — pas d'AIS / IoT (§ hors périmètre).

Usage:
  cd backend && source .venv/bin/activate
  python scripts/simulate_live_fleet.py
  # intervalle : LIVE_INTERVAL_SEC=20 python scripts/simulate_live_fleet.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.enums import SourcePosition
from app.db.models import Embarcation, Position
from app.db.session import AsyncSessionLocal
from app.modules.geolocalisation.gabon_routes import DEMO_ROUTE_META, DEMO_ROUTES, is_on_water
from app.modules.geolocalisation.geo import point_to_wkt
from app.schemas.common import PointGeoJSON
from sqlalchemy import select

# Une route narrative par bateau — aligné seed_maritime / seed_production (5 max)
ASSIGN: list[tuple[str, str]] = [
    ("Pirogue Espoir", "sortie_cote_mer"),
    ("Pirogue Mondah", "entree_mondah"),
    ("Pirogue Ogooué", "mer_vers_ogooue"),
    ("Chaloupe Cap Lopez", "rade_port_gentil"),
    ("Pirogue Mayumba", "mayumba_cote"),
]


def _pick(boats: list[Embarcation], name: str, used: set) -> Embarcation | None:
    free = [b for b in boats if b.id not in used]
    exact = [b for b in free if (b.nom or "").strip().lower() == name.lower()]
    if exact:
        return exact[0]
    key = name.split()[-1].lower()
    soft = [b for b in free if key in (b.nom or "").lower()]
    return soft[0] if soft else None


async def main() -> None:
    interval = max(5, int(os.environ.get("LIVE_INTERVAL_SEC", "20")))
    async with AsyncSessionLocal() as session:
        boats = list(
            (await session.execute(select(Embarcation).order_by(Embarcation.nom))).scalars().all()
        )
    if not boats:
        print("Aucune embarcation en base.")
        return

    state: list[tuple[object, str, int]] = []
    used: set = set()
    for boat_name, rid in ASSIGN:
        if rid not in DEMO_ROUTES:
            continue
        boat = _pick(boats, boat_name, used)
        if boat is None:
            continue
        used.add(boat.id)
        state.append((boat, rid, 0))

    print(
        f"Flotte live : {len(state)} embarcation(s), tick={interval}s, "
        "Ctrl+C pour arrêter."
    )
    for boat, rid, _ in state:
        meta = DEMO_ROUTE_META.get(rid, {})
        print(f"  • {boat.nom} → {meta.get('label', rid)}")

    while True:
        now = datetime.now(UTC)
        async with AsyncSessionLocal() as session:
            for i, (boat, rid, idx) in enumerate(state):
                path = DEMO_ROUTES[rid]
                lon, lat = path[idx % len(path)]
                if not is_on_water(lon, lat):
                    print(f"skip hors eau {boat.nom} {lon},{lat}")
                    state[i] = (boat, rid, (idx + 1) % len(path))
                    continue
                session.add(
                    Position(
                        embarcation_id=boat.id,
                        position=point_to_wkt(PointGeoJSON(coordinates=(lon, lat))),
                        horodatage=now,
                        source=SourcePosition.mobile,
                        synchronise_a=now,
                    )
                )
                state[i] = (boat, rid, (idx + 1) % len(path))
                print(f"{now.strftime('%H:%M:%S')} {boat.nom} [{rid}] {lon:.4f},{lat:.4f}")
            await session.commit()
        await asyncio.sleep(interval)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nArrêt simulateur.")
