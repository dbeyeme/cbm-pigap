"""Seed démo lisible : une poignée d'acteurs, un an de sorties côte / intérieur.

Jeu fictif, à valider. Pas un dump de tests.

Crée :
  - 1 admin, 1 agent de contrôle, 1 autorité
  - 1 organisation (coopérative de l'Estuaire)
  - 5 pêcheurs / 5 embarcations (côte, estuaire, Ogooué intérieur, Cap Lopez, Mayumba)
  - un an de GPS et de captures le long des corridors open data (eau uniquement)
  - quelques alertes (pas des centaines)

Usage :
  cd backend && python scripts/seed_production_demo.py --reset
  # Sans --reset : met à jour le jeu des 5 bateaux, ne supprime pas le surplus.
"""

from __future__ import annotations

import asyncio
import logging
import math
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, or_, select

from app.core.security import hash_password
from app.db.enums import (
    NiveauGravite,
    RoleUtilisateur,
    SourcePosition,
    StatutAlerte,
    TypeAlerte,
    TypeZone,
)
from app.db.models import (
    Alerte,
    AlerteJournal,
    Capture,
    DemandeLicence,
    Embarcation,
    Organisation,
    Pecheur,
    Position,
    Quota,
    Utilisateur,
    ZoneReglementee,
)
from app.db.session import AsyncSessionLocal
from app.modules.geolocalisation.gabon_routes import DEMO_ROUTE_META, DEMO_ROUTES
from app.modules.geolocalisation.geo import point_to_wkt
from app.modules.redevances.service import appliquer_taxe
from app.modules.zones.geo import polygon_to_wkt
from app.schemas.common import PointGeoJSON, PolygonGeoJSON

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

# (nom, prenom, licence, immat, boat_nom, email, boat_type, dans_org)
DEMO_PECHEURS = [
    (
        "Mba",
        "Jean",
        "LIC-DEMO-01",
        "GA-M2-DEMO-01",
        "Pirogue Espoir",
        "pecheur1@example.com",
        "pirogue",
        True,
    ),
    (
        "Allogo",
        "Claire",
        "LIC-DEMO-04",
        "GA-M2-DEMO-04",
        "Pirogue Mondah",
        "pecheur4@example.com",
        "pirogue",
        True,
    ),
    (
        "Boussougou",
        "Amina",
        "LIC-DEMO-06",
        "GA-M2-DEMO-06",
        "Pirogue Ogooué",
        "pecheur6@example.com",
        "pirogue",
        True,
    ),
    (
        "Mintsa",
        "Eric",
        "LIC-DEMO-05",
        "GA-M2-DEMO-05",
        "Chaloupe Cap Lopez",
        "pecheur5@example.com",
        "chaloupe",
        False,
    ),
    (
        "Nzé",
        "Marie",
        "LIC-DEMO-02",
        "GA-M2-DEMO-02",
        "Pirogue Mayumba",
        "pecheur2@example.com",
        "pirogue",
        False,
    ),
]

STAFF = [
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
]

DEMO_ORG = {
    "nom": "Coopérative des Pêcheurs de l'Estuaire",
    "nom_commercial": "CPE Owendo",
    "type_organisation": "cooperative",
    "ville": "Owendo",
    "province_region": "Estuaire",
    "zone_activite": "Estuaire, baie de Mondah, Ogooué aval",
    "email": "coop-estuaire@example.com",
    "telephone": "+24106000010",
    "notes": "Organisation de démonstration (fictif, à valider).",
}

