"""Correctifs sécurité gate M1–M4 — anti-IDOR captures, dossier licence, DELETE GPS."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient


async def _create_pecheur_embarcation(
    client: AsyncClient, headers: dict, *, tag: str = "SEC"
) -> tuple[str, str, str, str]:
    """Retourne pecheur_id, emb_id, licence, email."""
    suffix = uuid.uuid4().hex[:8]
    licence = f"LIC-{tag}-{suffix}"
    email = f"pecheur.{tag.lower()}.{suffix}@example.com"
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Test",
            "prenom": tag,
            "numero_licence": licence,
            "email": email,
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
            "nom": f"Pirogue {tag}",
            "immatriculation": f"GA-{tag}-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pecheur_id, emb.json()["id"], licence, email


async def _login(client: AsyncClient, email: str, password: str = "PecheurPass1!") -> dict:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "mot_de_passe": password},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_capture_idempotence_idor_blocked(
    client: AsyncClient, agent_headers: dict
) -> None:
    """POST /captures avec UUID d'une autre capture → 409, pas de fuite."""
    p1, e1, _, email1 = await _create_pecheur_embarcation(client, agent_headers, tag="A")
    p2, e2, _, _ = await _create_pecheur_embarcation(client, agent_headers, tag="B")

    victim_id = str(uuid.uuid4())
    created = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "id": victim_id,
            "pecheur_id": p1,
            "embarcation_id": e1,
            "espece": "capitaine",
            "quantite_kg": 5.0,
            "methode": "filet",
            "point_debarquement": "Owendo",
            "date_capture": datetime(2026, 7, 28, 6, 0, tzinfo=UTC).isoformat(),
        },
    )
    assert created.status_code == 201, created.text

    pecheur_headers = await _login(client, email1)
    # Tentative IDOR : réutiliser l'UUID victime avec un autre pêcheur (via agent)
    steal = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "id": victim_id,
            "pecheur_id": p2,
            "embarcation_id": e2,
            "espece": "thon",
            "quantite_kg": 99.0,
            "methode": "ligne",
            "point_debarquement": "Port-Gentil",
            "date_capture": datetime(2026, 7, 28, 7, 0, tzinfo=UTC).isoformat(),
        },
    )
    assert steal.status_code == 409, steal.text
    assert steal.json()["code"] == "CAPTURE_ID_CONFLICT"

    # Idempotence légitime (même pêcheur / embarcation) OK
    again = await client.post(
        "/api/v1/captures",
        headers=pecheur_headers,
        json={
            "id": victim_id,
            "pecheur_id": p1,
            "embarcation_id": e1,
            "espece": "capitaine",
            "quantite_kg": 5.0,
            "methode": "filet",
            "point_debarquement": "Owendo",
            "date_capture": datetime(2026, 7, 28, 6, 0, tzinfo=UTC).isoformat(),
        },
    )
    assert again.status_code == 201, again.text
    assert again.json()["espece"] == "capitaine"
    assert again.json()["quantite_kg"] == 5.0


@pytest.mark.asyncio
async def test_dossier_pecheur_cannot_see_other_licence(
    client: AsyncClient, agent_headers: dict
) -> None:
    _, _, licence_a, email_a = await _create_pecheur_embarcation(
        client, agent_headers, tag="DOSA"
    )
    _, _, licence_b, _ = await _create_pecheur_embarcation(client, agent_headers, tag="DOSB")

    headers_a = await _login(client, email_a)
    own = await client.get(
        "/api/v1/positions/dossier",
        headers=headers_a,
        params={"licence": licence_a},
    )
    assert own.status_code == 200, own.text

    other = await client.get(
        "/api/v1/positions/dossier",
        headers=headers_a,
        params={"licence": licence_b},
    )
    assert other.status_code == 404, other.text
    assert other.json()["code"] == "LICENCE_NOT_FOUND"


@pytest.mark.asyncio
async def test_clear_trajectory_forbidden_for_pecheur(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur_id, emb_id, _, email = await _create_pecheur_embarcation(
        client, agent_headers, tag="CLR"
    )
    await client.post(
        "/api/v1/positions",
        headers=agent_headers,
        json={
            "embarcation_id": emb_id,
            "position": {"type": "Point", "coordinates": [9.18, 0.42]},
            "horodatage": datetime(2026, 7, 28, 9, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    pecheur_headers = await _login(client, email)
    forbidden = await client.delete(
        f"/api/v1/positions/embarcation/{emb_id}",
        headers=pecheur_headers,
    )
    assert forbidden.status_code == 403, forbidden.text

    # Agent peut toujours purger (démo)
    ok = await client.delete(
        f"/api/v1/positions/embarcation/{emb_id}",
        headers=agent_headers,
    )
    assert ok.status_code == 200, ok.text
    _ = pecheur_id  # utilisé pour clarté fixture
