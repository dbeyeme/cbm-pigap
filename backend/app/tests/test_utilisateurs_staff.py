"""Tests CRUD staff — agents & administrateurs (admin only)."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import create_access_token, hash_password
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur


@pytest_asyncio.fixture
async def admin_headers(engine) -> dict[str, str]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        email = f"admin-{uuid.uuid4().hex[:8]}@example.com"
        admin = Utilisateur(
            nom="Admin Test",
            role=RoleUtilisateur.admin,
            email=email,
            telephone=f"+2419{uuid.uuid4().int % 10_000_000:07d}",
            mot_de_passe_hash=hash_password("AdminPass123!"),
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        token = create_access_token(subject=admin.id, role=admin.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_crud_agent(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    suffix = uuid.uuid4().hex[:8]
    create = await client.post(
        "/api/v1/utilisateurs",
        headers=admin_headers,
        json={
            "nom": "Agent Nouveau",
            "role": "agent_controle",
            "email": f"agent.new.{suffix}@example.com",
            "mot_de_passe": "AgentPass123!",
            "telephone": f"+2416{suffix[:7]}",
        },
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["role"] == "agent_controle"
    uid = body["id"]

    listed = await client.get("/api/v1/utilisateurs", headers=admin_headers)
    assert listed.status_code == 200
    assert any(u["id"] == uid for u in listed.json())

    agents = await client.get(
        "/api/v1/utilisateurs",
        headers=admin_headers,
        params={"role": "agent_controle"},
    )
    assert agents.status_code == 200
    assert all(u["role"] == "agent_controle" for u in agents.json())

    patched = await client.patch(
        f"/api/v1/utilisateurs/{uid}",
        headers=admin_headers,
        json={"nom": "Agent Renommé"},
    )
    assert patched.status_code == 200
    assert patched.json()["nom"] == "Agent Renommé"

    deleted = await client.delete(f"/api/v1/utilisateurs/{uid}", headers=admin_headers)
    assert deleted.status_code == 204

    missing = await client.get(f"/api/v1/utilisateurs/{uid}", headers=admin_headers)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_admin_can_create_admin(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    suffix = uuid.uuid4().hex[:8]
    res = await client.post(
        "/api/v1/utilisateurs",
        headers=admin_headers,
        json={
            "nom": "Admin Bis",
            "role": "admin",
            "email": f"admin.bis.{suffix}@example.com",
            "mot_de_passe": "AdminPass123!",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_agent_cannot_manage_staff(
    client: AsyncClient, agent_headers: dict[str, str]
) -> None:
    res = await client.get("/api/v1/utilisateurs", headers=agent_headers)
    assert res.status_code == 403

    create = await client.post(
        "/api/v1/utilisateurs",
        headers=agent_headers,
        json={
            "nom": "Hack",
            "role": "agent_controle",
            "email": f"hack.{uuid.uuid4().hex[:6]}@example.com",
            "mot_de_passe": "AgentPass123!",
        },
    )
    assert create.status_code == 403


@pytest.mark.asyncio
async def test_reject_pecheur_role_on_staff_endpoint(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    res = await client.post(
        "/api/v1/utilisateurs",
        headers=admin_headers,
        json={
            "nom": "Fake",
            "role": "pecheur",
            "email": f"fake.{uuid.uuid4().hex[:6]}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_cannot_delete_self(
    client: AsyncClient, engine, admin_headers: dict[str, str]
) -> None:
    me = await client.get("/api/v1/auth/me", headers=admin_headers)
    assert me.status_code == 200
    uid = me.json()["id"]
    res = await client.delete(f"/api/v1/utilisateurs/{uid}", headers=admin_headers)
    assert res.status_code == 403
    assert res.json()["code"] == "SELF_DELETE"
