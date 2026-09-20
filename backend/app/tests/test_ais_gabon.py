"""Tests ADR-005 — AIS eaux gabonaises : flotte accumulée, ports, ingestion locale."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.modules.ais_gabon import service as svc
from app.modules.ais_gabon.ingest import normalize_aiscatcher, normalize_nmea
from app.modules.ais_gabon.ports import classify_statut_nav, port_proche, ship_type_label
from app.modules.ais_gabon.schemas import AisIngestPayload
from app.modules.ais_gabon.service import (
    point_in_gabon_eez,
    point_in_gabon_waters,
    refresh_ais_cache,
)


@pytest.fixture(autouse=True)
def _reset_fleet(monkeypatch: pytest.MonkeyPatch):
    svc.fleet.clear()
    svc._cache_fetched_at = None
    svc._cache_response = None
    svc._snapshot_loaded = True  # pas de snapshot disque dans les tests
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_enabled", True)
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_demo_when_empty", False)
    yield
    svc.fleet.clear()


def _no_external():
    return (
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_rest",
            new=AsyncMock(return_value=[]),
        ),
        patch("app.modules.ais_gabon.service.save_snapshot"),
    )


# --------------------------------------------------------------------------- #
# Géométrie
# --------------------------------------------------------------------------- #


def test_eez_contains_offshore_rejects_inland() -> None:
    assert point_in_gabon_eez(8.5, 0.0) is True
    assert point_in_gabon_eez(10.0, -0.7) is False  # terre / hors ZEE


def test_coastal_buffer_includes_ports_but_not_inland() -> None:
    """Le polygone ZEE strict exclut le bassin de Port-Gentil ; la marge côtière l'inclut."""
    assert point_in_gabon_eez(8.782, -0.717) is False
    assert point_in_gabon_waters(8.782, -0.717) is True  # Port-Gentil
    assert point_in_gabon_waters(9.508, 0.283) is True  # Owendo
    assert point_in_gabon_waters(10.0, -0.7) is False  # intérieur des terres
    assert point_in_gabon_waters(11.5, -1.5) is False  # hors bbox


# --------------------------------------------------------------------------- #
# Ports & classification
# --------------------------------------------------------------------------- #


def test_port_proche_owendo_and_port_gentil() -> None:
    near = port_proche(9.51, 0.29)
    assert near is not None and near[0].id == "owendo"
    near = port_proche(8.79, -0.71)
    assert near is not None and near[0].id == "port-gentil"
    assert port_proche(8.5, -1.5) is None  # large


def test_classify_statut_nav() -> None:
    assert classify_statut_nav(5, 0.0, dans_port=True) == "a_quai"
    assert classify_statut_nav(1, 0.1, dans_port=False) == "au_mouillage"
    assert classify_statut_nav(7, 3.2, dans_port=False) == "en_peche"
    assert classify_statut_nav(None, 0.2, dans_port=True) == "a_quai"
    assert classify_statut_nav(None, 0.2, dans_port=False) == "au_mouillage"
    assert classify_statut_nav(15, 9.0, dans_port=False) == "en_route"
    assert classify_statut_nav(None, None, dans_port=False) == "inconnu"


def test_ship_type_label() -> None:
    assert ship_type_label(30) == "Navire de pêche"
    assert ship_type_label("71") == "Cargo"
    assert ship_type_label(84) == "Pétrolier / chimiquier"
    assert ship_type_label(None) is None


# --------------------------------------------------------------------------- #
# Flotte accumulée
# --------------------------------------------------------------------------- #


