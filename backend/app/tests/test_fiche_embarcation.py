"""Fiche embarcation PIGAP au clic sur la carte."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

OWENDO = (9.505, 0.280)


@pytest.mark.asyncio
async def test_fiche_embarcation_complete(client: AsyncClient, admin_headers: dict) -> None:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=admin_headers,
        json={
            "nom": f"Fiche-{suffix}",
            "prenom": "Test",
            "email": f"fiche.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    emb = await client.post(
        "/api/v1/embarcations",
        headers=admin_headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": "Pirogue Fiche",
            "immatriculation": f"GA-FI-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    emb_id = emb.json()["id"]
    now = datetime.now(UTC)
    for minutes in (40, 25, 10):
        resp = await client.post(
            "/api/v1/positions",
            headers=admin_headers,
            json={
                "embarcation_id": emb_id,
                "position": {"type": "Point", "coordinates": list(OWENDO)},
                "horodatage": (now - timedelta(minutes=minutes)).isoformat(),
                "source": "mobile",
            },
        )
        assert resp.status_code == 201, resp.text

    fiche = await client.get(
        f"/api/v1/positions/embarcations/{emb_id}/fiche", headers=admin_headers
    )
    assert fiche.status_code == 200, fiche.text
    body = fiche.json()
    assert body["nom"] == "Pirogue Fiche"
    assert body["numero_licence"] == pecheur.json()["numero_licence"]
    assert body["statut_pecheur"] == "actif"
    assert body["statut_presence"] == "a_quai"
    assert body["port_nom"] == "Port d'Owendo"
    assert len(body["trajectoire"]) == 3
    assert body["statut_signal"] in ("actif", "recent")
    assert body["regularite"] in ("conforme", "a_verifier", "alerte")
    assert body["derniere_position"]["coordinates"][0] == pytest.approx(OWENDO[0], abs=1e-4)


@pytest.mark.asyncio
async def test_fiche_embarcation_inconnue(client: AsyncClient, admin_headers: dict) -> None:
    resp = await client.get(
        f"/api/v1/positions/embarcations/{uuid.uuid4()}/fiche", headers=admin_headers
    )
    assert resp.status_code == 404
