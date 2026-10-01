"""§5.1 : équipements utilisés et longueur transmis de la demande à l'embarcation."""

from __future__ import annotations

import json
import uuid

import pytest
from httpx import AsyncClient

EQUIPEMENTS = {
    "engins": ["filet", "ligne"],
    "moteur": "hors-bord 15 ch",
    "securite": ["gilets", "gps"],
}


@pytest.mark.asyncio
async def test_equipements_demande_vers_embarcation(
    client: AsyncClient, agent_headers: dict
) -> None:
    suffix = uuid.uuid4().hex[:8]
    created = await client.post(
        "/api/v1/demandes-licence/with-files",
        data={
            "type_demande": "personne_physique",
            "nom": "Equipe",
            "prenom": f"Test{suffix}",
            "telephone": "077123456",
            "embarcation_nom": f"Pirogue EQ {suffix}",
            "embarcation_type": "pirogue",
            "embarcation_longueur": "7.5",
            "embarcation_equipements": json.dumps(EQUIPEMENTS),
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["embarcation_longueur"] == 7.5
    assert body["embarcation_equipements"] == EQUIPEMENTS

    approved = await client.post(
        f"/api/v1/demandes-licence/{body['id']}/approve",
        headers=agent_headers,
        json={"mot_de_passe": "TempPass123!", "creer_embarcation": True},
    )
    assert approved.status_code == 200, approved.text
    pecheur_id = approved.json()["pecheur_id"]

    boats = await client.get(
        "/api/v1/embarcations", headers=agent_headers, params={"pecheur_id": pecheur_id}
    )
    assert boats.status_code == 200, boats.text
    assert len(boats.json()) == 1
    emb = boats.json()[0]
    assert emb["longueur"] == 7.5
    assert emb["equipements"] == EQUIPEMENTS


@pytest.mark.asyncio
async def test_equipements_json_invalide_refuse(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/demandes-licence/with-files",
        data={
            "type_demande": "personne_physique",
            "nom": "Equipe",
            "prenom": "Invalide",
            "telephone": "077123456",
            "embarcation_equipements": "[1, 2]",
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["code"] == "EQUIPEMENTS_INVALIDES"