# Un corridor aller (et retour éventuel) par bateau : côte, estuaire, fleuve intérieur.
TRAJECTORY_PLAN: list[tuple[str, str | None, str, tuple[str, ...]]] = [
    ("sortie_cote_mer", None, "Owendo", ("sardine", "capitaine")),
    ("entree_mondah", None, "Cocobeach", ("crevette", "capitaine")),
    ("mer_vers_ogooue", "ogooue_interieur", "Lambaréné", ("capitaine", "merou")),
    ("rade_port_gentil", None, "Port-Gentil", ("barracuda", "thon")),
    ("mayumba_cote", None, "Mayumba", ("sardine", "crevette")),
]

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
        "nom": "Zone protégée Ogooué - Lambaréné (démo)",
        "type": TypeZone.protegee,
        "ring": [(10.15, -0.82), (10.35, -0.82), (10.35, -0.62), (10.15, -0.62), (10.15, -0.82)],
    },
]

_KM_PER_MIN = 0.22
_MIN_STEP_MIN = 8
_MAX_STEP_MIN = 90
_POINTS_PAR_SORTIE = 12
_JOURS_ENTRE_SORTIES = 10
SEED_SOURCE = "seed_production_demo"


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
    dist = _haversine_km(prev, (curr[0], curr[1]))
    return max(_MIN_STEP_MIN, min(_MAX_STEP_MIN, int(round(dist / _KM_PER_MIN))))


def _subsample(path: list[tuple[float, float]], max_n: int) -> list[tuple[float, float]]:
    if len(path) <= max_n:
        return list(path)
    if max_n < 2:
        return [path[0]]
    last = len(path) - 1
    idxs = sorted({round(i * last / (max_n - 1)) for i in range(max_n)})
    return [path[i] for i in idxs]


def _kg(espece: str, day: date) -> float:
    """Volumes fictifs, à valider : plus de côte en saison sèche (juin-septembre)."""
    seche = 6 <= day.month <= 9
    base = {
        "capitaine": 14.0,
        "merou": 8.0,
        "crevette": 16.0,
        "thon": 6.0,
        "barracuda": 9.0,
        "sardine": 22.0,
    }.get(espece, 10.0)
    if espece in {"capitaine", "sardine", "barracuda"}:
        factor = 1.25 if seche else 0.9
    elif espece in {"crevette", "merou"}:
        factor = 0.8 if seche else 1.2
    else:
        factor = 1.0
    wobble = 1.0 + 0.08 * math.sin(day.toordinal() / 9.0)
    return round(max(0.5, base * factor * wobble), 1)


def _keep_emails() -> set[str]:
    emails = {row[0] for row in STAFF}
    emails.update(p[5] for p in DEMO_PECHEURS)
    return emails


def _keep_licences() -> set[str]:
    return {p[2] for p in DEMO_PECHEURS}


async def ensure_staff(session) -> None:
    for email, nom, role, phone, pwd in STAFF:
        existing = (
            await session.execute(select(Utilisateur).where(Utilisateur.email == email))
        ).scalar_one_or_none()
        if existing:
            existing.role = role
            existing.mot_de_passe_hash = hash_password(pwd)
            existing.nom = nom
            existing.telephone = phone
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


async def ensure_organisation(session) -> Organisation:
    org = (
        await session.execute(select(Organisation).where(Organisation.nom == DEMO_ORG["nom"]))
    ).scalar_one_or_none()
    if org is None:
        org = Organisation(**DEMO_ORG, pays="GA", actif=True)
        session.add(org)
        await session.flush()
        print(f"  + organisation {org.nom}")
    else:
        org.ville = DEMO_ORG["ville"]
        org.type_organisation = DEMO_ORG["type_organisation"]
        org.notes = DEMO_ORG["notes"]
        print(f"  organisation OK : {org.nom}")
    return org


