"""Tests séries dashboard — somme des buckets = volume M6 (exact)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient


async def _pecheur_boat(client: AsyncClient, headers: dict) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Serie",
            "prenom": "Test",
            "numero_licence": f"LIC-SER-{suffix}",
            "email": f"serie.{suffix}@example.com",
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
            "nom": "Pirogue Serie",
            "immatriculation": f"GA-SER-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pid, emb.json()["id"]


@pytest.mark.asyncio
async def test_series_somme_egale_dashboard(client: AsyncClient, agent_headers: dict) -> None:
    pid, emb = await _pecheur_boat(client, agent_headers)
    year = 2410 + (uuid.uuid4().int % 800)
    d0 = datetime(year, 6, 4, 10, 0, tzinfo=UTC)
    d1 = datetime(year, 6, 11, 10, 0, tzinfo=UTC)
    volumes = (("capitaine", 12.5, d0), ("crevette", 7.5, d1))
    for espece, kg, when in volumes:
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
                "date_capture": when.isoformat(),
            },
        )
        assert res.status_code == 201, res.text

    debut = d0.strftime("%Y-%m-%dT00:00:00Z")
    fin = d1.strftime("%Y-%m-%dT23:59:59Z")
    dash = await client.get(
        "/api/v1/dashboard",
        headers=agent_headers,
        params={"debut": debut, "fin": fin},
    )
    assert dash.status_code == 200, dash.text
    series = await client.get(
        "/api/v1/dashboard/series",
        headers=agent_headers,
        params={"debut": debut, "fin": fin, "grain": "jour"},
    )
    assert series.status_code == 200, series.text
    body = series.json()
    total = sum(p["volume_kg"] for p in body["volume_par_periode"])
    assert total == dash.json()["volume_total_kg"]
    assert total == 20.0
    especes = {r["espece"] for r in body["especes_par_periode"]}
    assert "capitaine" in especes and "crevette" in especes
    assert all(s["saison"] == "saison_seche" for s in body["saisons"])


@pytest.mark.asyncio
async def test_series_grain_semaine_un_seul_bucket(
    client: AsyncClient, agent_headers: dict
) -> None:
    pid, emb = await _pecheur_boat(client, agent_headers)
    nonce = uuid.uuid4().int
    year = 2300 + (nonce % 200)
    week = nonce % 40
    monday = datetime(year, 1, 4, 10, 0, tzinfo=UTC)
    monday = monday - timedelta(days=monday.weekday()) + timedelta(weeks=week)
    tuesday = monday + timedelta(days=1)
    for when, kg in ((monday, 4.0), (tuesday, 6.0)):
        res = await client.post(
            "/api/v1/captures",
            headers=agent_headers,
            json={
                "pecheur_id": pid,
                "embarcation_id": emb,
                "espece": "merou",
                "quantite_kg": kg,
                "methode": "ligne",
                "point_debarquement": "Owendo",
                "date_capture": when.isoformat(),
            },
        )
        assert res.status_code == 201, res.text

    series = await client.get(
        "/api/v1/dashboard/series",
        headers=agent_headers,
        params={
            "debut": monday.strftime("%Y-%m-%dT00:00:00Z"),
            "fin": tuesday.strftime("%Y-%m-%dT23:59:59Z"),
            "grain": "semaine",
        },
    )
    assert series.status_code == 200, series.text
    positive = [p for p in series.json()["volume_par_periode"] if p["volume_kg"] > 0]
    assert len(positive) == 1
    assert positive[0]["volume_kg"] == 10.0


@pytest.mark.asyncio
async def test_series_refuse_pecheur(client: AsyncClient, agent_headers: dict) -> None:
    suffix = uuid.uuid4().hex[:8]
    email = f"pecheur.ser.{suffix}@example.com"
    created = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Test",
            "prenom": "Pecheur",
            "numero_licence": f"LIC-PS-{suffix}",
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
    denied = await client.get("/api/v1/dashboard/series", headers=headers)
    assert denied.status_code in (401, 403)
