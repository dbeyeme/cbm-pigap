"""Tests d'acceptation M7 — §5.7 trois règles (positif + négatif chacune)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient

ZONE_RING = [
    [9.18, 0.38],
    [9.22, 0.38],
    [9.22, 0.42],
    [9.18, 0.42],
    [9.18, 0.38],
]
POINT_INSIDE = [9.20, 0.40]
POINT_OUTSIDE = [9.10, 0.30]


async def _boat(client: AsyncClient, headers: dict) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Alerte",
            "prenom": "Test",
            "numero_licence": f"LIC-M7-{suffix}",
            "email": f"m7.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    pid = pecheur.json()["id"]
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pid,
            "nom": "Pirogue M7",
            "immatriculation": f"GA-M7-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pid, emb.json()["id"]


async def _zone_interdite(client: AsyncClient, headers: dict) -> dict:
    suffix = uuid.uuid4().hex[:6]
    res = await client.post(
        "/api/v1/zones",
        headers=headers,
        json={
            "nom": f"Interdite M7 {suffix}",
            "type": "interdite",
            "geometrie": {"type": "Polygon", "coordinates": [ZONE_RING]},
            "actif": True,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _unique_day() -> date:
    return date(2060, 1, 1) + timedelta(days=uuid.uuid4().int % 9000)


@pytest.mark.asyncio
async def test_regle_zone_interdite_positif_et_negatif(
    client: AsyncClient, agent_headers: dict
) -> None:
    pid, emb = await _boat(client, agent_headers)
    zone = await _zone_interdite(client, agent_headers)
    when = datetime(2061, 5, 1, 12, 0, tzinfo=UTC).isoformat()

    pos = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "capitaine",
            "quantite_kg": 1.0,
            "methode": "filet",
            "point_debarquement": "Owendo",
            "date_capture": when,
            "position_capture": {"type": "Point", "coordinates": POINT_INSIDE},
        },
    )
    assert pos.status_code == 201, pos.text

    alertes = await client.get(
        "/api/v1/alertes",
        headers=agent_headers,
        params={"type": "zone_interdite", "embarcation_id": emb},
    )
    assert alertes.status_code == 200, alertes.text
    hit = [
        a
        for a in alertes.json()
        if a["declencheur"].get("zone_id") == zone["id"]
    ]
    assert hit, alertes.json()
    assert hit[0]["declencheur"].get("regle") == "intrusion_zone_interdite"

    before_ids = {a["id"] for a in alertes.json()}
    neg = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "capitaine",
            "quantite_kg": 1.0,
            "methode": "filet",
            "point_debarquement": "Owendo",
            "date_capture": datetime(2061, 5, 2, 12, 0, tzinfo=UTC).isoformat(),
            "position_capture": {"type": "Point", "coordinates": POINT_OUTSIDE},
        },
    )
    assert neg.status_code == 201, neg.text
    after = await client.get(
        "/api/v1/alertes",
        headers=agent_headers,
        params={"type": "zone_interdite", "embarcation_id": emb},
    )
    new_outside = [
        a
        for a in after.json()
        if a["id"] not in before_ids
        and a["declencheur"].get("position", {}).get("coordinates") == POINT_OUTSIDE
    ]
    assert new_outside == []


@pytest.mark.asyncio
async def test_regle_depassement_quota_positif_et_negatif(
    client: AsyncClient, agent_headers: dict
) -> None:
    pid, emb = await _boat(client, agent_headers)
    day = _unique_day()
    debut, fin = day.isoformat(), day.isoformat()
    capture_at = datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC).isoformat()

    quota = await client.post(
        "/api/v1/quotas",
        headers=agent_headers,
        json={
            "espece": "barracuda",
            "periode_debut": debut,
            "periode_fin": fin,
            "volume_autorise_kg": 100.0,
        },
    )
    assert quota.status_code == 201, quota.text
    qid = quota.json()["id"]
    assert quota.json()["volume_consomme_kg"] == 0.0

    low = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "barracuda",
            "quantite_kg": 50.0,
            "methode": "ligne",
            "point_debarquement": "Port-Gentil",
            "date_capture": capture_at,
        },
    )
    assert low.status_code == 201, low.text
    listed = await client.get(
        "/api/v1/alertes",
        headers=agent_headers,
        params={"type": "depassement_quota"},
    )
    assert not any(a["declencheur"].get("quota_id") == qid for a in listed.json())

    high = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "barracuda",
            "quantite_kg": 45.0,
            "methode": "ligne",
            "point_debarquement": "Port-Gentil",
            "date_capture": datetime(
                day.year, day.month, day.day, 18, 0, tzinfo=UTC
            ).isoformat(),
        },
    )
    assert high.status_code == 201, high.text
    listed2 = await client.get(
        "/api/v1/alertes",
        headers=agent_headers,
        params={"type": "depassement_quota"},
    )
    match = [
        a
        for a in listed2.json()
        if a["declencheur"].get("quota_id") == qid
        and float(a["declencheur"].get("seuil", 0)) == 0.9
    ]
    assert match, listed2.json()


@pytest.mark.asyncio
async def test_regle_tendance_positif_et_negatif(
    client: AsyncClient, agent_headers: dict
) -> None:
    pid, emb = await _boat(client, agent_headers)
    # Historique bien avant la fenêtre 7j : 4 × 10 kg sur 4 semaines lointaines
    # → moyenne hist ≈ 10 kg / 7j
    base = datetime(2070, 8, 1, 12, 0, tzinfo=UTC)
    for i in range(4):
        day = base - timedelta(days=14 + 7 * i)  # 14, 21, 28, 35 jours avant
        cap = await client.post(
            "/api/v1/captures",
            headers=agent_headers,
            json={
                "pecheur_id": pid,
                "embarcation_id": emb,
                "espece": "sardine",
                "quantite_kg": 10.0,
                "methode": "senne",
                "point_debarquement": "Owendo",
                "date_capture": day.isoformat(),
            },
        )
        assert cap.status_code == 201, cap.text

    # Négatif : 15 kg sur 7j < 2×10
    neg = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "sardine",
            "quantite_kg": 15.0,
            "methode": "senne",
            "point_debarquement": "Owendo",
            "date_capture": (base - timedelta(days=1)).isoformat(),
        },
    )
    assert neg.status_code == 201, neg.text
    anomalies = await client.get(
        "/api/v1/alertes",
        headers=agent_headers,
        params={"type": "anomalie", "embarcation_id": emb},
    )
    assert anomalies.status_code == 200
    assert anomalies.json() == []

    # Positif : +10 → 25 kg > 20
    pos = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "sardine",
            "quantite_kg": 10.0,
            "methode": "senne",
            "point_debarquement": "Owendo",
            "date_capture": base.isoformat(),
        },
    )
    assert pos.status_code == 201, pos.text
    anomalies2 = await client.get(
        "/api/v1/alertes",
        headers=agent_headers,
        params={"type": "anomalie", "embarcation_id": emb},
    )
    assert anomalies2.status_code == 200
    rows = anomalies2.json()
    assert rows, rows
    assert rows[0]["declencheur"].get("regle") == "activite_inhabituelle"
    assert float(rows[0]["declencheur"]["seuil_multiplicateur"]) == 2.0