async def ensure_pecheurs(session, org: Organisation) -> list[Embarcation]:
    boats: list[Embarcation] = []
    for nom, prenom, licence, immat, boat_nom, email, boat_type, dans_org in DEMO_PECHEURS:
        pecheur = (
            await session.execute(select(Pecheur).where(Pecheur.numero_licence == licence))
        ).scalar_one_or_none()
        org_id = org.id if dans_org else None
        if pecheur is None:
            user = Utilisateur(
                nom=f"{prenom} {nom}",
                role=RoleUtilisateur.pecheur,
                email=email,
                telephone=None,
                mot_de_passe_hash=hash_password("PecheurPass1!"),
                organisation_id=org_id,
            )
            pecheur = Pecheur(
                utilisateur=user,
                nom=nom,
                prenom=prenom,
                numero_licence=licence,
                date_delivrance_licence=date(2024, 1, 15),
                organisation_id=org_id,
            )
            session.add(pecheur)
            await session.flush()
            print(f"  + pêcheur {licence}")
        else:
            pecheur.organisation_id = org_id
            if pecheur.utilisateur_id:
                user = await session.get(Utilisateur, pecheur.utilisateur_id)
                if user:
                    user.organisation_id = org_id
                    user.role = RoleUtilisateur.pecheur
                    user.nom = f"{prenom} {nom}"
                    user.email = email
                    user.mot_de_passe_hash = hash_password("PecheurPass1!")
            await session.flush()
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
            emb.nom = boat_nom
            emb.type = boat_type
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


async def reset_surplus(session, keep_boats: list[Embarcation]) -> None:
    """Supprime le surplus (tests, anciennes flottes) pour ne garder que la poignée."""
    print(f"  jeu conservé : {len(keep_boats)} embarcations")
    keep_emails = _keep_emails()
    keep_org_nom = DEMO_ORG["nom"]
    keep_zone_noms = {z["nom"] for z in DEMO_ZONES}

    r = await session.execute(delete(AlerteJournal))
    print(f"  purge journal d'alertes : {r.rowcount or 0}")
    r = await session.execute(delete(Alerte))
    print(f"  purge alertes : {r.rowcount or 0}")

    r = await session.execute(delete(DemandeLicence))
    print(f"  purge demandes : {r.rowcount or 0}")

    r = await session.execute(delete(Position))
    print(f"  purge positions : {r.rowcount or 0}")
    r = await session.execute(delete(Capture))
    print(f"  purge captures : {r.rowcount or 0}")
    await session.execute(delete(Quota))
    await session.flush()

    keep_licences = _keep_licences()
    keep_immats = {p[3] for p in DEMO_PECHEURS}

    r = await session.execute(
        delete(Embarcation)
        .where(Embarcation.immatriculation.not_in(keep_immats))
        .execution_options(synchronize_session=False)
    )
    print(f"  purge embarcations hors jeu : {r.rowcount or 0}")

    r = await session.execute(
        delete(Pecheur)
        .where(Pecheur.numero_licence.not_in(keep_licences))
        .execution_options(synchronize_session=False)
    )
    print(f"  purge pêcheurs hors jeu : {r.rowcount or 0}")

    r = await session.execute(
        delete(Utilisateur)
        .where(or_(Utilisateur.email.is_(None), Utilisateur.email.not_in(keep_emails)))
        .execution_options(synchronize_session=False)
    )
    print(f"  purge comptes hors jeu : {r.rowcount or 0}")

    r = await session.execute(
        delete(Organisation)
        .where(Organisation.nom != keep_org_nom)
        .execution_options(synchronize_session=False)
    )
    print(f"  purge organisations hors jeu : {r.rowcount or 0}")

    r = await session.execute(
        delete(ZoneReglementee)
        .where(ZoneReglementee.nom.not_in(keep_zone_noms))
        .execution_options(synchronize_session=False)
    )
    print(f"  purge zones hors jeu : {r.rowcount or 0}")

    print("  historique GPS / captures effacé (ressemé sur 12 mois)")


