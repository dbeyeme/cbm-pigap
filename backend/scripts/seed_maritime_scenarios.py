"""Purge + semis de trajectoires narratives (fleuves, bras de mer, ZEE).

Jeu léger : un corridor par bateau (pas de téléport Estuaire→Mondah / Komo→Ogooué).
AIS étranger = couche séparée — pas de GPS mobile sur `entree_etranger`.
"""

from __future__ import annotations

import asyncio
import math
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

# Un seul corridor par embarcation (nom → scénario, offset_h)
# Aligné seed_production_demo + simulate_live_fleet
PLAN: list[tuple[str, str, int]] = [
    ("Pirogue Espoir", "sortie_cote_mer", 0),
    ("Pirogue Mondah", "entree_mondah", 1),
    ("Pirogue Ogooué", "mer_vers_ogooue", 2),
    ("Chaloupe Cap Lopez", "rade_port_gentil", 3),
    ("Pirogue Mayumba", "mayumba_cote", 4),
]

# Vitesse artisanale ~12–15 km/h → ~0.22 km/min ; plancher 8 min entre points
_KM_PER_MIN = 0.22
_MIN_STEP_MIN = 8


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = a
    lon2, lat2 = b
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _step_minutes(prev: tuple[float, float] | None, curr: tuple[float, float]) -> int:
    if prev is None:
        return 0
    dist = _haversine_km(prev, curr)
    return max(_MIN_STEP_MIN, int(round(dist / _KM_PER_MIN)))


async def _add_path(session, *, boat_id, scenario: str, base: datetime) -> list[tuple[float, float]]:
    path = DEMO_ROUTES[scenario]
    elapsed = 0
    prev: tuple[float, float] | None = None
    for lon, lat in path:
        elapsed += _step_minutes(prev, (lon, lat))
        session.add(
            Position(
                embarcation_id=boat_id,
                position=point_to_wkt(PointGeoJSON(coordinates=(lon, lat))),
                horodatage=base + timedelta(minutes=elapsed),
                source=SourcePosition.mobile,
                synchronise_a=datetime.now(UTC),
            )
        )
        prev = (lon, lat)
    return path


def _pick_boat(pool: list[Embarcation], name: str) -> Embarcation | None:
    exact = [b for b in pool if (b.nom or "").strip().lower() == name.lower()]
    if exact:
        return exact[0]
    # Fallback immat M2 + sous-chaîne du nom
    key = name.split()[-1].lower() if name else ""
    soft = [b for b in pool if key and key in (b.nom or "").lower()]
    return soft[0] if soft else None


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
            print("Aucune embarcation — crée-en via seed_production_demo ou l’app agent.")
            return

        day = datetime.now(UTC).replace(hour=5, minute=0, second=0, microsecond=0)
        live_tip: dict = {}
        used_ids: set = set()
        n_trips = 0

        for idx, (boat_name, scenario, hours) in enumerate(PLAN):
            if scenario not in DEMO_ROUTES:
                print(f"  skip scénario inconnu : {scenario}")
                continue
            boat = _pick_boat([b for b in pool if b.id not in used_ids], boat_name)
            if boat is None:
                # dernier recours : round-robin sur le pool restant
                leftovers = [b for b in pool if b.id not in used_ids]
                if not leftovers:
                    print(f"  skip {boat_name} — plus d’embarcation libre")
                    continue
                boat = leftovers[0]
                print(f"  ⚠ fallback {boat.nom} pour « {boat_name} »")
            used_ids.add(boat.id)
            path = await _add_path(
                session,
                boat_id=boat.id,
                scenario=scenario,
                base=day + timedelta(hours=hours),
            )
            meta = DEMO_ROUTE_META.get(scenario, {})
            print(f"• {boat.nom} ({boat.immatriculation}) « {meta.get('label', scenario)} » +{hours}h")
            if path:
                live_tip[boat.id] = (boat, path[-1], idx)
            n_trips += 1

        now = datetime.now(UTC)
        for boat, (lon, lat), idx in live_tip.values():
            session.add(
                Position(
                    embarcation_id=boat.id,
                    position=point_to_wkt(PointGeoJSON(coordinates=(lon, lat))),
                    horodatage=now - timedelta(seconds=idx * 45),
                    source=SourcePosition.mobile,
                    synchronise_a=now,
                )
            )
            print(f"  ↳ live {boat.nom} @ {lon:.3f},{lat:.3f}")

        await session.commit()
        print(
            f"Purge OK — {n_trips} trajectoire(s) (1 corridor / bateau) + "
            f"{len(live_tip)} positions live. Pas d’entree_etranger / ntem_fleuve."
        )


if __name__ == "__main__":
    asyncio.run(main())