def test_fleet_keeps_moored_vessel_between_messages() -> None:
    """Un navire à quai émet toutes les 3 min : il doit rester visible entre deux messages."""
    svc._handle_aisstream_message(
        {
            "MessageType": "PositionReport",
            "MetaData": {
                "MMSI": 626000001,
                "ShipName": "OWENDO STAR",
                "latitude": 0.285,
                "longitude": 9.51,
            },
            "Message": {
                "PositionReport": {
                    "Sog": 0.0,
                    "Cog": 12.0,
                    "NavigationalStatus": 5,
                    "TrueHeading": 90,
                }
            },
        }
    )
    svc._handle_aisstream_message(
        {
            "MessageType": "ShipStaticData",
            "MetaData": {"MMSI": 626000001, "ShipName": "OWENDO STAR"},
            "Message": {
                "ShipStaticData": {
                    "Name": "OWENDO STAR",
                    "Type": 70,
                    "Destination": "GA OWE",
                    "ImoNumber": 9123456,
                    "CallSign": "TRAB",
                    "Dimension": {"A": 100, "B": 20},
                }
            },
        }
    )
    later = datetime.now(UTC) + timedelta(minutes=10)
    svc.fleet.purge(later)
    vessels = svc.fleet.snapshot(later)
    assert len(vessels) == 1
    v = vessels[0]
    assert v.nom == "OWENDO STAR"
    assert v.statut_nav == "a_quai"
    assert v.port_id == "owendo"
    assert v.type_label == "Cargo"
    assert v.destination == "GA OWE"
    assert v.longueur_m == 120
    assert v.age_s >= 600


def test_fleet_purges_moving_vessel_after_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.modules.ais_gabon.fleet.settings.ais_ttl_moving_min", 30)
    svc.fleet.upsert_position(mmsi="1", lon=8.5, lat=0.0, sog_kn=10.0, provider="aisstream")
    svc.fleet.upsert_position(mmsi="2", lon=8.6, lat=0.1, sog_kn=0.0, provider="aisstream")
    svc.fleet.purge(datetime.now(UTC) + timedelta(minutes=45))
    remaining = {v.mmsi for v in svc.fleet.snapshot()}
    assert remaining == {"2"}  # l'immobile est conservé plus longtemps


def test_aisstream_message_outside_waters_ignored() -> None:
    ok = svc._handle_aisstream_message(
        {
            "MessageType": "PositionReport",
            "MetaData": {"MMSI": 1, "latitude": -0.7, "longitude": 10.0},
            "Message": {"PositionReport": {"Sog": 1.0}},
        }
    )
    assert ok is False
    assert len(svc.fleet) == 0


# --------------------------------------------------------------------------- #
# API /ais/live
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ais_live_filters_waters_and_reports_ports(
    client: AsyncClient, agent_headers: dict
) -> None:
    fake_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [8.5, 0.0]},
            "properties": {"mmsi": "123456789", "name": "MV GABON TEST", "sog": 9.2},
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [8.79, -0.715]},
            "properties": {"mmsi": "626000777", "name": "PG QUAI", "sog": 0.0, "ship_type": 30},
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [10.2, -0.5]},
            "properties": {"mmsi": "111", "name": "INLAND REJECT"},
        },
    ]
    parsed = [v for f in fake_features if (v := svc._parse_openwaters_feature(f))]
    assert {v.mmsi for v in parsed} == {"123456789", "626000777"}

    with (
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_rest",
            new=AsyncMock(return_value=parsed),
        ),
        patch("app.modules.ais_gabon.service.save_snapshot"),
    ):
        resp = await client.get("/api/v1/ais/live?refresh=true", headers=agent_headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["enabled"] is True
    assert body["eez_filter"] is True
    by_mmsi = {v["mmsi"]: v for v in body["vessels"]}
    assert set(by_mmsi) == {"123456789", "626000777"}
    pg = by_mmsi["626000777"]
    assert pg["port_id"] == "port-gentil"
    assert pg["statut_nav"] == "a_quai"
    assert pg["type_label"] == "Navire de pêche"
    ports = {p["id"]: p for p in body["ports"]}
    assert ports["port-gentil"]["navires"] == 1
    assert ports["port-gentil"]["a_quai"] == 1
    assert ports["owendo"]["navires"] == 0
    assert body["stream"]["provider"] == "aisstream"


@pytest.mark.asyncio
async def test_ais_ports_endpoint(client: AsyncClient, agent_headers: dict) -> None:
    svc.fleet.upsert_position(
        mmsi="626000001", lon=9.51, lat=0.285, sog_kn=0.0, nav_code=5, provider="local:owendo"
    )
    with _no_external()[0], _no_external()[1]:
        resp = await client.get("/api/v1/ais/ports", headers=agent_headers)
    assert resp.status_code == 200, resp.text
    ports = {p["id"]: p for p in resp.json()["ports"]}
    assert ports["owendo"]["navires"] == 1
    assert ports["owendo"]["vessels"][0]["mmsi"] == "626000001"


@pytest.mark.asyncio
async def test_ais_live_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/ais/live")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_cache_demo_when_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_demo_when_empty", True)
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.aisstream_api_key", None)
    with _no_external()[0], _no_external()[1]:
        out = await refresh_ais_cache(force=True)
    assert out.enabled
    assert out.vessels and all(v.demo for v in out.vessels)
    assert all(point_in_gabon_waters(*v.position.coordinates) for v in out.vessels)


