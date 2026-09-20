"""Tests demandes de licence — FO public + traitement BO."""

from __future__ import annotations

from uuid import uuid4


async def test_public_can_submit_demande_physique(client):
    res = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Mba",
            "prenom": "Jean",
            "telephone": "+24106000001",
            "email": f"jean.mba.{uuid4().hex[:8]}@example.ga",
            "zone_activite": "Estuaire",
            "embarcation_nom": "Espoir",
            "embarcation_immatriculation": "GA-ESP-01",
            "embarcation_type": "pirogue",
            "message": "Demande de licence artisanale",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["statut"] == "en_attente"
    assert body["nom"] == "Mba"


async def test_public_can_submit_demande_morale(client):
    res = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_morale",
            "org_nom": "Coopérative Marée Verte",
            "org_type": "cooperative",
            "numero_registre": "RC-LIB-2026-01",
            "org_email": f"contact.{uuid4().hex[:8]}@mareeverte.ga",
            "org_telephone": "+24106000002",
            "org_ville": "Libreville",
            "nom": "Obiang",
            "prenom": "Paul",
            "zone_activite": "Cap Lopez",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["type_demande"] == "personne_morale"


async def test_agent_lists_and_approves_demande(client, agent_headers):
    email = f"marie.nze.{uuid4().hex[:8]}@example.ga"
    created = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Nze",
            "prenom": "Marie",
            "email": email,
            "telephone": f"+24106{uuid4().hex[:6]}",
        },
    )
    assert created.status_code == 201
    demande_id = created.json()["id"]

    listed = await client.get(
        "/api/v1/demandes-licence",
        headers=agent_headers,
    )
    assert listed.status_code == 200
    assert any(d["id"] == demande_id for d in listed.json())

    approved = await client.post(
        f"/api/v1/demandes-licence/{demande_id}/approve",
        headers=agent_headers,
        json={
            "mot_de_passe": "TempPass123!",
            "creer_embarcation": False,
        },
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["statut"] == "approuvee"
    assert body["pecheur_id"]
    # Numéro de licence attribué automatiquement à l'approbation définitive
    assert body["numero_licence_attribue"]
    assert body["numero_licence_attribue"].startswith("GA-PA-")
    assert body["immatriculation_attribuee"] is None


async def test_public_can_submit_with_justificatif(client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    from app.core.config import settings

    settings.upload_dir = str(tmp_path)

    files = {
        "pieces": ("cni.pdf", b"%PDF-1.4 fake", "application/pdf"),
    }
    data = {
        "type_demande": "personne_physique",
        "nom": "Essono",
        "prenom": "Claire",
        "telephone": f"+24106{uuid4().hex[:6]}",
        "type_pieces": "piece_identite",
    }
    res = await client.post("/api/v1/demandes-licence/with-files", data=data, files=files)
    assert res.status_code == 201, res.text
    body = res.json()
    assert len(body["pieces_jointes"]) == 1
    assert body["pieces_jointes"][0]["type_piece"] == "piece_identite"
    assert "chemin" not in body["pieces_jointes"][0]
