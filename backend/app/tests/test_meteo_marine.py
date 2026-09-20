"""Bulletin météo-marine : classification, croisements, zones, avis, alertes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.modules.meteo_marine import service as svc
from app.modules.meteo_marine.schemas import ConditionsMer
from app.modules.meteo_marine.service import (
    build_conditions,
    build_fleuve,
    etat_mer_douglas,
    evaluer_opportunite,
    evaluer_risque,
)


def _hourly(now: datetime, n: int = 48, **series: list[float] | float) -> dict:
    times = [
        (now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=i)).strftime(
            "%Y-%m-%dT%H:%M"
        )
        for i in range(n)
    ]
    out: dict = {"time": times}
    for k, v in series.items():
        out[k] = list(v) if isinstance(v, list) else [v] * n
    return out


def _marine(now: datetime, houle: float = 0.9, courant_kmh: float = 1.0, sst: float = 26.0) -> dict:
    return {
        "hourly": _hourly(
            now,
            wave_height=houle,
            wave_direction=200.0,
            wave_period=9.0,
            swell_wave_height=houle * 0.9,
            ocean_current_velocity=courant_kmh,
            ocean_current_direction=190.0,
            sea_surface_temperature=sst,
            sea_level_height_msl=[0.1 * ((i % 12) - 6) for i in range(48)],
        )
    }


def _weather(
    now: datetime, vent: float = 10.0, rafales: float = 14.0, pluie: float = 0.0, vis: float = 20000
) -> dict:
    return {
        "hourly": _hourly(
            now,
            wind_speed_10m=vent,
            wind_gusts_10m=rafales,
            wind_direction_10m=180.0,
            precipitation=pluie,
            visibility=vis,
        )
    }


@pytest.fixture(autouse=True)
def _reset():
    svc._cache = None
    svc._cache_at = None
    svc._last_alert_block.clear()
    yield
    svc._cache = None
    svc._cache_at = None


def test_etat_mer_douglas() -> None:
    assert etat_mer_douglas(0.05) == "calme"
    assert etat_mer_douglas(0.9) == "belle"
    assert etat_mer_douglas(2.0) == "peu agitée"
    assert etat_mer_douglas(3.0) == "agitée"
    assert etat_mer_douglas(None) == "inconnu"


def test_conditions_and_risque_calme() -> None:
    now = datetime.now(UTC)
    c = build_conditions(_marine(now), _weather(now), now)
    assert c.etat_mer == "belle"
    assert c.courant_noeuds == pytest.approx(0.54, abs=0.01)
    assert c.maree in ("montante", "descendante", "étale")
    r = evaluer_risque(c)
    assert r.niveau_pirogue == "vert" and r.niveau_navire == "vert"


def test_risque_rouge_houle_et_rafales() -> None:
    now = datetime.now(UTC)
    c = build_conditions(
        _marine(now, houle=2.8, courant_kmh=4.5), _weather(now, vent=25, rafales=34), now
    )
    r = evaluer_risque(c)
    assert r.niveau_pirogue == "rouge"
    assert r.niveau_navire in ("orange", "rouge")
    assert any("Houle" in m for m in r.motifs)
    assert any("Rafales" in m for m in r.motifs)
    assert any("Courant" in m for m in r.motifs)


def test_opportunite_classes() -> None:
    now = datetime.now(UTC)
    calme = build_conditions(_marine(now, sst=26.0), _weather(now), now)
    r = evaluer_risque(calme)
    fav = evaluer_opportunite(
        calme,
        r,
        captures_kg=800,
        sorties=12,
        mediane_kg=300,
        quota_max_taux=0.3,
        especes_pression=[],
        zone_interdite=False,
    )
    assert fav.classe == "favorable" and fav.score >= 65

    surex = evaluer_opportunite(
        calme,
        r,
        captures_kg=800,
        sorties=12,
        mediane_kg=300,
        quota_max_taux=0.95,
        especes_pression=["sardine"],
        zone_interdite=False,
    )
    assert surex.classe == "surexploitee"
    assert "sardine" in surex.motifs[0]

    interdite = evaluer_opportunite(
        calme,
        r,
        captures_kg=0,
        sorties=0,
        mediane_kg=0,
        quota_max_taux=None,
        especes_pression=[],
        zone_interdite=True,
    )
    assert interdite.classe == "danger"

    agite = build_conditions(_marine(now, houle=3.0), _weather(now), now)
    danger = evaluer_opportunite(
        agite,
        evaluer_risque(agite),
        captures_kg=0,
        sorties=0,
        mediane_kg=0,
        quota_max_taux=None,
        especes_pression=[],
        zone_interdite=False,
    )
    assert danger.classe == "danger" and danger.score <= 10


def test_fleuve_crue_et_tendance() -> None:
    ref = {
        "id": "ogooue",
        "nom": "Ogooué à Lambaréné",
        "fleuve": "Ogooué",
        "lon": 10.14,
        "lat": -0.8,
    }
    f = build_fleuve(
        ref,
        {
            "daily": {
                "river_discharge": [1000, 1100, 1200, 1300, 1400, 1500, 1600],
                "river_discharge_max": [1000, 1200, 1400, 1600, 1700, 1800, 1900],
            }
        },
    )
    assert f.tendance == "hausse"
    assert f.niveau == "crue"
    assert "montée" in f.conseil.lower()
    stable = build_fleuve(
        ref, {"daily": {"river_discharge": [1000] * 7, "river_discharge_max": [1010] * 7}}
    )
    assert stable.tendance == "stable" and stable.niveau == "normal"


@pytest.mark.asyncio
async def test_bulletin_zones_avis_endpoints(client: AsyncClient, agent_headers: dict) -> None:
    now = datetime.now(UTC)
    ref = svc.load_referentiel()
    n = len(ref["secteurs"])
    marine = [_marine(now, houle=0.8)] * (n - 1) + [_marine(now, houle=3.2, courant_kmh=5.0)]
    weather = [_weather(now)] * n
    flood = [{"daily": {"river_discharge": [1000] * 7, "river_discharge_max": [1005] * 7}}] * len(
        ref["fleuves"]
    )
    with (
        patch(
            "app.modules.meteo_marine.service.fetch_open_meteo",
            new=AsyncMock(return_value=(marine, weather)),
        ),
        patch("app.modules.meteo_marine.service.fetch_flood", new=AsyncMock(return_value=flood)),
    ):
        resp = await client.get("/api/v1/meteo/bulletin?refresh=true", headers=agent_headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["disponible"] is True
        assert len(body["secteurs"]) == n
        dernier = body["secteurs"][-1]
        assert dernier["risque"]["niveau_pirogue"] == "rouge"
        assert dernier["opportunite"]["classe"] == "danger"
        assert "déconseillée" in body["synthese"]
        assert body["secteurs"][0]["conditions"]["etat_mer"] == "belle"
        assert len(body["fleuves"]) == len(ref["fleuves"])

        zones = await client.get("/api/v1/meteo/zones", headers=agent_headers)
        assert zones.status_code == 200
        zb = zones.json()
        assert len(zb["zones"]) == n
        assert zb["zones"][-1]["classe"] == "danger"
        assert len(zb["zones"][0]["polygone"]) >= 20
        assert "danger" in zb["legende"]

        # Avis pour une position près de Mayumba (dernier secteur, rouge)
        last = ref["secteurs"][-1]
        avis = await client.get(
            f"/api/v1/meteo/avis?lon={last['lon']}&lat={last['lat']}", headers=agent_headers
        )
        assert avis.status_code == 200, avis.text
        ab = avis.json()
        assert ab["niveau"] == "rouge"
        assert ab["secteur"]["id"] == last["id"]
        assert "déconseillée" in ab["message"]


@pytest.mark.asyncio
async def test_alertes_automatiques_secteur_rouge(client: AsyncClient, agent_headers: dict) -> None:
    now = datetime.now(UTC)
    ref = svc.load_referentiel()
    n = len(ref["secteurs"])
    marine = [_marine(now, houle=3.0)] + [_marine(now)] * (n - 1)
    weather = [_weather(now)] * n
    flood = [
        {
            "daily": {
                "river_discharge": [500, 600, 700, 800, 900, 1000, 1100],
                "river_discharge_max": [500, 700, 900, 1100, 1200, 1300, 1400],
            }
        }
    ] + [{"daily": {"river_discharge": [1000] * 7, "river_discharge_max": [1001] * 7}}] * (
        len(ref["fleuves"]) - 1
    )
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.core.config import settings

    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    with (
        patch(
            "app.modules.meteo_marine.service.fetch_open_meteo",
            new=AsyncMock(return_value=(marine, weather)),
        ),
        patch("app.modules.meteo_marine.service.fetch_flood", new=AsyncMock(return_value=flood)),
    ):
        async with factory() as db:
            bulletin = await svc.build_bulletin(db, force=True)
            # Empreinte unique par exécution (base partagée : l'anti-doublon 12 h s'applique)
            import random

            bulletin.genere_a = bulletin.genere_a + timedelta(days=random.randint(400, 400000))
            emises = await svc.emettre_alertes(db, bulletin)
            assert emises >= 2  # un secteur rouge + une crue
            # Idempotent sur le même bloc horaire
            assert await svc.emettre_alertes(db, bulletin) == 0
    await engine.dispose()

    alertes = await client.get("/api/v1/alertes?statut=nouvelle", headers=agent_headers)
    assert alertes.status_code == 200
    regles = {a["declencheur"].get("regle") for a in alertes.json()}
    assert "meteo_marine" in regles
    assert "crue_fleuve" in regles


@pytest.mark.asyncio
async def test_bulletin_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/meteo/bulletin")
    assert resp.status_code == 401


def test_conditions_schema_defaults() -> None:
    c = ConditionsMer(horodatage=datetime.now(UTC))
    assert c.etat_mer == "inconnu"
