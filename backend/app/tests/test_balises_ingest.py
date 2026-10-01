"""Tests ADR-009 — ingestion des balises satellitaires (source=balise), données fictives."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.modules.geolocalisation.gabon_routes import ESTUAIRE_LIBREVILLE

INGEST = "/api/v1/positions/balises/ingest"
KEY = "demo-balise-fictive"


async def _embarcation_avec_balise(client: AsyncClient, headers: dict) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Obame",
            "prenom": "Marie",
            "numero_licence": f"LIC-BAL-{suffix}",
            "email": f"marie.bal.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    balise_id = f"BAL-FICTIF-{suffix}"
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": "Pirogue Balise",
            "immatriculation": f"GA-BAL-{suffix}",
            "type": "pirogue",
            "balise_id": balise_id,
        },
    )
    assert emb.status_code == 201, emb.text
    assert emb.json()["balise_id"] == balise_id
    return emb.json()["id"], balise_id


def _messages(balise_id: str, base: datetime, n: int = 4, **extra) -> list[dict]:
    path = list(ESTUAIRE_LIBREVILLE)
    return [
        {
            "balise_id": balise_id,
            "lon": path[i][0],
            "lat": path[i][1],
            "horodatage": (base + timedelta(minutes=30 * i)).isoformat(),
            **extra,
        }
        for i in range(n)
    ]


@pytest.mark.asyncio
async def test_ingest_requires_key(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.modules.geolocalisation.router.settings.balise_ingest_key", None)
    body = {"messages": _messages("BAL-X", datetime(2026, 10, 1, 6, tzinfo=UTC), 1)}
    resp = await client.post(INGEST, json=body, headers={"X-Balise-Ingest-Key": "x"})
    assert resp.status_code == 503

    monkeypatch.setattr("app.modules.geolocalisation.router.settings.balise_ingest_key", KEY)
    resp = await client.post(INGEST, json=body)
    assert resp.status_code == 401
    resp = await client.post(INGEST, json=body, headers={"X-Balise-Ingest-Key": "mauvaise"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ingest_balise_positions_visible_in_trajectory(
    client: AsyncClient, agent_headers: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.modules.geolocalisation.router.settings.balise_ingest_key", KEY)
    emb_id, balise_id = await _embarcation_avec_balise(client, agent_headers)
    base = datetime(2026, 10, 1, 6, 0, tzinfo=UTC)
    msgs = _messages(balise_id, base, 4)
    # Balise inconnue + position à terre (centre de Libreville) ignorées, listées / comptées
    msgs.append(
        {"balise_id": "BAL-INCONNUE", "lon": 9.45, "lat": 0.39, "horodatage": base.isoformat()}
    )
    msgs.append(
        {
            "balise_id": balise_id,
            "lon": 9.4544,
            "lat": 0.4162,
            "horodatage": (base + timedelta(hours=5)).isoformat(),
        }
    )
    resp = await client.post(
        INGEST,
        json={"fournisseur": "fictif", "messages": msgs},
        headers={"X-Balise-Ingest-Key": KEY},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["recus"] == 6
    assert body["integres"] == 4
    assert body["balises_inconnues"] == ["BAL-INCONNUE"]
    assert body["hors_eau"] == 1
    assert body["alertes_detresse"] == 0

    # Rejouer le même lot : aucun doublon créé
    resp = await client.post(
        INGEST, json={"messages": msgs[:4]}, headers={"X-Balise-Ingest-Key": KEY}
    )
    assert resp.status_code == 200
    assert resp.json()["integres"] == 0 and resp.json()["doublons"] == 4

    traj = await client.get(
        "/api/v1/positions/trajectory", headers=agent_headers, params={"embarcation_id": emb_id}
    )
    assert traj.status_code == 200
    points = traj.json()
    assert len(points) == 4
    assert {p["source"] for p in points} == {"balise"}
    assert [p["horodatage"] for p in points] == sorted(p["horodatage"] for p in points)


@pytest.mark.asyncio
async def test_ingest_detresse_creates_critical_alert_once(
    client: AsyncClient, agent_headers: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.modules.geolocalisation.router.settings.balise_ingest_key", KEY)
    emb_id, balise_id = await _embarcation_avec_balise(client, agent_headers)
    base = datetime.now(UTC) - timedelta(minutes=10)
    msgs = _messages(balise_id, base, 2, alerte=True)
    resp = await client.post(INGEST, json={"messages": msgs}, headers={"X-Balise-Ingest-Key": KEY})
    assert resp.status_code == 200, resp.text
    assert resp.json()["integres"] == 2
    assert resp.json()["alertes_detresse"] == 1  # anti-doublon : un bouton maintenu = une alerte

    alertes = await client.get(
        "/api/v1/alertes", headers=agent_headers, params={"embarcation_id": emb_id}
    )
    assert alertes.status_code == 200, alertes.text
    rows = alertes.json()
    items = rows if isinstance(rows, list) else rows.get("items", rows.get("alertes", []))
    detresse = [a for a in items if a["declencheur"].get("regle") == "detresse_balise"]
    assert len(detresse) == 1
    assert detresse[0]["niveau_gravite"] == "critique"
    assert detresse[0]["declencheur"]["origine"].startswith("balise:nemo:")


@pytest.mark.asyncio
async def test_balise_id_unique(client: AsyncClient, agent_headers: dict) -> None:
    _, balise_id = await _embarcation_avec_balise(client, agent_headers)
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Ndong",
            "prenom": "Paul",
            "numero_licence": f"LIC-BAL2-{suffix}",
            "email": f"paul.bal.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201
    dup = await client.post(
        "/api/v1/embarcations",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": "Doublon",
            "immatriculation": f"GA-BAL2-{suffix}",
            "balise_id": balise_id,
        },
    )
    assert dup.status_code == 409
