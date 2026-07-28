"""Tests d'acceptation M4 — §5.4 déclaration captures + sync offline idempotente."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient


async def _create_pecheur_embarcation(
    client: AsyncClient, headers: dict
) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Mba",
            "prenom": "Jean",
            "numero_licence": f"LIC-M4-{suffix}",
            "email": f"jean.m4.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    pecheur_id = pecheur.json()["id"]
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur_id,
            "nom": "Pirogue M4",
            "immatriculation": f"GA-M4-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pecheur_id, emb.json()["id"]


def _capture_payload(
    pecheur_id: str,
    embarcation_id: str,
    *,
    client_id: str | None = None,
    espece: str = "capitaine",
    quantite_kg: float = 12.5,
) -> dict:
    body: dict = {
        "pecheur_id": pecheur_id,
        "embarcation_id": embarcation_id,
        "espece": espece,
        "quantite_kg": quantite_kg,
        "methode": "filet",
        "point_debarquement": "Owendo",
        "date_capture": datetime(2026, 7, 28, 6, 30, tzinfo=UTC).isoformat(),
    }
    if client_id is not None:
        body["id"] = client_id
    return body


@pytest.mark.asyncio
async def test_catalog_listes_fermees(client: AsyncClient, agent_headers: dict) -> None:
    response = await client.get("/api/v1/captures/catalog", headers=agent_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert "capitaine" in data["especes"]
    assert "merou" in data["especes"]
    assert "filet" in data["methodes"]


@pytest.mark.asyncio
async def test_create_capture_and_list(client: AsyncClient, agent_headers: dict) -> None:
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    created = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json=_capture_payload(pecheur_id, emb_id, espece="crevette"),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["espece"] == "crevette"
    assert body["quantite_kg"] == 12.5
    assert body["methode"] == "filet"
    assert body["point_debarquement"] == "Owendo"
    assert body["synchronise_a"] is not None

    listed = await client.get(
        "/api/v1/captures",
        headers=agent_headers,
        params={"pecheur_id": pecheur_id},
    )
    assert listed.status_code == 200
    ids = [c["id"] for c in listed.json()]
    assert body["id"] in ids


@pytest.mark.asyncio
async def test_espece_hors_liste_rejetee(client: AsyncClient, agent_headers: dict) -> None:
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    response = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json=_capture_payload(pecheur_id, emb_id, espece="poisson_invente"),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_sync_offline_idempotent_no_duplicate_no_loss(
    client: AsyncClient, agent_headers: dict
) -> None:
    """§5.4 : déclaration « mode avion » → sync → présente en base, sans doublon."""
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    client_id = str(uuid.uuid4())
    offline_payload = _capture_payload(
        pecheur_id, emb_id, client_id=client_id, espece="thon", quantite_kg=8.0
    )

    # Première sync (réactivation réseau)
    first = await client.post(
        "/api/v1/captures/sync",
        headers=agent_headers,
        json={"captures": [offline_payload]},
    )
    assert first.status_code == 200, first.text
    result1 = first.json()
    assert client_id in [str(x) for x in result1["accepts"]]
    assert result1["duplicates"] == []
    assert result1["rejects"] == []

    # Rejeu du même client_id (retry réseau) → duplicate, pas de 2e ligne
    second = await client.post(
        "/api/v1/captures/sync",
        headers=agent_headers,
        json={"captures": [offline_payload]},
    )
    assert second.status_code == 200, second.text
    result2 = second.json()
    assert result2["accepts"] == []
    assert client_id in [str(x) for x in result2["duplicates"]]
    assert result2["rejects"] == []

    listed = await client.get(
        "/api/v1/captures",
        headers=agent_headers,
        params={"pecheur_id": pecheur_id},
    )
    assert listed.status_code == 200
    rows = [c for c in listed.json() if c["id"] == client_id]
    assert len(rows) == 1
    assert rows[0]["espece"] == "thon"
    assert rows[0]["quantite_kg"] == 8.0
    assert rows[0]["synchronise_a"] is not None


@pytest.mark.asyncio
async def test_sync_batch_partial_accept_and_reject(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Pas de perte : une entrée invalide n'empêche pas les valides du même lot."""
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    good_id = str(uuid.uuid4())
    bad_id = str(uuid.uuid4())
    fake_emb = str(uuid.uuid4())

    response = await client.post(
        "/api/v1/captures/sync",
        headers=agent_headers,
        json={
            "captures": [
                _capture_payload(pecheur_id, emb_id, client_id=good_id, espece="merou"),
                _capture_payload(
                    pecheur_id, fake_emb, client_id=bad_id, espece="barracuda"
                ),
            ]
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert good_id in [str(x) for x in data["accepts"]]
    assert any(r.get("id") == bad_id for r in data["rejects"])
    assert data["duplicates"] == []

    got = await client.get(f"/api/v1/captures/{good_id}", headers=agent_headers)
    assert got.status_code == 200
    assert got.json()["espece"] == "merou"


@pytest.mark.asyncio
async def test_create_idempotent_by_client_id(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    client_id = str(uuid.uuid4())
    payload = _capture_payload(pecheur_id, emb_id, client_id=client_id)

    a = await client.post("/api/v1/captures", headers=agent_headers, json=payload)
    b = await client.post("/api/v1/captures", headers=agent_headers, json=payload)
    assert a.status_code == 201
    assert b.status_code == 201
    assert a.json()["id"] == b.json()["id"] == client_id

    listed = await client.get(
        "/api/v1/captures",
        headers=agent_headers,
        params={"embarcation_id": emb_id},
    )
    assert len([c for c in listed.json() if c["id"] == client_id]) == 1


@pytest.mark.asyncio
async def test_captures_require_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/captures")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_agent_web_create_patch_delete(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Chemin web agent : POST création + PATCH correction + DELETE hard."""
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)

    created = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json=_capture_payload(pecheur_id, emb_id, espece="sardine", quantite_kg=4.0),
    )
    assert created.status_code == 201, created.text
    capture_id = created.json()["id"]
    assert created.json()["espece"] == "sardine"

    patched = await client.patch(
        f"/api/v1/captures/{capture_id}",
        headers=agent_headers,
        json={
            "espece": "capitaine",
            "quantite_kg": 6.5,
            "methode": "ligne",
            "point_debarquement": "Port-Gentil",
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["espece"] == "capitaine"
    assert body["quantite_kg"] == 6.5
    assert body["methode"] == "ligne"
    assert body["point_debarquement"] == "Port-Gentil"

    bad_patch = await client.patch(
        f"/api/v1/captures/{capture_id}",
        headers=agent_headers,
        json={"espece": "poisson_invente"},
    )
    assert bad_patch.status_code == 422

    deleted = await client.delete(
        f"/api/v1/captures/{capture_id}", headers=agent_headers
    )
    assert deleted.status_code == 200, deleted.text
    assert "supprimée" in deleted.json()["detail"].lower()

    missing = await client.get(
        f"/api/v1/captures/{capture_id}", headers=agent_headers
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_patch_delete_require_auth(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    created = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json=_capture_payload(pecheur_id, emb_id),
    )
    assert created.status_code == 201
    capture_id = created.json()["id"]

    no_auth_patch = await client.patch(
        f"/api/v1/captures/{capture_id}", json={"quantite_kg": 1.0}
    )
    assert no_auth_patch.status_code in (401, 403)

    no_auth_del = await client.delete(f"/api/v1/captures/{capture_id}")
    assert no_auth_del.status_code in (401, 403)
