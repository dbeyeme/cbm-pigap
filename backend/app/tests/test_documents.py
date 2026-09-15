"""Tests génération documents — licence, fiche, bilan, rapport."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient


async def _pecheur_boat(client: AsyncClient, headers: dict) -> tuple[dict, str]:
    suffix = uuid.uuid4().hex[:8]
    licence = f"LIC-DOC-{suffix}"
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Obiang",
            "prenom": "Paul",
            "numero_licence": licence,
            "email": f"paul.doc.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
            "telephone": f"+2416{suffix[:7]}",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    body = pecheur.json()
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": body["id"],
            "nom": "Pirogue Espoir",
            "immatriculation": f"GA-DOC-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return body, emb.json()["id"]


def _assert_pdf(response, *needles: str) -> None:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF")
    text = response.content.decode("latin-1", errors="ignore").lower()
    for needle in needles:
        assert needle.lower() in text, f"manque {needle!r} dans le PDF"


@pytest.mark.asyncio
async def test_documents_require_auth(client: AsyncClient) -> None:
    fake = uuid.uuid4()
    assert (await client.get(f"/api/v1/documents/licence/{fake}")).status_code == 401
    assert (await client.get("/api/v1/documents/rapport")).status_code == 401


@pytest.mark.asyncio
async def test_licence_et_fiche_pecheur_pdf(client: AsyncClient, agent_headers: dict) -> None:
    pecheur, _ = await _pecheur_boat(client, agent_headers)
    pid = pecheur["id"]
    licence = pecheur["numero_licence"]

    lic = await client.get(f"/api/v1/documents/licence/{pid}", headers=agent_headers)
    _assert_pdf(lic, licence, "Obiang", "Pirogue Espoir")
    assert "licence-" in lic.headers.get("content-disposition", "")

    fiche = await client.get(f"/api/v1/documents/fiche/pecheur/{pid}", headers=agent_headers)
    _assert_pdf(fiche, licence, "Paul", "enregistrement")


@pytest.mark.asyncio
async def test_fiche_demande_pdf(client: AsyncClient, agent_headers: dict) -> None:
    created = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Nze",
            "prenom": "Marie",
            "telephone": f"+24106{uuid.uuid4().hex[:6]}",
            "email": f"marie.doc.{uuid.uuid4().hex[:8]}@example.ga",
            "zone_activite": "Estuaire",
            "embarcation_nom": "Aurore",
        },
    )
    assert created.status_code == 201, created.text
    demande_id = created.json()["id"]
    res = await client.get(f"/api/v1/documents/fiche/demande/{demande_id}", headers=agent_headers)
    _assert_pdf(res, "Nze", "Marie", "Estuaire", "Aurore")


@pytest.mark.asyncio
async def test_bilan_et_rapport_pdf_csv(client: AsyncClient, agent_headers: dict) -> None:
    pecheur, emb_id = await _pecheur_boat(client, agent_headers)
    day = date(2046, 3, 12)
    capture_at = datetime(day.year, day.month, day.day, 10, 0, tzinfo=UTC).isoformat()
    cap = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur["id"],
            "embarcation_id": emb_id,
            "espece": "capitaine",
            "quantite_kg": 12.5,
            "methode": "ligne",
            "point_debarquement": "Owendo",
            "date_capture": capture_at,
        },
    )
    assert cap.status_code == 201, cap.text

    debut = (datetime(day.year, day.month, day.day, tzinfo=UTC) - timedelta(days=1)).isoformat()
    fin = (datetime(day.year, day.month, day.day, tzinfo=UTC) + timedelta(days=1)).isoformat()

    bilan = await client.get(
        f"/api/v1/documents/bilan/{pecheur['id']}",
        headers=agent_headers,
        params={"debut": debut, "fin": fin},
    )
    _assert_pdf(bilan, pecheur["numero_licence"], "capitaine", "12,50")

    rapport = await client.get(
        "/api/v1/documents/rapport",
        headers=agent_headers,
        params={"debut": debut, "fin": fin, "format": "pdf"},
    )
    _assert_pdf(rapport, "pilotage", "capitaine")

    csv_res = await client.get(
        "/api/v1/documents/rapport",
        headers=agent_headers,
        params={"debut": debut, "fin": fin, "format": "csv"},
    )
    assert csv_res.status_code == 200, csv_res.text
    assert "text/csv" in csv_res.headers["content-type"]
    body = csv_res.content.decode("utf-8-sig")
    assert "pecheurs_actifs" in body
    assert "capitaine" in body


@pytest.mark.asyncio
async def test_licence_unknown_pecheur(client: AsyncClient, agent_headers: dict) -> None:
    res = await client.get(f"/api/v1/documents/licence/{uuid.uuid4()}", headers=agent_headers)
    assert res.status_code == 404
    assert res.json()["code"] == "PECHEUR_NOT_FOUND"
