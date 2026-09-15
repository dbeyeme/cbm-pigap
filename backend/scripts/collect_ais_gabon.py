#!/usr/bin/env python3
"""Collecte AIS réel dans la ZEE Gabon et écrit un snapshot.

Prérequis recommandé : clé gratuite https://aisstream.io → AISSTREAM_API_KEY

Usage:
  cd backend && source .venv/bin/activate
  export AISSTREAM_API_KEY=...
  python scripts/collect_ais_gabon.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.modules.ais_gabon import service


async def main() -> None:
    print("Collecte AIS ZEE Gabon…")
    print(f"  AISSTREAM_API_KEY: {'oui' if settings.aisstream_api_key else 'NON — flux souvent vide'}")
    out = await service.refresh_ais_cache(force=True)
    real = [v for v in out.vessels if not v.demo]
    print(f"Source: {out.source}")
    print(f"Note: {out.note}")
    print(f"Navires (réels): {len(real)} / total {len(out.vessels)}")
    for v in real[:20]:
        lon, lat = v.position.coordinates
        print(f"  · {v.nom} MMSI={v.mmsi} {lon:.4f},{lat:.4f} [{v.provider}]")
    if real:
        print(f"Snapshot: {service._SNAPSHOT_PATH}")
    else:
        print(
            "Aucun AIS réel. Crée une clé sur https://aisstream.io "
            "(GitHub), ajoute AISSTREAM_API_KEY dans .env, relance."
        )


if __name__ == "__main__":
    asyncio.run(main())