async def seed_annee(session, boats: list[Embarcation]) -> None:
    """Un an de sorties (côte, estuaire, fleuve intérieur) + captures. Fictif."""
    demo_ids = [b.id for b in boats]
    if not demo_ids:
        print("  skip année : pas d'embarcations")
        return
    await session.execute(delete(Position).where(Position.embarcation_id.in_(demo_ids)))
    await session.execute(delete(Capture).where(Capture.embarcation_id.in_(demo_ids)))
    await session.flush()

    now = datetime.now(UTC)
    start = (now - timedelta(days=365)).date()
    n_pos = 0
    n_cap = 0
    n_trips = 0
    last_live: list[tuple[Embarcation, tuple[float, float]]] = []

    for i, boat in enumerate(boats):
        if i >= len(TRAJECTORY_PLAN):
            break
        scenario_go, scenario_back, debarq, especes = TRAJECTORY_PLAN[i]
        if scenario_go not in DEMO_ROUTES:
            print(f"  skip scénario inconnu : {scenario_go}")
            continue
        day = start + timedelta(days=2 + i)
        trip_i = 0
        last_pt: tuple[float, float] | None = None
        while day <= now.date():
            if trip_i % 2 == 1 and scenario_back and scenario_back in DEMO_ROUTES:
                scenario = scenario_back
            else:
                scenario = scenario_go
            max_pts = (
                24
                if scenario in {"mer_vers_ogooue", "ogooue_interieur", "ogooue_vers_mer"}
                else _POINTS_PAR_SORTIE
            )
            path = _subsample(DEMO_ROUTES[scenario], max_pts)
            if trip_i % 2 == 1 and scenario_back is None:
                path = list(reversed(path))
            base = datetime(day.year, day.month, day.day, 5 + (i % 3), 10, tzinfo=UTC)
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
                        synchronise_a=now,
                    )
                )
                n_pos += 1
                prev = (lon, lat)
                last_pt = (lon, lat)
            if last_pt:
                espece = especes[trip_i % len(especes)]
                capture = Capture(
                    pecheur_id=boat.pecheur_id,
                    embarcation_id=boat.id,
                    espece=espece,
                    quantite_kg=_kg(espece, day),
                    methode="filet" if trip_i % 2 == 0 else "ligne",
                    position_capture=point_to_wkt(PointGeoJSON(coordinates=last_pt)),
                    point_debarquement=debarq,
                    date_capture=base + timedelta(minutes=elapsed + 20),
                    synchronise_a=now,
                )
                appliquer_taxe(capture)
                session.add(capture)
                n_cap += 1
            n_trips += 1
            trip_i += 1
            day += timedelta(days=_JOURS_ENTRE_SORTIES)
        if last_pt:
            last_live.append((boat, last_pt))
        meta = DEMO_ROUTE_META.get(scenario_go, {})
        print(f"  • {boat.nom} « {meta.get('label', scenario_go)} » : {trip_i} sorties")

    for idx, (boat, (lon, lat)) in enumerate(last_live):
        session.add(
            Position(
                embarcation_id=boat.id,
                position=point_to_wkt(PointGeoJSON(coordinates=(lon, lat))),
                horodatage=now - timedelta(seconds=25 + idx * 40),
                source=SourcePosition.mobile,
                synchronise_a=now,
            )
        )
        n_pos += 1
    print(f"  trajectoires : {n_trips} sorties, {n_pos} positions, {n_cap} captures (12 mois)")


