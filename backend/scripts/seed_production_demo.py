"""Seed démo production — jeu de données propre (pas le dump local de tests).

Crée : admin, agent, 5 pêcheurs/embarcations (1 corridor chacun), zones,
trajectoires GPS, quelques captures et un quota.

Usage:
  cd backend && DATABASE_URL=... python scripts/seed_production_demo.py
"""

from __future__ import annotations

import asyncio
import math
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.core.security import hash_password
from app.db.enums import RoleUtilisateur, SourcePosition, TypeZone
from app.db.models import (
    Capture,
    Embarcation,
    Pecheur,
    Position,
    Quota,
    Utilisateur,
    ZoneReglementee,
)
from app.db.session import AsyncSessionLocal
from app.modules.geolocalisation.gabon_routes import DEMO_ROUTE_META, DEMO_ROUTES
from app.modules.geolocalisation.geo import point_to_wkt
from app.modules.zones.geo import polygon_to_wkt
from app.schemas.common import PointGeoJSON, PolygonGeoJSON

# (nom, prenom, licence, immat, boat_nom, email, boat_type)
DEMO_PECHEURS = [
    ("Mba", "Jean", "LIC-DEMO-01", "GA-M2-DEMO-01", "Pirogue Espoir", "pecheur1@example.com", "pirogue"),
    ("Allogo", "Claire", "LIC-DEMO-04", "GA-M2-DEMO-04", "Pirogue Mondah", "pecheur4@example.com", "pirogue"),
    ("Boussougou", "Amina", "LIC-DEMO-06", "GA-M2-DEMO-06", "Pirogue Ogooué", "pecheur6@example.com", "pirogue"),
    (
        "Mintsa",
        "Eric",
        "LIC-DEMO-05",
        "GA-M2-DEMO-05",
        "Chaloupe Cap Lopez",
        "pecheur5@example.com",
        "chaloupe",
    ),
    ("Nzé", "Marie", "LIC-DEMO-02", "GA-M2-DEMO-02", "Pirogue Mayumba", "pecheur2@example.com", "pirogue"),
]

# Immatriculations hors jeu léger (ex. ancien Pirogue Komo) — positions purgées
LEGACY_DEMO_IMMATS = ("GA-M2-DEMO-03",)

DEMO_ZONES = [
    {
        "nom": "Zone sensible baie de Mondah (démo)",
        "type": TypeZone.sensible,
        "ring": [(9.30, 0.78), (9.42, 0.78), (9.42, 0.92), (9.30, 0.92), (9.30, 0.78)],
    },
    {
        "nom": "Zone interdite rade Cap Lopez (démo)",
        "type": TypeZone.interdite,
        "ring": [(8.55, -0.85), (8.72, -0.85), (8.72, -0.68), (8.55, -0.68), (8.55, -0.85)],
    },
    {
        "nom": "Zone protégée Ogooué — Lambaréné (démo)",
        "type": TypeZone.protegee,
        "ring": [(10.15, -0.82), (10.35, -0.82), (10.35, -0.62), (10.15, -0.62), (10.15, -0.82)],
    },
]

# Un corridor côtier / estuaire par bateau (pas de remontée Lambaréné — lisible satellite)
TRAJECTORY_PLAN: list[tuple[str, int]] = [
    ("sortie_cote_mer", 0),
    ("entree_mondah", 1),
    ("mer_vers_ogooue", 2),  # tronqué à l'embouchure dans seed_trajectories
    ("rade_port_gentil", 3),
    ("mayumba_cote", 4),
]

_KM_PER_MIN = 0.22
_MIN_STEP_MIN = 8
_MAX_STEP_MIN = 90  # < gap_hours=2 → un seul segment LineString par sortie
# Premiers points seulement : embouchure Ogooué (avant Lambaréné)
_OGOOUE_MOUTH_POINTS = 5


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
    return max(_MIN_STEP_MIN, min(_MAX_STEP_MIN, int(round(dist / _KM_PER_MIN))))


