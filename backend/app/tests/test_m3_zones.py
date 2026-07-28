"""Tests d'acceptation M3 — §5.3 zones + ST_Intersects (pas de faux positifs)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

# Zone interdite fictive — carré en Estuaire (données de test uniquement)
ZONE_INTERDITE_RING = [
    [9.18, 0.38],
    [9.22, 0.38],
    [9.22, 0.42],
    [9.18, 0.42],
    [9.18, 0.38],
]
POINT_INSIDE = [9.20, 0.40]
POINT_OUTSIDE = [9.10, 0.30]  # hors polygone, toujours en mer côté ouest


async def _create_zone_interdite(client: AsyncClient, headers: dict) -> dict:
    suffix = uuid.uuid4().hex[:6]
    res = await client.post(
        "/api/v1/zones",
        headers=headers,
        json={
            "nom": f"Zone test interdite {suffix}",
            "type": "interdite",
            "geometrie": {"type": "Polygon", "coordinates": [ZONE_INTERDITE_RING]},
            "actif": True,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_create_and_list_zone(client: AsyncClient, agent_headers: dict) -> None:
    zone = await _create_zone_interdite(client, agent_headers)
    assert zone["type"] == "interdite"
    assert zone["geometrie"]["type"] == "Polygon"

    listed = await client.get("/api/v1/zones", headers=agent_headers, params={"type": "interdite"})
    assert listed.status_code == 200, listed.text
    ids = {z["id"] for z in listed.json()}
    assert zone["id"] in ids


@pytest.mark.asyncio
async def test_intersection_inside_triggers_detection(
    client: AsyncClient, agent_headers: dict
) -> None:
    """§5.3 : position à l'intérieur d'une zone interdite → détection systématique."""
    zone = await _create_zone_interdite(client, agent_headers)
    res = await client.post(
        "/api/v1/zones/detect/intersection",
        headers=agent_headers,
        json={
            "position": {"type": "Point", "coordinates": POINT_INSIDE},
            "types": ["interdite"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["intersects"] is True
    assert any(z["id"] == zone["id"] for z in body["zones"])


@pytest.mark.asyncio
async def test_intersection_outside_no_false_positive(
    client: AsyncClient, agent_headers: dict
) -> None:
    """§5.3 : position à l'extérieur → jamais de détection (faux positifs)."""
    zone = await _create_zone_interdite(client, agent_headers)
    res = await client.post(
        "/api/v1/zones/detect/intersection",
        headers=agent_headers,
        json={
            "position": {"type": "Point", "coordinates": POINT_OUTSIDE},
            "types": ["interdite"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["intersects"] is False
    assert body["zones"] == []
    assert all(z["id"] != zone["id"] for z in body["zones"])


@pytest.mark.asyncio
async def test_inactive_zone_not_detected(client: AsyncClient, agent_headers: dict) -> None:
    zone = await _create_zone_interdite(client, agent_headers)
    patched = await client.patch(
        f"/api/v1/zones/{zone['id']}",
        headers=agent_headers,
        json={"actif": False},
    )
    assert patched.status_code == 200, patched.text

    res = await client.post(
        "/api/v1/zones/detect/intersection",
        headers=agent_headers,
        json={"position": {"type": "Point", "coordinates": POINT_INSIDE}},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert all(z["id"] != zone["id"] for z in body["zones"])


@pytest.mark.asyncio
async def test_import_geojson(client: AsyncClient, agent_headers: dict) -> None:
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "nom": f"Zone sensible Estuaire {suffix}",
                    "type": "sensible",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [9.25, 0.45],
                            [9.28, 0.45],
                            [9.28, 0.48],
                            [9.25, 0.48],
                            [9.25, 0.45],
                        ]
                    ],
                },
            }
        ],
    }
    res = await client.post(
        "/api/v1/zones/import/geojson",
        headers=agent_headers,
        json=payload,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["imported"] == 1
    assert body["zones"][0]["type"] == "sensible"
    assert "Estuaire" in body["zones"][0]["nom"]


@pytest.mark.asyncio
async def test_update_and_delete_zone(client: AsyncClient, agent_headers: dict) -> None:
    zone = await _create_zone_interdite(client, agent_headers)
    upd = await client.patch(
        f"/api/v1/zones/{zone['id']}",
        headers=agent_headers,
        json={"nom": "Zone renommée MVP"},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["nom"] == "Zone renommée MVP"

    deleted = await client.delete(f"/api/v1/zones/{zone['id']}", headers=agent_headers)
    assert deleted.status_code == 200, deleted.text

    missing = await client.get(f"/api/v1/zones/{zone['id']}", headers=agent_headers)
    assert missing.status_code == 404
