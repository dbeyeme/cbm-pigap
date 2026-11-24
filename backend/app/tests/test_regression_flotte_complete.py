"""Règle anti-régression : la flotte vue par un rôle de pilotage n'est pas tronquée.

Défaut constaté le 2026-11-24 : `list_embarcations_for_user` limitait la flotte
aux 2 000 premières embarcations par ordre alphabétique. Au-delà, les suivantes
disparaissaient du suivi en direct, de la présence au port et de la fiche (404),
sans message. La base de développement ayant dépassé ce nombre, trois pirogues
de démonstration étaient sorties de la carte.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.tests.aides import creer_embarcation, creer_pecheur


@pytest.mark.asyncio
async def test_regression_flotte_non_tronquee_par_ordre_alphabetique(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Une embarcation dont le nom arrive en fin d'alphabet reste visible et consultable."""
    pecheur = await creer_pecheur(client, agent_headers, tag="FLOTTE")
    derniere = await creer_embarcation(
        client,
        agent_headers,
        pecheur["id"],
        tag="FLOTTE",
        nom=f"zzzz dernière de la flotte {uuid.uuid4().hex[:8]}",
    )

    suivies = await client.get("/api/v1/positions/embarcations", headers=agent_headers)
    assert suivies.status_code == 200, suivies.text
    assert derniere["id"] in {e["id"] for e in suivies.json()}

    fiche = await client.get(
        f"/api/v1/positions/embarcations/{derniere['id']}/fiche", headers=agent_headers
    )
    assert fiche.status_code == 200, fiche.text
    assert fiche.json()["nom"] == derniere["nom"]
