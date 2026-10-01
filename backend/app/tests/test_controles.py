"""Missions, contrôles, infractions et vérification de licence (QR code)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient


async def _pecheur(client: AsyncClient, headers: dict, **extra) -> dict:
    suffix = uuid.uuid4().hex[:8]
    res = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": f"Controle-{suffix}",
            "prenom": "Test",
            "email": f"ctrl.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
            "nationalite": "nigeria",
            **extra,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


async def _boat(client: AsyncClient, headers: dict, pecheur_id: str) -> dict:
    suffix = uuid.uuid4().hex[:8]
    res = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur_id,
            "nom": f"Pirogue {suffix}",
            "immatriculation": f"L-{suffix}",
            "equipements": {"engins": ["filet_sardine"]},
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_mission_controle_infraction_et_verification(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur = await _pecheur(client, agent_headers)
    boat = await _boat(client, agent_headers, pecheur["id"])

    mission = await client.post(
        "/api/v1/controles/missions",
        headers=agent_headers,
        json={
            "type": "patrouille",
            "date_debut": date.today().isoformat(),
            "zone_libelle": "Estuaire",
        },
    )
    assert mission.status_code == 201, mission.text
    assert mission.json()["code"].startswith("MC-") and mission.json()["statut"] == "planifiee"

    ctrl = await client.post(
        "/api/v1/controles",
        headers=agent_headers,
        json={
            "mission_id": mission.json()["id"],
            "numero_licence": pecheur["numero_licence"],
            "position": {"type": "Point", "coordinates": [9.20, 0.42]},
            "pecheurs_a_bord": 2,
            "engin_trouve": "senne_tournante",
            "infraction": True,
            "categorie_infraction": "engin_prohibe",
            "sanction": "Saisie de l'engin",
        },
    )
    assert ctrl.status_code == 201, ctrl.text
    body = ctrl.json()
    assert body["pecheur_id"] == pecheur["id"] and body["embarcation_id"] == boat["id"]
    assert body["engin_declare"] == "filet_sardine" and body["licence_valide"] is True
    assert body["nationalite_proprietaire"] == "nigeria"
    assert body["position"]["coordinates"] == [9.2, 0.42]

    # Alerte critique tracée et mission passée en cours
    alertes = await client.get(
        "/api/v1/alertes", headers=agent_headers, params={"embarcation_id": boat["id"]}
    )
    found = [a for a in alertes.json() if a["declencheur"].get("regle") == "infraction_constatee"]
    assert len(found) == 1 and found[0]["niveau_gravite"] == "critique"
    missions = await client.get("/api/v1/controles/missions", headers=agent_headers)
    m = next(x for x in missions.json() if x["id"] == mission.json()["id"])
    assert m["statut"] == "en_cours" and m["nb_controles"] == 1 and m["nb_infractions"] == 1

    # Incohérence refusée
    bad = await client.post(
        "/api/v1/controles",
        headers=agent_headers,
        json={"numero_licence": pecheur["numero_licence"], "infraction": True},
    )
    assert bad.status_code == 400 and bad.json()["code"] == "CATEGORIE_REQUISE"

    # Vérification agent
    verif = await client.get(
        "/api/v1/controles/verifier-licence",
        headers=agent_headers,
        params={"numero": pecheur["numero_licence"]},
    )
    assert verif.status_code == 200, verif.text
    v = verif.json()
    assert v["trouvee"] is True and v["statut_licence"] == "sans_date"
    assert v["controles_12_mois"] == 1 and v["infractions_12_mois"] == 1
    assert v["engins_autorises"] == ["filet_sardine"] and v["alertes_nouvelles"] >= 1

    # Vérification publique : validité seule, aucune donnée personnelle
    pub = await client.get(f"/api/v1/public/verif/licence/{pecheur['numero_licence']}")
    assert pub.status_code == 200, pub.text
    assert pub.json()["valide"] is True and "nom" not in pub.json()
    inconnu = await client.get("/api/v1/public/verif/licence/LIC-INCONNUE-XYZ")
    assert inconnu.status_code == 200 and inconnu.json()["valide"] is False


@pytest.mark.asyncio
async def test_licence_expiree_alerte_et_verification(
    client: AsyncClient, agent_headers: dict
) -> None:
    delivree = (date.today() - timedelta(days=400)).isoformat()
    pecheur = await _pecheur(client, agent_headers, date_delivrance_licence=delivree)
    boat = await _boat(client, agent_headers, pecheur["id"])

    pub = await client.get(f"/api/v1/public/verif/licence/{pecheur['numero_licence']}")
    assert pub.json()["valide"] is False and pub.json()["statut"] == "expiree"

    cap = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur["id"],
            "embarcation_id": boat["id"],
            "espece": "sardine",
            "quantite_kg": 5,
            "methode": "filet_sardine",
            "point_debarquement": "Owendo",
            "date_capture": datetime.now(UTC).isoformat(),
        },
    )
    assert cap.status_code == 201, cap.text
    alertes = await client.get(
        "/api/v1/alertes", headers=agent_headers, params={"embarcation_id": boat["id"]}
    )
    regles = [a["declencheur"].get("regle") for a in alertes.json()]
    assert "licence_expiree" in regles

    # Licence PDF avec QR code et validité
    pdf = await client.get(f"/api/v1/documents/licence/{pecheur['id']}", headers=agent_headers)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
