"""Tests d'acceptation M6 — §5.6 indicateurs exacts (pas d'agrégation approximative)."""

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


def _unique_day() -> tuple[str, str, str]:
    offset = uuid.uuid4().int % 9000
    day = date(2045, 1, 1) + timedelta(days=offset)
    iso = day.isoformat()
    capture_at = datetime(day.year, day.month, day.day, 10, 0, tzinfo=UTC).isoformat()
    return iso, iso, capture_at


async def _pecheur_boat(client: AsyncClient, headers: dict) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Mba",
            "prenom": "Dashboard",
            "numero_licence": f"LIC-M6-{suffix}",
            "email": f"dash.m6.{suffix}@example.com",
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
            "nom": "Pirogue M6",
            "immatriculation": f"GA-M6-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pid, emb.json()["id"]


@pytest.mark.asyncio
async def test_dashboard_chiffres_exactement_injectes(
    client: AsyncClient, agent_headers: dict
) -> None:
    """§5.6 : volumes / répartition / delta pêcheurs actifs = données injectées."""
    before = await client.get("/api/v1/dashboard", headers=agent_headers)
    assert before.status_code == 200, before.text
    base_actifs = before.json()["pecheurs_actifs"]

    pid, emb = await _pecheur_boat(client, agent_headers)
    # Second pêcheur actif
    await _pecheur_boat(client, agent_headers)

    debut, fin, capture_at = _unique_day()
    # 12.5 capitaine + 7.5 crevette = 20.0 exact
    for espece, kg in (("capitaine", 12.5), ("crevette", 7.5)):
        res = await client.post(
            "/api/v1/captures",
            headers=agent_headers,
            json={
                "pecheur_id": pid,
                "embarcation_id": emb,
                "espece": espece,
                "quantite_kg": kg,
                "methode": "filet",
                "point_debarquement": "Owendo",
                "date_capture": capture_at,
            },
        )
        assert res.status_code == 201, res.text

    dash = await client.get(
        "/api/v1/dashboard",
        headers=agent_headers,
        params={"debut": f"{debut}T00:00:00Z", "fin": f"{fin}T23:59:59Z"},
    )
    assert dash.status_code == 200, dash.text
    body = dash.json()

    assert body["pecheurs_actifs"] == base_actifs + 2
    assert body["volume_total_kg"] == 20.0
    by_espece = {r["espece"]: r["volume_kg"] for r in body["repartition_especes"]}
    assert by_espece["capitaine"] == 12.5
    assert by_espece["crevette"] == 7.5


@pytest.mark.asyncio
async def test_dashboard_alertes_actives_et_zone_activite(
    client: AsyncClient, agent_headers: dict
) -> None:
    pid, emb = await _pecheur_boat(client, agent_headers)
    debut, fin, capture_at = _unique_day()

    # Quota + capture → alerte 100 %
    quota = await client.post(
        "/api/v1/quotas",
        headers=agent_headers,
        json={
            "espece": "sardine",
            "periode_debut": debut,
            "periode_fin": fin,
            "volume_autorise_kg": 10.0,
        },
    )
    assert quota.status_code == 201, quota.text
    quota_id = quota.json()["id"]

    cap_alert = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "sardine",
            "quantite_kg": 11.0,
            "methode": "filet",
            "point_debarquement": "Libreville",
            "date_capture": capture_at,
        },
    )
    assert cap_alert.status_code == 201, cap_alert.text

    # Zone + capture géolocalisée dedans
    suffix = uuid.uuid4().hex[:6]
    zone = await client.post(
        "/api/v1/zones",
        headers=agent_headers,
        json={
            "nom": f"Activité M6 {suffix}",
            "type": "sensible",
            "geometrie": {"type": "Polygon", "coordinates": [ZONE_RING]},
            "actif": True,
        },
    )
    assert zone.status_code == 201, zone.text

    cap_zone = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": "merou",
            "quantite_kg": 3.0,
            "methode": "ligne",
            "point_debarquement": "Owendo",
            "date_capture": capture_at,
            "position_capture": {"type": "Point", "coordinates": POINT_INSIDE},
        },
    )
    assert cap_zone.status_code == 201, cap_zone.text

    dash = await client.get(
        "/api/v1/dashboard",
        headers=agent_headers,
        params={"debut": f"{debut}T00:00:00Z", "fin": f"{fin}T23:59:59Z"},
    )
    assert dash.status_code == 200, dash.text
    body = dash.json()

    alert_match = [
        a
        for a in body["alertes_actives"]
        if a["type"] == "depassement_quota"
        and a["declencheur"].get("quota_id") == quota_id
    ]
    assert alert_match, body["alertes_actives"]

    zone_match = [
        z for z in body["zones_forte_activite"] if z["label"] == zone.json()["nom"]
    ]
    assert zone_match, body["zones_forte_activite"]
    assert zone_match[0]["nb_captures"] == 1
    assert zone_match[0]["volume_kg"] == 3.0
    assert zone_match[0]["centre"]["type"] == "Point"


@pytest.mark.asyncio
async def test_dashboard_refuse_pecheur(
    client: AsyncClient, agent_headers: dict
) -> None:
    suffix = uuid.uuid4().hex[:8]
    email = f"pecheur.dash.{suffix}@example.com"
    created = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Test",
            "prenom": "Pecheur",
            "numero_licence": f"LIC-PD-{suffix}",
            "email": email,
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert created.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "mot_de_passe": "PecheurPass1!"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    denied = await client.get("/api/v1/dashboard", headers=headers)
    assert denied.status_code in (401, 403)
