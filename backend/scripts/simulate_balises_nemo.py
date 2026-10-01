#!/usr/bin/env python3
"""Simule un flux de balises satellitaires avec des données FICTIVES (ADR-009).

Attribue un identifiant de balise fictif (BAL-FICTIF-xxxx) aux embarcations qui
n'en ont pas, puis poste périodiquement un lot de messages au format pivot sur
`POST /api/v1/positions/balises/ingest`, le long des corridors open data.
Aucune donnée réelle : les numéros de série et les trajets sont inventés.

Usage:
  cd backend && source .venv/bin/activate
  BALISE_INGEST_KEY=demo-balise python scripts/simulate_balises_nemo.py
  # API distante : API_URL=https://… ; cadence : BALISE_INTERVAL_SEC=30
  # un seul lot puis sortie : BALISE_ONCE=1 ; détresse sur la 1re pirogue : BALISE_SOS=1
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.models import Embarcation
from app.db.session import AsyncSessionLocal
from app.modules.geolocalisation.gabon_routes import DEMO_ROUTES

ROUTES = ["sortie_cote_mer", "entree_mondah", "mer_vers_ogooue", "rade_port_gentil", "mayumba_cote"]


async def _assign_balises(limit: int) -> list[tuple[str, str]]:
    """Retourne [(balise_id, nom)] ; crée des identifiants fictifs si absents."""
    async with AsyncSessionLocal() as session:
        boats = list(
            (await session.execute(select(Embarcation).order_by(Embarcation.nom))).scalars().all()
        )[:limit]
        out: list[tuple[str, str]] = []
        for i, boat in enumerate(boats, start=1):
            if not boat.balise_id:
                boat.balise_id = f"BAL-FICTIF-{i:04d}"
            out.append((boat.balise_id, boat.nom))
        await session.commit()
        return out


async def main() -> None:
    api = os.environ.get("API_URL", "http://localhost:8000").rstrip("/")
    key = os.environ.get("BALISE_INGEST_KEY", "")
    if not key:
        print("BALISE_INGEST_KEY manquante (même valeur que l'API).")
        return
    interval = max(5, int(os.environ.get("BALISE_INTERVAL_SEC", "30")))
    once = os.environ.get("BALISE_ONCE") == "1"
    sos = os.environ.get("BALISE_SOS") == "1"

    balises = await _assign_balises(len(ROUTES))
    if not balises:
        print("Aucune embarcation en base : lancez d'abord seed_maritime_scenarios.py.")
        return
    tracks = [
        (bid, nom, [p for p in DEMO_ROUTES[route]])
        for (bid, nom), route in zip(balises, ROUTES, strict=False)
    ]
    print(f"{len(tracks)} balises fictives → {api}/api/v1/positions/balises/ingest")

    step = 0
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            now = datetime.now(UTC).isoformat()
            messages = []
            for i, (bid, _nom, pts) in enumerate(tracks):
                lon, lat = pts[step % len(pts)]
                messages.append(
                    {
                        "balise_id": bid,
                        "lat": lat,
                        "lon": lon,
                        "horodatage": now,
                        "vitesse_noeuds": 4.5,
                        "alerte": bool(sos and i == 0),
                    }
                )
            resp = await client.post(
                f"{api}/api/v1/positions/balises/ingest",
                json={"fournisseur": "fictif", "messages": messages},
                headers={"X-Balise-Ingest-Key": key},
            )
            print(f"[{now}] lot {step + 1} → {resp.status_code} {resp.text[:160]}")
            step += 1
            if once:
                return
            await asyncio.sleep(interval)


if __name__ == "__main__":
    asyncio.run(main())
