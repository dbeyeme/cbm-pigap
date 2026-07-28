"""Seed / reset de zones réglementées démo — polygones ciblés (pas un pavage national).

Usage:
  cd backend && python scripts/seed_zones_demo.py           # ajoute si absentes
  cd backend && python scripts/seed_zones_demo.py --reset   # purge test+démo puis recrée

Règle métier MVP : une zone = un secteur précis (estuaire, rade, tronçon fluvial),
pas un ruban le long de toute la côte ni un pavage de l'intérieur du pays.
Polygones fictifs — ne correspondent pas à un arrêté réel.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.db.enums import TypeZone
from app.db.models import ZoneReglementee
from app.db.session import AsyncSessionLocal
from app.modules.zones.geo import polygon_to_wkt
from app.schemas.common import PolygonGeoJSON

# Trois secteurs distincts et séparés géographiquement (Estuaire / Cap Lopez / Ogooué).
DEMO_ZONES = [
    {
        "nom": "Zone sensible baie de Mondah (démo)",
        "type": TypeZone.sensible,
        "ring": [
            (9.30, 0.78),
            (9.42, 0.78),
            (9.42, 0.92),
            (9.30, 0.92),
            (9.30, 0.78),
        ],
    },
    {
        "nom": "Zone interdite rade Cap Lopez (démo)",
        "type": TypeZone.interdite,
        "ring": [
            (8.55, -0.85),
            (8.72, -0.85),
            (8.72, -0.68),
            (8.55, -0.68),
            (8.55, -0.85),
        ],
    },
    {
        "nom": "Zone protégée Ogooué — Lambaréné (démo)",
        "type": TypeZone.protegee,
        "ring": [
            (10.15, -0.82),
            (10.35, -0.82),
            (10.35, -0.62),
            (10.15, -0.62),
            (10.15, -0.82),
        ],
    },
]

DEMO_NOMS = {z["nom"] for z in DEMO_ZONES}

# Anciens noms seed + patterns de tests UI
LEGACY_DEMO_NOMS = {
    "Zone sensible Estuaire (démo)",
    "Zone interdite Cap Lopez (démo)",
    "Zone sensible Estuaire (import)",
}


def _is_test_or_demo_name(nom: str) -> bool:
    n = nom.strip().lower()
    if nom in DEMO_NOMS or nom in LEGACY_DEMO_NOMS:
        return True
    if n.startswith("zone test"):
        return True
    if " (démo)" in n or " (demo)" in n or "(import)" in n:
        return True
    return False


async def purge_test_and_demo(session) -> int:
    result = await session.execute(select(ZoneReglementee))
    to_drop = [z.id for z in result.scalars().all() if _is_test_or_demo_name(z.nom)]
    if to_drop:
        await session.execute(delete(ZoneReglementee).where(ZoneReglementee.id.in_(to_drop)))
    return len(to_drop)


async def seed(session) -> int:
    created = 0
    for item in DEMO_ZONES:
        existing = await session.execute(
            select(ZoneReglementee).where(ZoneReglementee.nom == item["nom"])
        )
        if existing.scalar_one_or_none():
            print(f"  déjà présente : {item['nom']}")
            continue
        poly = PolygonGeoJSON(coordinates=[item["ring"]])
        session.add(
            ZoneReglementee(
                nom=item["nom"],
                type=item["type"],
                geometrie=polygon_to_wkt(poly),
                actif=True,
            )
        )
        created += 1
        print(f"  + {item['type'].value} · {item['nom']}")
    return created


async def main() -> None:
    reset = "--reset" in sys.argv
    async with AsyncSessionLocal() as session:
        if reset:
            n = await purge_test_and_demo(session)
            print(f"Purge test/démo : {n} zone(s) supprimée(s)")
        created = await seed(session)
        await session.commit()
        print(f"Zones démo créées : {created} (total catalogue cible : {len(DEMO_ZONES)})")
        print("Rappel : zones ciblées — pas de couverture côte entière ni intérieur terrestre.")


if __name__ == "__main__":
    asyncio.run(main())
