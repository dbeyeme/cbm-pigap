"""Numérotation automatique — licences et immatriculations à l'approbation."""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.numerotation import (
    code_zone,
    numero_immatriculation_suivant,
    numero_licence_suivant,
    prochaine_sequence,
)


def test_code_zone_from_zone_activite() -> None:
    assert code_zone("Estuaire — Libreville") == "EST"
    assert code_zone("Port-Gentil") == "OGM"
    assert code_zone("Cap Lopez") == "OGM"
    assert code_zone("Mayumba") == "NYA"
    assert code_zone(None) == "EST"
    assert code_zone("Zone inconnue") == "ZON"


@pytest.mark.asyncio
async def test_sequence_is_monotonic_and_isolated_per_key(engine) -> None:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    cle = f"test:{uuid4().hex[:8]}"
    async with factory() as db:
        a = await prochaine_sequence(db, cle)
        b = await prochaine_sequence(db, cle)
        other = await prochaine_sequence(db, cle + ":autre")
        await db.commit()
    assert (a, b, other) == (1, 2, 1)


@pytest.mark.asyncio
async def test_sequence_is_safe_under_concurrency(engine) -> None:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    cle = f"test:conc:{uuid4().hex[:8]}"

    async def one() -> int:
        async with factory() as db:
            v = await prochaine_sequence(db, cle)
            await db.commit()
            return v

    values = await asyncio.gather(*(one() for _ in range(12)))
    assert sorted(values) == list(range(1, 13))


@pytest.mark.asyncio
async def test_formats(engine) -> None:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        lic = await numero_licence_suivant(db, annee=2031)
        imm = await numero_immatriculation_suivant(db, zone="Port-Gentil", annee=2031)
        await db.commit()
    assert lic.startswith("GA-PA-2031-") and len(lic.rsplit("-", 1)[1]) == 5
    assert imm.startswith("GA-OGM-2031-") and len(imm.rsplit("-", 1)[1]) == 4


@pytest.mark.asyncio
async def test_approve_with_boat_assigns_both_identifiers(client, agent_headers) -> None:
    created = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Moussavou",
            "prenom": "Léa",
            "telephone": f"+24106{uuid4().hex[:6]}",
            "zone_activite": "Port-Gentil",
            "embarcation_nom": "Espoir de Lopez",
            "embarcation_type": "pirogue motorisée",
        },
    )
    assert created.status_code == 201, created.text
    demande_id = created.json()["id"]

    approved = await client.post(
        f"/api/v1/demandes-licence/{demande_id}/approve",
        headers=agent_headers,
        json={"mot_de_passe": "TempPass123!", "creer_embarcation": True},
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["numero_licence_attribue"].startswith("GA-PA-")
    assert body["immatriculation_attribuee"].startswith("GA-OGM-")

    pecheur = await client.get(f"/api/v1/pecheurs/{body['pecheur_id']}", headers=agent_headers)
    assert pecheur.status_code == 200
    assert pecheur.json()["numero_licence"] == body["numero_licence_attribue"]
    assert pecheur.json()["date_delivrance_licence"] is not None


@pytest.mark.asyncio
async def test_approve_keeps_manual_number_when_provided(client, agent_headers) -> None:
    created = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Ndong",
            "prenom": "Pierre",
            "telephone": f"+24106{uuid4().hex[:6]}",
        },
    )
    demande_id = created.json()["id"]
    manual = f"PAPIER-{uuid4().hex[:6].upper()}"
    approved = await client.post(
        f"/api/v1/demandes-licence/{demande_id}/approve",
        headers=agent_headers,
        json={"numero_licence": manual, "mot_de_passe": "TempPass123!", "creer_embarcation": False},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["numero_licence_attribue"] == manual


@pytest.mark.asyncio
async def test_create_pecheur_without_number_gets_one(client, agent_headers) -> None:
    res = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Auto",
            "prenom": "Numéro",
            "mot_de_passe": "PecheurPass1!",
            "email": f"auto-{uuid4().hex[:6]}@example.com",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["numero_licence"].startswith("GA-PA-")
