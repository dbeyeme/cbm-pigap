"""Alertes métier issues du référentiel : espèce protégée, déclaration manquante."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

ESTUAIRE_LARGE = [9.20, 0.42]
ESTUAIRE_LARGE_2 = [9.21, 0.43]
QUAI_OWENDO = [9.508, 0.283]


async def _boat(client: AsyncClient, headers: dict) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": f"Metier-{suffix}",
            "prenom": "Test",
            "email": f"metier.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": f"Pirogue {suffix}",
            "immatriculation": f"OW-{suffix}",
        },
    )
    assert emb.status_code == 201, emb.text
    return pecheur.json()["id"], emb.json()["id"]


async def _position(client, headers, emb, coords, when):
    r = await client.post(
        "/api/v1/positions",
        headers=headers,
        json={
            "embarcation_id": emb,
            "position": {"type": "Point", "coordinates": coords},
            "horodatage": when.isoformat(),
            "source": "mobile",
        },
    )
    assert r.status_code == 201, r.text


async def _regles(client, headers, emb) -> list[str]:
    r = await client.get(
        "/api/v1/alertes", headers=headers, params={"embarcation_id": emb, "limit": 200}
    )
    assert r.status_code == 200, r.text
    return [a["declencheur"].get("regle") for a in r.json()]


@pytest.mark.asyncio
async def test_espece_protegee_declenche_alerte_critique(
    client: AsyncClient, agent_headers: dict
) -> None:
    pid, emb = await _boat(client, agent_headers)
    res = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "merou_geant",
            "quantite_kg": 12,
            "methode": "ligne_fond",
            "point_debarquement": "Owendo",
            "date_capture": datetime.now(UTC).isoformat(),
        },
    )
    assert res.status_code == 201, res.text
    r = await client.get("/api/v1/alertes", headers=agent_headers, params={"embarcation_id": emb})
    found = [a for a in r.json() if a["declencheur"].get("regle") == "espece_protegee"]
    assert len(found) == 1 and found[0]["niveau_gravite"] == "critique"
    assert found[0]["declencheur"]["espece"] == "merou_geant"


@pytest.mark.asyncio
async def test_retour_au_port_sans_declaration(client: AsyncClient, agent_headers: dict) -> None:
    _pid, emb = await _boat(client, agent_headers)
    t0 = datetime(2064, 2, 1, 6, 0, tzinfo=UTC) + timedelta(days=uuid.uuid4().int % 300)
    # Sortie en mer (1 h) puis retour à quai à Owendo depuis 3 h : aucune capture déclarée
    await _position(client, agent_headers, emb, ESTUAIRE_LARGE, t0)
    await _position(client, agent_headers, emb, ESTUAIRE_LARGE_2, t0 + timedelta(hours=1))
    await _position(client, agent_headers, emb, QUAI_OWENDO, t0 + timedelta(hours=2))
    assert "declaration_manquante" not in await _regles(client, agent_headers, emb)
    await _position(client, agent_headers, emb, QUAI_OWENDO, t0 + timedelta(hours=5))
    regles = await _regles(client, agent_headers, emb)
    assert regles.count("declaration_manquante") == 1

    # Une nouvelle position à quai ne crée pas de doublon
    await _position(client, agent_headers, emb, QUAI_OWENDO, t0 + timedelta(hours=6))
    assert (await _regles(client, agent_headers, emb)).count("declaration_manquante") == 1


@pytest.mark.asyncio
async def test_retour_au_port_avec_declaration_sans_alerte(
    client: AsyncClient, agent_headers: dict
) -> None:
    pid, emb = await _boat(client, agent_headers)
    t0 = datetime(2065, 2, 1, 6, 0, tzinfo=UTC) + timedelta(days=uuid.uuid4().int % 300)
    await _position(client, agent_headers, emb, ESTUAIRE_LARGE, t0)
    await _position(client, agent_headers, emb, ESTUAIRE_LARGE_2, t0 + timedelta(hours=1))
    await _position(client, agent_headers, emb, QUAI_OWENDO, t0 + timedelta(hours=2))
    cap = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "sardine",
            "quantite_kg": 30,
            "methode": "filet_sardine",
            "point_debarquement": "Owendo",
            "date_capture": (t0 + timedelta(hours=2, minutes=30)).isoformat(),
        },
    )
    assert cap.status_code == 201, cap.text
    await _position(client, agent_headers, emb, QUAI_OWENDO, t0 + timedelta(hours=5))
    assert "declaration_manquante" not in await _regles(client, agent_headers, emb)
