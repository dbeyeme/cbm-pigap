"""LogAcces §7 — login échoué, dossier / trajectoire staff."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import LogAcces
from app.modules.geolocalisation.gabon_routes import ESTUAIRE_LIBREVILLE


@pytest.mark.asyncio
async def test_login_echec_journalise(client: AsyncClient, engine) -> None:
    await client.post(
        "/api/v1/auth/login",
        json={"email": "inconnu.audit@example.com", "mot_de_passe": "mauvais"},
    )
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(LogAcces)
                .where(LogAcces.ressource == "auth", LogAcces.action == "login_echec")
                .order_by(LogAcces.horodatage.desc())
                .limit(1)
            )
        ).scalars().all()
    assert rows
    assert "inconnu.audit@example.com" in (rows[0].detail or "")


@pytest.mark.asyncio
async def test_dossier_licence_journalise_staff(
    client: AsyncClient, engine, admin_headers: dict[str, str]
) -> None:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=admin_headers,
        json={
            "nom": "Log",
            "prenom": "Acces",
            "numero_licence": f"LIC-LOG-{suffix}",
            "email": f"log.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    licence = pecheur.json()["numero_licence"]

    dossier = await client.get(
        "/api/v1/positions/dossier",
        headers=admin_headers,
        params={"licence": licence},
    )
    assert dossier.status_code == 200, dossier.text

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(LogAcces).where(
                    LogAcces.ressource == "geoloc_dossier",
                    LogAcces.action == "consultation",
                    LogAcces.detail.contains(licence),
                )
            )
        ).scalars().all()
    assert rows


@pytest.mark.asyncio
async def test_trajectoire_journalise_staff(
    client: AsyncClient, admin_headers: dict[str, str], engine
) -> None:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=admin_headers,
        json={
            "nom": "Traj",
            "prenom": "Log",
            "numero_licence": f"LIC-TJ-{suffix}",
            "email": f"tj.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    emb = await client.post(
        "/api/v1/embarcations",
        headers=admin_headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": "Pirogue Log",
            "immatriculation": f"GA-TJ-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201
    emb_id = emb.json()["id"]
    lon, lat = ESTUAIRE_LIBREVILLE[0]
    pos = await client.post(
        "/api/v1/positions",
        headers=admin_headers,
        json={
            "embarcation_id": emb_id,
            "position": {"type": "Point", "coordinates": [lon, lat]},
            "horodatage": datetime(2020, 3, 1, 12, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    assert pos.status_code == 201, pos.text

    traj = await client.get(
        "/api/v1/positions/trajectory",
        headers=admin_headers,
        params={"embarcation_id": emb_id},
    )
    assert traj.status_code == 200

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(LogAcces).where(
                    LogAcces.ressource == "geoloc_trajectoire",
                    LogAcces.detail.contains(emb_id),
                )
            )
        ).scalars().all()
    assert rows


@pytest.mark.asyncio
async def test_admin_affecte_zones_agent(
    client: AsyncClient, engine, admin_headers: dict[str, str], agent_headers: dict[str, str]
) -> None:
    # Récupérer l'id agent via /auth/me
    me = await client.get("/api/v1/auth/me", headers=agent_headers)
    assert me.status_code == 200
    agent_id = me.json()["id"]

    put = await client.put(
        f"/api/v1/perimetre/agents/{agent_id}/zones",
        headers=admin_headers,
        json={"codes": ["estuaire", "libreville"]},
    )
    assert put.status_code == 200, put.text
    assert set(put.json()["codes"]) == {"estuaire", "libreville"}

    moi = await client.get("/api/v1/perimetre/moi/zones", headers=agent_headers)
    assert moi.status_code == 200
    assert set(moi.json()["codes"]) == {"estuaire", "libreville"}