async def ensure_staff(session) -> None:
    for email, nom, role, phone, pwd in [
        ("admin@example.com", "Admin Démo", RoleUtilisateur.admin, "+24106000000", "AdminPass123!"),
        (
            "agent@example.com",
            "Agent Démo",
            RoleUtilisateur.agent_controle,
            "+24106000001",
            "AgentPass123!",
        ),
        (
            "autorite@example.com",
            "Autorité Démo",
            RoleUtilisateur.autorite,
            "+24106000002",
            "AutoritePass123!",
        ),
    ]:
        existing = (
            await session.execute(select(Utilisateur).where(Utilisateur.email == email))
        ).scalar_one_or_none()
        if existing:
            # Aligner rôle / mot de passe démo (évite comptes orphelins hors sync)
            if existing.role != role:
                existing.role = role
            existing.mot_de_passe_hash = hash_password(pwd)
            existing.nom = nom
            print(f"  staff OK (MAJ) : {email} / {role.value}")
            continue
        session.add(
            Utilisateur(
                nom=nom,
                role=role,
                email=email,
                telephone=phone,
                mot_de_passe_hash=hash_password(pwd),
            )
        )
        print(f"  + staff {email} / {role.value}")


async def ensure_pecheurs(session) -> list[Embarcation]:
    boats: list[Embarcation] = []
    for nom, prenom, licence, immat, boat_nom, email, boat_type in DEMO_PECHEURS:
        pecheur = (
            await session.execute(select(Pecheur).where(Pecheur.numero_licence == licence))
        ).scalar_one_or_none()
        if pecheur is None:
            user = Utilisateur(
                nom=f"{prenom} {nom}",
                role=RoleUtilisateur.pecheur,
                email=email,
                telephone=None,
                mot_de_passe_hash=hash_password("PecheurPass1!"),
            )
            pecheur = Pecheur(
                utilisateur=user,
                nom=nom,
                prenom=prenom,
                numero_licence=licence,
                date_delivrance_licence=date(2024, 1, 15),
            )
            session.add(pecheur)
            await session.flush()
            print(f"  + pêcheur {licence}")
        else:
            print(f"  pêcheur OK : {licence}")

        emb = (
            await session.execute(select(Embarcation).where(Embarcation.immatriculation == immat))
        ).scalar_one_or_none()
        if emb is None:
            emb = Embarcation(
                pecheur_id=pecheur.id,
                nom=boat_nom,
                immatriculation=immat,
                type=boat_type,
                longueur=8.5 if boat_type == "pirogue" else 12.0,
            )
            session.add(emb)
            await session.flush()
            print(f"  + embarcation {immat} ({boat_type})")
        else:
            # Aligner nom / type (ex. Chaloupe, Mayumba renommé)
            changed = False
            if emb.nom != boat_nom:
                emb.nom = boat_nom
                changed = True
            if (emb.type or "") != boat_type:
                emb.type = boat_type
                changed = True
            if changed:
                print(f"  embarcation MAJ : {immat} → {boat_nom} / {boat_type}")
            else:
                print(f"  embarcation OK : {immat}")
        boats.append(emb)
    return boats


async def ensure_zones(session) -> None:
    for item in DEMO_ZONES:
        existing = (
            await session.execute(select(ZoneReglementee).where(ZoneReglementee.nom == item["nom"]))
        ).scalar_one_or_none()
        if existing:
            print(f"  zone OK : {item['nom']}")
            continue
        session.add(
            ZoneReglementee(
                nom=item["nom"],
                type=item["type"],
                geometrie=polygon_to_wkt(PolygonGeoJSON(coordinates=[item["ring"]])),
                actif=True,
            )
        )
        print(f"  + zone {item['nom']}")


async def purge_legacy_noise(session, keep_boats: list[Embarcation]) -> None:
    """Supprime positions legacy + zones/alertes de tests qui saturent la carte."""
    from app.db.enums import TypeAlerte
    from app.db.models import Alerte

    keep_ids = {b.id for b in keep_boats}
    legacy = list(
        (
            await session.execute(
                select(Embarcation).where(Embarcation.immatriculation.in_(LEGACY_DEMO_IMMATS))
            )
        )
        .scalars()
        .all()
    )
    for emb in legacy:
        await session.execute(delete(Position).where(Position.embarcation_id == emb.id))
        print(f"  purge positions legacy : {emb.immatriculation} ({emb.nom})")

    extras = list(
        (
            await session.execute(
                select(Embarcation).where(Embarcation.immatriculation.like("GA-M2-%"))
            )
        )
        .scalars()
        .all()
    )
    for emb in extras:
        if emb.id in keep_ids:
            continue
        await session.execute(delete(Position).where(Position.embarcation_id == emb.id))
        print(f"  purge positions hors jeu : {emb.immatriculation} ({emb.nom})")

    test_zones = list(
        (
            await session.execute(
                select(ZoneReglementee).where(ZoneReglementee.nom.ilike("%M7%"))
            )
        )
        .scalars()
        .all()
    )
    for z in test_zones:
        await session.delete(z)
        print(f"  purge zone test : {z.nom}")

    r = await session.execute(delete(Alerte).where(Alerte.type == TypeAlerte.zone_interdite))
    print(f"  purge alertes zone_interdite : {r.rowcount or 0}")