async def seed_quota_et_alertes(session, boats: list[Embarcation]) -> None:
    await session.flush()
    rows = list(
        (await session.execute(select(Capture.quantite_kg).where(Capture.espece == "crevette")))
        .scalars()
        .all()
    )
    crevette_kg = round(sum(float(x) for x in rows), 1)
    debut = date.today().replace(month=1, day=1)
    fin = date(debut.year, 12, 31)
    session.add(
        Quota(
            espece="crevette",
            zone_id=None,
            periode_debut=debut,
            periode_fin=fin,
            volume_autorise_kg=max(800.0, crevette_kg + 120.0),
            volume_consomme_kg=crevette_kg,
        )
    )
    print(f"  + quota crevette {crevette_kg} kg consommés / {max(800.0, crevette_kg + 120.0)} kg")

    cap_lopez = boats[3] if len(boats) > 3 else boats[0]
    espoir = boats[0]
    ogooue = boats[2] if len(boats) > 2 else boats[0]
    zone_interdit = (
        await session.execute(
            select(ZoneReglementee).where(ZoneReglementee.type == TypeZone.interdite)
        )
    ).scalars().first()

    now = datetime.now(UTC)
    n_al = 0
    if zone_interdit is not None:
        for month, day, hour in ((7, 12, 14), (8, 3, 9), (8, 21, 16)):
            when = datetime(now.year if month <= now.month else now.year - 1, month, day, hour, tzinfo=UTC)
            session.add(
                Alerte(
                    type=TypeAlerte.zone_interdite,
                    niveau_gravite=NiveauGravite.critique,
                    embarcation_id=cap_lopez.id,
                    declencheur={
                        "regle": "intrusion_zone_interdite",
                        "fingerprint": f"{SEED_SOURCE}:caplopez:{when.date().isoformat()}",
                        "zone_id": str(zone_interdit.id),
                        "zone_nom": zone_interdit.nom,
                        "source": SEED_SOURCE,
                        "position": {"type": "Point", "coordinates": [8.64, -0.74]},
                    },
                    horodatage=when,
                    statut=StatutAlerte.nouvelle,
                    etat_traitement="a_traiter",
                )
            )
            n_al += 1
    for offset, boat in ((40, espoir), (18, ogooue)):
        when = now - timedelta(days=offset)
        session.add(
            Alerte(
                type=TypeAlerte.anomalie,
                niveau_gravite=NiveauGravite.attention,
                embarcation_id=boat.id,
                declencheur={
                    "regle": "activite_inhabituelle",
                    "fingerprint": f"{SEED_SOURCE}:tendance:{boat.id}:{when.date().isoformat()}",
                    "embarcation_id": str(boat.id),
                    "source": SEED_SOURCE,
                    "seuil_multiplicateur": 2.0,
                },
                horodatage=when,
                statut=StatutAlerte.nouvelle,
                etat_traitement="a_traiter",
            )
        )
        n_al += 1
    print(f"  + {n_al} alertes (fictif, à valider)")


async def main() -> None:
    reset = "--reset" in sys.argv
    async with AsyncSessionLocal() as session:
        print("== Staff (1 admin, 1 agent, 1 autorité) ==")
        await ensure_staff(session)
        print("== Organisation ==")
        org = await ensure_organisation(session)
        print("== Pêcheurs / embarcations (5) ==")
        boats = await ensure_pecheurs(session, org)
        print("== Zones ==")
        await ensure_zones(session)
        await session.flush()
        if reset:
            print("== Purge du surplus (--reset) ==")
            await reset_surplus(session, boats)
            await session.flush()
        else:
            extras = (
                await session.execute(
                    select(Pecheur).where(Pecheur.numero_licence.not_in(_keep_licences()))
                )
            ).scalars().all()
            if extras:
                print(
                    f"  {len(extras)} pêcheur(s) hors jeu encore en base. "
                    "Relancez avec --reset pour ne garder que la poignée."
                )
        found = {
            b.immatriculation: b
            for b in (
                await session.execute(
                    select(Embarcation).where(
                        Embarcation.immatriculation.in_({p[3] for p in DEMO_PECHEURS})
                    )
                )
            ).scalars().all()
        }
        boats = [found[p[3]] for p in DEMO_PECHEURS if p[3] in found]
        print("== Un an de sorties (côte → intérieur) ==")
        await seed_annee(session, boats)
        print("== Quota / alertes ==")
        await seed_quota_et_alertes(session, boats)
        await session.commit()
        print(
            "Seed démo terminé : 5 pêcheurs, 5 embarcations, 1 organisation, "
            "3 comptes staff, 12 mois de GPS/captures."
        )


if __name__ == "__main__":
    asyncio.run(main())
