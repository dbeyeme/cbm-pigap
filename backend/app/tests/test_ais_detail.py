"""Fiche navire AIS : pavillon, extrapolation de route, approches, régularité."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.modules.ais_gabon import service as svc
from app.modules.ais_gabon.flags import pavillon_from_mmsi
from app.modules.ais_gabon.navigation import dead_reckon, estimated_position, predict_entry
from app.modules.ais_gabon.service import point_in_gabon_waters, point_in_surveillance_zone


@pytest.fixture(autouse=True)
def _reset(monkeypatch: pytest.MonkeyPatch):
    svc.fleet.clear()
    svc._cache_fetched_at = None
    svc._cache_response = None
    svc._snapshot_loaded = True
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_enabled", True)
    monkeypatch.setattr("app.modules.ais_gabon.service.settings.ais_demo_when_empty", False)
    yield
    svc.fleet.clear()


def test_pavillon_from_mmsi() -> None:
    assert pavillon_from_mmsi("626001234") == ("GA", "Gabon")
    assert pavillon_from_mmsi("657123456") == ("NG", "Nigeria")
    assert pavillon_from_mmsi("351000001") == ("PA", "Panama")
    assert pavillon_from_mmsi("228123456") == ("FR", "France")
    assert pavillon_from_mmsi("002275000") == (None, None)  # station côtière
    assert pavillon_from_mmsi("12345") == (None, None)


def test_dead_reckoning_moves_along_course() -> None:
    lon, lat = dead_reckon(8.0, -1.0, 10.0, 90.0, 1.0)  # 10 nœuds cap est pendant 1 h
    assert lat == pytest.approx(-1.0, abs=0.01)
    assert lon == pytest.approx(8.0 + 18.52 / 111.32, abs=0.005)
    est = estimated_position(8.0, -1.0, 10.0, 90.0, age_s=1800)
    assert est is not None and est[0] > 8.0
    assert estimated_position(8.0, -1.0, 0.0, 90.0, age_s=1800) is None


def test_predict_entry_from_nigeria_towards_gabon() -> None:
    """Navire au large du Nigeria, cap sud-sud-est à 12 nœuds → entrée prévue."""
    start = (5.5, 3.0)  # golfe de Guinée, au nord de la ZEE gabonaise
    assert not point_in_gabon_waters(*start)
    assert point_in_surveillance_zone(*start)
    entree = predict_entry(start[0], start[1], 12.0, 150.0, inside=point_in_gabon_waters)
    assert entree is not None
    assert 0 < entree.heures <= 48
    assert point_in_gabon_waters(entree.lon, entree.lat)
    # Même navire cap nord-ouest : ne croise jamais les eaux gabonaises
    assert predict_entry(start[0], start[1], 12.0, 320.0, inside=point_in_gabon_waters) is None
    # Immobile : pas de prévision
    assert predict_entry(start[0], start[1], 0.2, 150.0, inside=point_in_gabon_waters) is None


@pytest.mark.asyncio
async def test_live_lists_approaching_vessels_separately(
    client: AsyncClient, agent_headers: dict
) -> None:
    ok = svc._handle_aisstream_message(
        {
            "MessageType": "PositionReport",
            "MetaData": {
                "MMSI": 657000111,
                "ShipName": "LAGOS TRADER",
                "latitude": 3.0,
                "longitude": 5.5,
            },
            "Message": {"PositionReport": {"Sog": 12.0, "Cog": 150.0, "NavigationalStatus": 0}},
        }
    )
    assert ok is True
    # Navire hors zone de veille (Manche) : ignoré
    assert (
        svc._handle_aisstream_message(
            {
                "MessageType": "PositionReport",
                "MetaData": {"MMSI": 228000111, "latitude": 50.0, "longitude": -1.0},
                "Message": {"PositionReport": {"Sog": 12.0, "Cog": 180.0}},
            }
        )
        is False
    )
    with (
        patch(
            "app.modules.ais_gabon.service.fetch_openwaters_rest",
            new=AsyncMock(return_value=[]),
        ),
        patch("app.modules.ais_gabon.service.save_snapshot"),
    ):
        resp = await client.get("/api/v1/ais/live?refresh=true", headers=agent_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["vessels"] == []  # pas encore dans les eaux gabonaises
    assert len(body["approches"]) == 1
    app = body["approches"][0]
    assert app["mmsi"] == "657000111"
    assert app["pavillon"] == "Nigeria"
    assert app["dans_eaux_gabon"] is False
    assert app["entree_prevue_h"] is not None
    assert app["entree_prevue_position"]["coordinates"][1] < 3.0
    assert "en approche" in body["note"]


@pytest.mark.asyncio
async def test_vessel_detail_identification_regularite_localisation(
    client: AsyncClient, agent_headers: dict
) -> None:
    # Navire de pêche gabonais au large de Port-Gentil, deux positions (trace)
    callsign = f"TR{uuid.uuid4().hex[:4].upper()}"
    for i, (lon, lat) in enumerate([(8.60, -0.80), (8.62, -0.79)]):
        svc._handle_aisstream_message(
            {
                "MessageType": "PositionReport",
                "MetaData": {
                    "MMSI": 626000222,
                    "ShipName": "ESTUAIRE II",
                    "latitude": lat,
                    "longitude": lon,
                    "time_utc": (datetime.now(UTC) - timedelta(minutes=10 - i * 5)).strftime(
                        "%Y-%m-%d %H:%M:%S.%f +0000 UTC"
                    ),
                },
                "Message": {"PositionReport": {"Sog": 4.0, "Cog": 60.0, "NavigationalStatus": 7}},
            }
        )
    svc._handle_aisstream_message(
        {
            "MessageType": "ShipStaticData",
            "MetaData": {"MMSI": 626000222, "ShipName": "ESTUAIRE II"},
            "Message": {
                "ShipStaticData": {
                    "Name": "ESTUAIRE II",
                    "Type": 30,
                    "CallSign": callsign,
                    "Dimension": {"A": 15, "B": 5},
                }
            },
        }
    )

    # Hors registre → à vérifier
    resp = await client.get("/api/v1/ais/vessels/626000222", headers=agent_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["vessel"]["pavillon"] == "Gabon"
    assert body["vessel"]["type_label"] == "Navire de pêche"
    assert body["vessel"]["statut_nav"] == "en_peche"
    assert len(body["track"]) == 2
    assert body["registre"] is None
    # « alerte » possible si une zone interdite de test couvre le point
    assert body["regularite"] in ("a_verifier", "alerte")
    assert any("registre" in m for m in body["motifs"])

    # Inscription au registre PIGAP par immatriculation = indicatif → conforme
    suffix = uuid.uuid4().hex[:6]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Reg",
            "prenom": "Istre",
            "email": f"reg.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    emb = await client.post(
        "/api/v1/embarcations",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": f"Estuaire deux {suffix}",
            "immatriculation": callsign,
            "type": "navire",
        },
    )
    if emb.status_code == 409:  # immatriculation déjà posée par un run précédent
        pass
    else:
        assert emb.status_code == 201, emb.text
    resp = await client.get("/api/v1/ais/vessels/626000222", headers=agent_headers)
    body = resp.json()
    assert body["registre"] is not None
    assert body["registre"]["immatriculation"] == callsign
    assert body["registre"]["numero_licence"]
    assert not any("registre" in m for m in body["motifs"])
    if not body["zones_reglementees"]:
        assert body["regularite"] == "conforme"

    # Navire inconnu → 404
    assert (
        await client.get("/api/v1/ais/vessels/000000000", headers=agent_headers)
    ).status_code == 404