async def seed_trajectories(session, boats: list[Embarcation]) -> None:
    demo_ids = [b.id for b in boats]
    if not demo_ids:
        print("  skip trajectoires — pas d'embarcations")
        return
    await session.execute(delete(Position).where(Position.embarcation_id.in_(demo_ids)))
    await session.flush()
    day = datetime.now(UTC).replace(hour=5, minute=0, second=0, microsecond=0)
    n_trips = 0
    for i, (scenario, hours) in enumerate(TRAJECTORY_PLAN):
        if i >= len(boats):
            break
        if scenario not in DEMO_ROUTES:
            print(f"  skip scénario inconnu : {scenario}")
            continue
        boat = boats[i]
        path = DEMO_ROUTES[scenario]
        if scenario == "mer_vers_ogooue":
            path = path[:_OGOOUE_MOUTH_POINTS]
        base = day + timedelta(hours=hours)
        elapsed = 0
        prev: tuple[float, float] | None = None
        for lon, lat in path:
            elapsed += _step_minutes(prev, (lon, lat))
            session.add(
                Position(
                    embarcation_id=boat.id,
                    position=point_to_wkt(PointGeoJSON(coordinates=(lon, lat))),
                    horodatage=base + timedelta(minutes=elapsed),
                    source=SourcePosition.mobile,
                    synchronise_a=datetime.now(UTC),
                )
            )
            prev = (lon, lat)
        meta = DEMO_ROUTE_META.get(scenario, {})
        print(f"  • {boat.immatriculation} « {meta.get('label', scenario)} »")
        n_trips += 1
    print(f"  trajectoires : {n_trips} (1 corridor / bateau)")


async def seed_captures_quotas(session, boats: list[Embarcation]) -> None:
    demo_ids = [b.id for b in boats]
    await session.execute(delete(Capture).where(Capture.embarcation_id.in_(demo_ids)))
    await session.flush()

    samples = [
        ("crevette", 42.0, "filet", 9.35, 0.45, "Libreville"),
        ("capitaine", 18.5, "ligne", 9.40, 0.55, "Cocobeach"),
        ("barracuda", 12.0, "filet", 8.65, -0.72, "Port-Gentil"),
        ("thon", 25.0, "senne", 9.22, 0.38, "Owendo"),
        ("sardine", 60.0, "filet", 9.28, 0.50, "Libreville"),
    ]
    now = datetime.now(UTC)
    for i, (espece, kg, methode, lon, lat, debarq) in enumerate(samples):
        boat = boats[i % len(boats)]
        session.add(
            Capture(
                pecheur_id=boat.pecheur_id,
                embarcation_id=boat.id,
                espece=espece,
                quantite_kg=kg,
                methode=methode,
                position_capture=point_to_wkt(PointGeoJSON(coordinates=(lon, lat))),
                point_debarquement=debarq,
                date_capture=now - timedelta(hours=i * 6),
                synchronise_a=now,
            )
        )
    print(f"  + {len(samples)} captures")

    existing_q = (
        await session.execute(select(Quota).where(Quota.espece == "crevette").limit(1))
    ).scalars().first()
    if existing_q is None:
        debut = date.today().replace(day=1)
        fin = debut + timedelta(days=90)
        session.add(
            Quota(
                espece="crevette",
                zone_id=None,
                periode_debut=debut,
                periode_fin=fin,
                volume_autorise_kg=500.0,
                volume_consomme_kg=42.0,
            )
        )
        print("  + quota crevette 500 kg")
    else:
        print("  quota crevette OK")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        print("== Staff ==")
        await ensure_staff(session)
        print("== Pêcheurs / embarcations (jeu léger) ==")
        boats = await ensure_pecheurs(session)
        print("== Zones ==")
        await ensure_zones(session)
        await session.flush()
        print("== Purge bruit legacy ==")
        await purge_legacy_noise(session, boats)
        print("== Trajectoires ==")
        await seed_trajectories(session, boats)
        print("== Captures / quotas ==")
        await seed_captures_quotas(session, boats)
        await session.commit()
        print("Seed production démo terminé (5 bateaux, 1 corridor chacun).")


if __name__ == "__main__":
    asyncio.run(main())
