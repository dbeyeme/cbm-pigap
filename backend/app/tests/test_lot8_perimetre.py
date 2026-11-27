"""Lot 8 : périmètre de suivi multi-zones (ADR-015). Données fictives."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from httpx import AsyncClient

from app.db.enums import RoleUtilisateur
from app.tests.aides import creer_compte, creer_embarcation, creer_pecheur, inserer_positions

BASE = "/api/v1/perimetre"
# Points en eau (estuaire / large), fictifs
LON_LIBREVILLE = 9.40
LAT_LIBREVILLE = 0.38
LON_LARGE = 8.30
LAT_LARGE = -2.60


@pytest.mark.asyncio
async def test_l8_liste_six_defauts_actifs(client: AsyncClient, agent_headers: dict) -> None:
    resp = await client.get(BASE, headers=agent_headers)
    assert resp.status_code == 200, resp.text
    zones = resp.json()
    assert len(zones) == 6
    codes = {z["code"] for z in zones}
    assert codes == {
        "gabon",
        "estuaire",
        "libreville",
        "owendo",
        "akanda",
        "cap_esterias",
    }
    assert all(z["actif"] is True for z in zones)


@pytest.mark.asyncio
async def test_l8_seul_admin_patch(client: AsyncClient, agent_headers: dict, engine) -> None:
    liste = await client.get(BASE, headers=agent_headers)
    zone_id = next(z["id"] for z in liste.json() if z["code"] == "libreville")
    refus = await client.patch(f"{BASE}/{zone_id}", headers=agent_headers, json={"actif": False})
    assert refus.status_code == 403
    _, admin_headers = await creer_compte(engine, RoleUtilisateur.admin)
    ok = await client.patch(
        f"{BASE}/{zone_id}", headers=admin_headers, json={"actif": False}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["actif"] is False
    # Restaurer pour les autres tests de la session
    await client.patch(f"{BASE}/{zone_id}", headers=admin_headers, json={"actif": True})


@pytest.mark.asyncio
async def test_l8_alembic_head() -> None:
    racine = Path(__file__).resolve().parents[2]
    cfg = Config(str(racine / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    assert script.get_heads() == ["a1b2c3d4e580"]
    assert script.get_revision("a1b2c3d4e580").down_revision == "f5b8c9d0e371"
    assert script.get_revision("f5b8c9d0e371").down_revision == "e4a7b8c9d260"


async def _desactiver_sauf(
    client: AsyncClient, admin_headers: dict, *, garder: str
) -> list[str]:
    liste = await client.get(f"{BASE}", headers=admin_headers)
    assert liste.status_code == 200
    desactivees: list[str] = []
    for z in liste.json():
        actif = z["code"] == garder
        if z["actif"] != actif:
            p = await client.patch(
                f"{BASE}/{z['id']}",
                headers=admin_headers,
                json={"actif": actif},
            )
            assert p.status_code == 200, p.text
        if not actif:
            desactivees.append(z["code"])
    return desactivees


async def _tout_activer(client: AsyncClient, admin_headers: dict) -> None:
    liste = await client.get(BASE, headers=admin_headers)
    for z in liste.json():
        if not z["actif"]:
            p = await client.patch(
                f"{BASE}/{z['id']}", headers=admin_headers, json={"actif": True}
            )
            assert p.status_code == 200


@pytest.mark.asyncio
async def test_l8_filtre_geo_perimetre_libreville_seul(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    tag = f"L8{uuid.uuid4().hex[:6]}"
    pecheur = await creer_pecheur(client, agent_headers, tag=tag)
    emb_a = await creer_embarcation(client, agent_headers, pecheur["id"], tag=f"{tag}A")
    emb_b = await creer_embarcation(client, agent_headers, pecheur["id"], tag=f"{tag}B")
    maintenant = datetime.now(UTC)
    await inserer_positions(
        engine,
        emb_a["id"],
        [(maintenant - timedelta(minutes=5), LON_LIBREVILLE, LAT_LIBREVILLE)],
    )
    await inserer_positions(
        engine,
        emb_b["id"],
        [(maintenant - timedelta(minutes=5), LON_LARGE, LAT_LARGE)],
    )

    live_avant = await client.get(
        "/api/v1/positions/live",
        headers=agent_headers,
        params={"since_minutes": 120},
    )
    assert live_avant.status_code == 200
    ids_avant = {v["embarcation_id"] for v in live_avant.json()}
    assert emb_a["id"] in ids_avant
    assert emb_b["id"] in ids_avant

    _, admin_headers = await creer_compte(engine, RoleUtilisateur.admin)
    try:
        await _desactiver_sauf(client, admin_headers, garder="libreville")

        live_filtre = await client.get(
            "/api/v1/positions/live",
            headers=agent_headers,
            params={"since_minutes": 120},
        )
        assert live_filtre.status_code == 200
        ids_filtre = {v["embarcation_id"] for v in live_filtre.json()}
        assert emb_a["id"] in ids_filtre
        assert emb_b["id"] not in ids_filtre

        zones = await client.get(BASE, headers=agent_headers)
        lib_id = next(z["id"] for z in zones.json() if z["code"] == "libreville")
        off = await client.patch(
            f"{BASE}/{lib_id}", headers=admin_headers, json={"actif": False}
        )
        assert off.status_code == 200
        live_vide = await client.get(
            "/api/v1/positions/live",
            headers=agent_headers,
            params={"since_minutes": 120},
        )
        assert live_vide.status_code == 200
        assert live_vide.json() == []

        on = await client.patch(
            f"{BASE}/{lib_id}", headers=admin_headers, json={"actif": True}
        )
        assert on.status_code == 200
        live_retabli = await client.get(
            "/api/v1/positions/live",
            headers=agent_headers,
            params={"since_minutes": 120},
        )
        assert live_retabli.status_code == 200
        ids_retabli = {v["embarcation_id"] for v in live_retabli.json()}
        assert emb_a["id"] in ids_retabli
    finally:
        await _tout_activer(client, admin_headers)