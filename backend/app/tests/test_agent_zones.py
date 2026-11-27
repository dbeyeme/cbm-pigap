"""Vue agent par zone (§7) + écriture GPS réservée pêcheur/admin."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import create_access_token, hash_password
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.geolocalisation.gabon_routes import ESTUAIRE_LIBREVILLE
from app.modules.perimetre import service as perimetre_service
from app.modules.perimetre.schemas import AgentZonesUpdate


async def _agent_headers(engine, codes: list[str]) -> dict[str, str]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        user = Utilisateur(
            nom="Agent Zone",
            role=RoleUtilisateur.agent_controle,
            email=f"agent.zone.{uuid.uuid4().hex[:8]}@example.com",
            mot_de_passe_hash=hash_password("AgentPass123!"),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        await perimetre_service.assurer_seed_defaut(session)
        await perimetre_service.remplacer_zones_agent(
            session, user.id, AgentZonesUpdate(codes=codes)
        )
        token = create_access_token(subject=user.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_agent_ne_peut_pas_ecrire_gps(
    client: AsyncClient, engine, admin_headers: dict[str, str]
) -> None:
    agent = await _agent_headers(engine, ["gabon"])
    emb = await client.post(
        "/api/v1/pecheurs",
        headers=admin_headers,
        json={
            "nom": "Mba",
            "prenom": "Zone",
            "numero_licence": f"LIC-AZ-{uuid.uuid4().hex[:6]}",
            "email": f"az.{uuid.uuid4().hex[:8]}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert emb.status_code == 201
    bateau = await client.post(
        "/api/v1/embarcations",
        headers=admin_headers,
        json={
            "pecheur_id": emb.json()["id"],
            "nom": "Pirogue AZ",
            "immatriculation": f"GA-AZ-{uuid.uuid4().hex[:6]}",
            "type": "pirogue",
        },
    )
    assert bateau.status_code == 201
    lon, lat = ESTUAIRE_LIBREVILLE[0]
    r = await client.post(
        "/api/v1/positions",
        headers=agent,
        json={
            "embarcation_id": bateau.json()["id"],
            "position": {"type": "Point", "coordinates": [lon, lat]},
            "horodatage": datetime(2020, 1, 1, 12, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_agent_ne_voit_que_sa_zone(
    client: AsyncClient, engine, admin_headers: dict[str, str]
) -> None:
    """Points hors Estuaire invisibles pour un agent limité à `estuaire`."""
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=admin_headers,
        json={
            "nom": "Vue",
            "prenom": "Agent",
            "numero_licence": f"LIC-VA-{uuid.uuid4().hex[:6]}",
            "email": f"va.{uuid.uuid4().hex[:8]}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201
    bateau = await client.post(
        "/api/v1/embarcations",
        headers=admin_headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": "Pirogue VA",
            "immatriculation": f"GA-VA-{uuid.uuid4().hex[:6]}",
            "type": "pirogue",
        },
    )
    assert bateau.status_code == 201
    emb_id = bateau.json()["id"]

    # Point dans l'Estuaire (seed périmètre)
    lon_e, lat_e = ESTUAIRE_LIBREVILLE[0]
    # Port-Gentil (eau) hors polygone estuaire seed 9.0–9.8 / 0.0–0.9
    lon_sud, lat_sud = 8.65, -0.70

    for i, (lon, lat) in enumerate([(lon_e, lat_e), (lon_sud, lat_sud)]):
        r = await client.post(
            "/api/v1/positions",
            headers=admin_headers,
            json={
                "embarcation_id": emb_id,
                "position": {"type": "Point", "coordinates": [lon, lat]},
                "horodatage": datetime(2020, 2, 1, 10, i, tzinfo=UTC).isoformat(),
                "source": "mobile",
            },
        )
        assert r.status_code == 201, r.text

    agent = await _agent_headers(engine, ["estuaire"])
    traj = await client.get(
        "/api/v1/positions/trajectory",
        headers=agent,
        params={"embarcation_id": emb_id},
    )
    assert traj.status_code == 200, traj.text
    coords = [tuple(p["position"]["coordinates"]) for p in traj.json()]
    assert any(abs(c[0] - lon_e) < 1e-5 for c in coords)
    assert all(abs(c[0] - lon_sud) > 0.01 for c in coords)

    admin_traj = await client.get(
        "/api/v1/positions/trajectory",
        headers=admin_headers,
        params={"embarcation_id": emb_id},
    )
    assert len(admin_traj.json()) >= 2
