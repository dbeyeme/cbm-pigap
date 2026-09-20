#!/usr/bin/env python3
"""Synchronise les données ouvertes Gabon vers l'image backend (app/data/gabon).

Usage : cd backend && python scripts/sync_data.py
À lancer après toute modification de data/open-data/gabon/ (ports, secteurs, ZEE).
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "open-data" / "gabon"
DST = ROOT / "backend" / "app" / "data" / "gabon"
FILES = (
    "eez_marineregions.geojson",
    "water_mask.geojson",
    "ports.json",
    "secteurs_mer.json",
    "demo_routes_opendata.json",
)

if __name__ == "__main__":
    DST.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copy2(SRC / name, DST / name)
        print(f"  {name} → {DST.relative_to(ROOT)}")
    print("Synchronisation terminée.")