@pytest.mark.asyncio
async def test_refresh_empty_without_demo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.aisstream_api_key", None)
    with _no_external()[0], _no_external()[1]:
        out = await refresh_ais_cache(force=True)
    assert out.enabled
    assert out.vessels == []
    assert "AISSTREAM_API_KEY" in out.note
    assert "récepteur AIS local" in out.note


# --------------------------------------------------------------------------- #
# Ingestion récepteur local
# --------------------------------------------------------------------------- #


def test_normalize_aiscatcher_position_and_static() -> None:
    pos = normalize_aiscatcher(
        {
            "class": "AIS",
            "type": 1,
            "mmsi": 626001234,
            "lat": 0.284,
            "lon": 9.509,
            "speed": 0.1,
            "course": 231.0,
            "heading": 511,
            "status": 5,
            "rxtime": "20260920101500",
        }
    )
    assert pos and pos["kind"] == "position"
    assert pos["nav_code"] == 5 and pos["sog_kn"] == 0.1
    assert pos["horodatage"].year == 2026

    st = normalize_aiscatcher(
        {
            "type": 5,
            "mmsi": 626001234,
            "shipname": "ESTUAIRE@@",
            "shiptype": 30,
            "to_bow": 12,
            "to_stern": 4,
        }
    )
    assert st and st["kind"] == "static"
    assert st["ship_type"] == 30 and st["longueur_m"] == 16

    assert normalize_aiscatcher({"type": 1, "mmsi": 1, "lat": 91, "lon": 181}) is None


def test_normalize_nmea_decodes_position() -> None:
    # Trame de position type 1 (exemple public de la norme, MMSI 227006760)
    msgs, errors = normalize_nmea(["!AIVDM,1,1,,A,13HOI:0P0000VOHLCnHQKwvL05Ip,0*23"])
    assert errors == 0
    assert len(msgs) == 1
    assert msgs[0]["kind"] == "position"
    assert msgs[0]["mmsi"] == "227006760"


@pytest.mark.asyncio
async def test_ingest_requires_key_and_updates_fleet(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.modules.ais_gabon.router.settings.ais_ingest_key", "secret-owendo")
    payload = {
        "recepteur": "owendo-quai-1",
        "messages": [
            {"type": 1, "mmsi": 626009999, "lat": 0.286, "lon": 9.507, "speed": 0.0, "status": 5},
            {"type": 5, "mmsi": 626009999, "shipname": "KOMO", "shiptype": 30},
            {"type": 1, "mmsi": 1, "lat": 48.0, "lon": -4.0, "speed": 3.0},
        ],
    }
    resp = await client.post("/api/v1/ais/ingest", json=payload)
    assert resp.status_code == 401
    resp = await client.post(
        "/api/v1/ais/ingest", json=payload, headers={"X-AIS-Ingest-Key": "secret-owendo"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["integres"] == 2 and body["hors_zone"] == 1 and body["flotte"] == 1

    vessels = svc.fleet.snapshot()
    assert vessels[0].nom == "KOMO"
    assert vessels[0].port_id == "owendo"
    assert vessels[0].provider == "local:owendo-quai-1"
    assert svc.fleet.active_receivers() == 1


@pytest.mark.asyncio
async def test_ingest_disabled_without_key(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.modules.ais_gabon.router.settings.ais_ingest_key", None)
    resp = await client.post(
        "/api/v1/ais/ingest", json={"nmea": ["x"]}, headers={"X-AIS-Ingest-Key": "x"}
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_ingest_payload_valid_dict_model() -> None:
    p = AisIngestPayload(recepteur="pg-1", nmea=["!AIVDM,1,1,,A,13HOI:0P0000VOHLCnHQKwvL05Ip,0*23"])
    out = svc.ingest_local(p)
    assert out.recus == 1
    # position hors eaux gabonaises (exemple européen) → hors_zone
    assert out.hors_zone == 1 and out.integres == 0
