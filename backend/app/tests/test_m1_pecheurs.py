"""Tests d'acceptation M1 — §5.1."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_pecheur_requires_licence(client: AsyncClient, agent_headers: dict) -> None:
    response = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Mba",
            "prenom": "Jean",
            "numero_licence": "   ",
            "mot_de_passe": "PecheurPass1!",
            "email": f"jean-{uuid.uuid4().hex[:6]}@example.com",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_agent_create_pecheur_embarcation_and_search(
    client: AsyncClient, agent_headers: dict
) -> None:
    """§5.1 : créer pêcheur + embarcation, retrouver par nom ou licence."""
    suffix = uuid.uuid4().hex[:8]
    licence = f"LIC-TEST-{suffix}"

    org_resp = await client.post(
        "/api/v1/organisations",
        headers=agent_headers,
        json={
            "nom": f"Coopérative Test {suffix}",
            "type_organisation": "cooperative",
            "ville": "Libreville",
            "pays": "GA",
            "attributs": {"agrement_provisoire": "AGR-001", "contact_president": "Mme Nze"},
        },
    )
    assert org_resp.status_code == 201, org_resp.text
    org_id = org_resp.json()["id"]
    assert org_resp.json()["attributs"]["agrement_provisoire"] == "AGR-001"

    pecheur_resp = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Obiang",
            "prenom": "Paul",
            "numero_licence": licence,
            "organisation_id": org_id,
            "telephone": f"+2416{suffix[:7]}",
            "email": f"paul.obiang.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur_resp.status_code == 201, pecheur_resp.text
    pecheur = pecheur_resp.json()
    assert pecheur["numero_licence"] == licence

    emb_resp = await client.post(
        "/api/v1/embarcations",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur["id"],
            "nom": "Pirogue Espoir",
            "immatriculation": f"GA-{suffix}",
            "type": "pirogue",
            "longueur": 8.5,
            "equipements": {"moteur": "15cv"},
        },
    )
    assert emb_resp.status_code == 201, emb_resp.text

    by_licence = await client.get(
        "/api/v1/pecheurs",
        headers=agent_headers,
        params={"q": licence},
    )
    assert by_licence.status_code == 200
    found = by_licence.json()
    assert len(found) >= 1
    assert any(p["id"] == pecheur["id"] for p in found)

    by_name = await client.get(
        "/api/v1/pecheurs",
        headers=agent_headers,
        params={"q": "Obiang"},
    )
    assert by_name.status_code == 200
    assert any(p["id"] == pecheur["id"] for p in by_name.json())


@pytest.mark.asyncio
async def test_pecheurs_require_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/pecheurs")
    assert response.status_code == 401
