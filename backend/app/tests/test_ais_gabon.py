"""Tests ADR-005 — AIS filtré ZEE Gabon."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.modules.ais_gabon.service import point_in_gabon_eez, refresh_ais_cache


def test_eez_contains_offshore_rejects_inland() -> None:
    assert point_in_gabon_eez(8.5, 0.0) is True
    assert point_in_gabon_eez(10.0, -0.7) is False  # terre / hors ZEE


@pytest.mark.asyncio
async def test_ais_live_filters_eez(client: AsyncClient, agent_headers: dict) -> None:
    from app.modules.ais_gabon.service import _parse_openwaters_feature
    from app.modules.ais_gabon import service as svc

    fake_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [8.5, 0.0]},
            "properties": {"mmsi": "123456789", "name": "MV GABON TEST", "sog": 9.2},
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [10.2, -0.5]},
            "properties": {"mmsi": "111", "name": "INLAND REJECT"},
        },
    ]
    parsed = [v for f in fake_features if (v := _parse_openwaters_feature(f))]

    with (
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_rest",
            new=AsyncMock(return_value=parsed),
        ),
        patch(
            "app.modules.ais_gabon.service.fetch_aisstream_ws",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_ws",
            new=AsyncMock(return_value=[]),
        ),
        patch("app.modules.ais_gabon.service.save_snapshot"),
    ):
        svc._cache_fetched_at = None
        resp = await client.get("/api/v1/ais/live?refresh=true", headers=agent_headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["enabled"] is True
    assert body["eez_filter"] is True
    mmsis = {v["mmsi"] for v in body["vessels"] if not v.get("demo")}
    assert "123456789" in mmsis
    assert "111" not in mmsis


@pytest.mark.asyncio
async def test_ais_live_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/ais/live")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_cache_demo_when_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_enabled", True)
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_demo_when_empty", True)
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.aisstream_api_key", None)

    with (
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_rest",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.modules.ais_gabon.service.fetch_aisstream_ws",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_ws",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.modules.ais_gabon.service.load_snapshot",
            return_value=[],
        ),
    ):
        import app.modules.ais_gabon.service as svc

        svc._cache_fetched_at = None
        out = await refresh_ais_cache(force=True)

    assert out.enabled
    assert any(v.demo for v in out.vessels)
    assert all(point_in_gabon_eez(*v.position.coordinates) for v in out.vessels)


@pytest.mark.asyncio
async def test_refresh_empty_without_demo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_enabled", True)
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_demo_when_empty", False)
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.aisstream_api_key", None)

    with (
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_rest",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.modules.ais_gabon.service.fetch_aisstream_ws",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_ws",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.modules.ais_gabon.service.load_snapshot",
            return_value=[],
        ),
    ):
        import app.modules.ais_gabon.service as svc

        svc._cache_fetched_at = None
        out = await refresh_ais_cache(force=True)

    assert out.enabled
    assert out.vessels == []
    assert "AISSTREAM_API_KEY" in out.note
