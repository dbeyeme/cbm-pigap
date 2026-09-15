"""Série saisonnière fictive — 12 mois de captures + grappes d’intrusions.

Courbes documentées comme FICTIVES (pas un modèle halieutique).
À valider avec un expert : saison sèche = juin–septembre.

Prérequis : seed_production_demo.py (pêcheurs / zones démo).

Usage:
  cd backend && DATABASE_URL=... python scripts/seed_series_saisonnieres.py
"""

from __future__ import annotations

import asyncio
import math
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte, TypeZone
from app.db.models import Alerte, Capture, Embarcation, Pecheur, ZoneReglementee
from app.db.session import AsyncSessionLocal
from app.modules.geolocalisation.geo import point_to_wkt
from app.schemas.common import PointGeoJSON
from sqlalchemy import delete, select

MARKER = "série-saisonnière-démo"
SEED_SOURCE = "seed_series_saisonnieres"

# Points d’eau (côte / estuaire / Cap Lopez / Ogooué) — pas de terre.
POINTS = {
    "capitaine": (9.38, 0.48),
    "merou": (9.32, 0.42),
    "crevette": (9.36, 0.50),
    "thon": (8.90, 0.10),
    "barracuda": (8.70, -0.70),
    "sardine": (9.28, 0.46),
}

# Capitaine : plus de sorties mer calme (saison sèche).
# Crevette estuarienne : plus forte en saison des pluies.
# Sardine : baisse artificielle des 8 dernières semaines (scénario pénurie).
# Thon : volume modeste (plus hauturier) — pas de pics fluviaux.
BASE_KG = {
    "capitaine": 14.0,
    "merou": 8.0,
    "crevette": 16.0,
    "thon": 6.0,
    "barracuda": 9.0,
    "sardine": 22.0,
}


def _kg(espece: str, day: date, today: date) -> float:
    month = day.month
    seche = 6 <= month <= 9
    base = BASE_KG[espece]
    if espece == "capitaine":
        factor = 1.35 if seche else 0.85
    elif espece == "crevette":
        factor = 0.75 if seche else 1.30
    elif espece == "sardine":
        factor = 1.15 if month in (5, 6, 7) else 1.0
        if (today - day).days <= 56:
            factor *= 0.22
    elif espece == "thon":
        factor = 1.1 if month in (10, 11) else 0.95
    elif espece == "barracuda":
        factor = 1.2 if seche else 0.9
    else:
        factor = 1.0
    wobble = 1.0 + 0.08 * math.sin(day.toordinal() / 9.0)
    return round(max(0.4, base * factor * wobble), 2)


async def main() -> None:
    today = datetime.now(UTC).date()
    start = today - timedelta(days=365)

    async with AsyncSessionLocal() as session:
        boats = (await session.execute(select(Embarcation).join(Pecheur))).scalars().all()
        if not boats:
            print("Aucun pêcheur/embarcation. Lancez d'abord seed_production_demo.py")
            return

        await session.execute(delete(Capture).where(Capture.point_debarquement == MARKER))
        await session.execute(
            delete(Alerte).where(Alerte.declencheur["source"].as_string() == SEED_SOURCE)
        )
        await session.flush()

        zones = (await session.execute(select(ZoneReglementee))).scalars().all()
        interdites = [z for z in zones if z.type == TypeZone.interdite]
        if not interdites:
            print("Aucune zone interdite — pas de grappe d’intrusions.")

        n_cap = 0
        day = start
        while day <= today:
            for i, (espece, point) in enumerate(POINTS.items()):
                boat = boats[i % len(boats)]
                kg = _kg(espece, day, today)
                session.add(
                    Capture(
                        pecheur_id=boat.pecheur_id,
                        embarcation_id=boat.id,
                        espece=espece,
                        quantite_kg=kg,
                        methode="filet" if i % 2 == 0 else "ligne",
                        position_capture=point_to_wkt(PointGeoJSON(coordinates=point)),
                        point_debarquement=MARKER,
                        date_capture=datetime(day.year, day.month, day.day, 10, i, tzinfo=UTC),
                        synchronise_a=datetime.now(UTC),
                    )
                )
                n_cap += 1
            day += timedelta(days=1)
        print(f"  + {n_cap} captures saisonnières (fictives)")

        n_al = 0
        if interdites:
            hot = interdites[0]
            cold = interdites[1] if len(interdites) > 1 else None
            cursor = start
            while cursor <= today:
                month = cursor.month
                # Grappe Cap Lopez / zone 0 autour de juillet–août
                if month in (7, 8) and cursor.weekday() in (1, 4):
                    session.add(
                        Alerte(
                            id=uuid4(),
                            type=TypeAlerte.zone_interdite,
                            niveau_gravite=NiveauGravite.critique,
                            embarcation_id=boats[0].id,
                            declencheur={
                                "regle": "intrusion_zone_interdite",
                                "fingerprint": f"saison:{hot.id}:{cursor.isoformat()}",
                                "zone_id": str(hot.id),
                                "zone_nom": hot.nom,
                                "source": SEED_SOURCE,
                                "position": {
                                    "type": "Point",
                                    "coordinates": [8.65, -0.75],
                                },
                            },
                            horodatage=datetime(
                                cursor.year, cursor.month, cursor.day, 14, tzinfo=UTC
                            ),
                            statut=StatutAlerte.nouvelle,
                        )
                    )
                    n_al += 1
                if cold is not None and month == 3 and cursor.day == 15:
                    session.add(
                        Alerte(
                            id=uuid4(),
                            type=TypeAlerte.zone_interdite,
                            niveau_gravite=NiveauGravite.attention,
                            embarcation_id=boats[-1].id,
                            declencheur={
                                "regle": "intrusion_zone_interdite",
                                "fingerprint": f"saison:{cold.id}:{cursor.isoformat()}",
                                "zone_id": str(cold.id),
                                "zone_nom": cold.nom,
                                "source": SEED_SOURCE,
                            },
                            horodatage=datetime(
                                cursor.year, cursor.month, cursor.day, 11, tzinfo=UTC
                            ),
                            statut=StatutAlerte.nouvelle,
                        )
                    )
                    n_al += 1
                cursor += timedelta(days=1)
        print(f"  + {n_al} alertes intrusion (grappes fictives)")
        await session.commit()
        print("Seed séries saisonnières terminé.")


if __name__ == "__main__":
    asyncio.run(main())
