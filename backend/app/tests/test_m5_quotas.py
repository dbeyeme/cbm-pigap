"""Tests d'acceptation M5 — §5.5 quotas + alerte à 90 %."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient


async def _create_pecheur_embarcation(
    client: AsyncClient, headers: dict
) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Ndong",
            "prenom": "Amina",
            "numero_licence": f"LIC-M5-{suffix}",
            "email": f"amina.m5.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    pecheur_id = pecheur.json()["id"]
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur_id,
            "nom": "Pirogue M5",
            "immatriculation": f"GA-M5-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pecheur_id, emb.json()["id"]


def _unique_window() -> tuple[str, str, str]:
    """Fenêtre de dates unique pour éviter la pollution entre tests (DB partagée)."""
    offset = uuid.uuid4().int % 8000
    day = date(2040, 1, 1) + timedelta(days=offset)
    iso = day.isoformat()
    return iso, iso, datetime(day.year, day.month, day.day, 12, 0, tzinfo=UTC).isoformat()


@pytest.mark.asyncio
async def test_create_quota_and_list(client: AsyncClient, agent_headers: dict) -> None:
    debut, fin, _ = _unique_window()
    created = await client.post(
        "/api/v1/quotas",
        headers=agent_headers,
        json={
            "espece": "capitaine",
            "zone_id": None,
            "periode_debut": debut,
            "periode_fin": fin,
            "volume_autorise_kg": 100.0,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["espece"] == "capitaine"
    assert body["volume_autorise_kg"] == 100.0
    assert body["volume_consomme_kg"] == 0.0
    assert body["taux_consommation"] == 0.0

    listed = await client.get("/api/v1/quotas", headers=agent_headers)
    assert listed.status_code == 200
    assert body["id"] in [q["id"] for q in listed.json()]


@pytest.mark.asyncio
async def test_acceptation_alerte_90_pct_apres_captures(
    client: AsyncClient, agent_headers: dict
) -> None:
    """§5.5 : série de captures → ≥90 % → alerte visible (GET /quotas/alertes)."""
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    debut, fin, capture_at = _unique_window()

    quota = await client.post(
        "/api/v1/quotas",
        headers=agent_headers,
        json={
            "espece": "crevette",
            "periode_debut": debut,
            "periode_fin": fin,
            "volume_autorise_kg": 100.0,
        },
    )
    assert quota.status_code == 201, quota.text
    quota_id = quota.json()["id"]
    assert quota.json()["volume_consomme_kg"] == 0.0

    # 50 + 40 = 90 kg → 90 %
    for kg in (50.0, 40.0):
        cap = await client.post(
            "/api/v1/captures",
            headers=agent_headers,
            json={
                "pecheur_id": pecheur_id,
                "embarcation_id": emb_id,
                "espece": "crevette",
                "quantite_kg": kg,
                "methode": "filet",
                "point_debarquement": "Owendo",
                "date_capture": capture_at,
            },
        )
        assert cap.status_code == 201, cap.text

    refreshed = await client.get(f"/api/v1/quotas/{quota_id}", headers=agent_headers)
    assert refreshed.status_code == 200
    q = refreshed.json()
    assert q["volume_consomme_kg"] == 90.0
    assert q["taux_consommation"] >= 0.9

    alertes = await client.get("/api/v1/quotas/alertes", headers=agent_headers)
    assert alertes.status_code == 200, alertes.text
    rows = alertes.json()
    match = [
        a
        for a in rows
        if a["type"] == "depassement_quota"
        and a["declencheur"].get("quota_id") == quota_id
        and float(a["declencheur"].get("seuil", 0)) == 0.9
    ]
    assert match, f"Alerte 90% absente : {rows}"
    assert match[0]["declencheur"].get("regle") == "quota_seuil"
    assert match[0]["niveau_gravite"] == "attention"


@pytest.mark.asyncio
async def test_alerte_100_pct_et_pas_de_doublon_90(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur_id, emb_id = await _create_pecheur_embarcation(client, agent_headers)
    debut, fin, capture_at = _unique_window()
    quota = await client.post(
        "/api/v1/quotas",
        headers=agent_headers,
        json={
            "espece": "thon",
            "periode_debut": debut,
            "periode_fin": fin,
            "volume_autorise_kg": 50.0,
        },
    )
    assert quota.status_code == 201, quota.text
    quota_id = quota.json()["id"]

    # Un seul lot qui dépasse 100 %
    cap = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur_id,
            "embarcation_id": emb_id,
            "espece": "thon",
            "quantite_kg": 55.0,
            "methode": "ligne",
            "point_debarquement": "Port-Gentil",
            "date_capture": capture_at,
        },
    )
    assert cap.status_code == 201, cap.text

    alertes = await client.get("/api/v1/quotas/alertes", headers=agent_headers)
    rows = [
        a for a in alertes.json() if a["declencheur"].get("quota_id") == quota_id
    ]
    seuils = sorted(float(a["declencheur"]["seuil"]) for a in rows)
    assert 0.9 in seuils
    assert 1.0 in seuils

    # Recapture ne doit pas dupliquer les seuils
    day = date.fromisoformat(debut)
    capture_at2 = datetime(
        day.year, day.month, day.day, 18, 0, tzinfo=UTC
    ).isoformat()
    cap2 = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur_id,
            "embarcation_id": emb_id,
            "espece": "thon",
            "quantite_kg": 5.0,
            "methode": "ligne",
            "point_debarquement": "Port-Gentil",
            "date_capture": capture_at2,
        },
    )
    assert cap2.status_code == 201, cap2.text
    alertes2 = await client.get("/api/v1/quotas/alertes", headers=agent_headers)
    rows2 = [
        a for a in alertes2.json() if a["declencheur"].get("quota_id") == quota_id
    ]
    assert len(rows2) == 2


@pytest.mark.asyncio
async def test_pecheur_ne_gere_pas_quotas(
    client: AsyncClient, agent_headers: dict
) -> None:
    suffix = uuid.uuid4().hex[:8]
    email = f"pecheur.quota.{suffix}@example.com"
    created = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Okou",
            "prenom": "Paul",
            "numero_licence": f"LIC-PQ-{suffix}",
            "email": email,
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert created.status_code == 201, created.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "mot_de_passe": "PecheurPass1!"},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    debut, fin, _ = _unique_window()
    denied = await client.post(
        "/api/v1/quotas",
        headers=headers,
        json={
            "espece": "sardine",
            "periode_debut": debut,
            "periode_fin": fin,
            "volume_autorise_kg": 10.0,
        },
    )
    assert denied.status_code in (401, 403)
