"""Le dépôt Mobile Money est initié depuis le numéro enregistré de l'acteur."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


async def _pecheur(client: AsyncClient, headers: dict, telephone: str | None) -> tuple[dict, str]:
    suffix = uuid.uuid4().hex[:8]
    email = f"payeur.{suffix}@example.com"
    body = {
        "nom": f"Payeur-{suffix}",
        "prenom": "Test",
        "email": email,
        "mot_de_passe": "PecheurPass1!",
    }
    if telephone:
        body["telephone"] = telephone
    res = await client.post("/api/v1/pecheurs", headers=headers, json=body)
    assert res.status_code == 201, res.text
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "mot_de_passe": "PecheurPass1!"}
    )
    assert login.status_code == 200, login.text
    return res.json(), login.json()["access_token"]


@pytest.mark.asyncio
async def test_payeur_attendu_et_numero_par_defaut(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur, token = await _pecheur(client, agent_headers, "077 12 34 56")
    me = await client.get(
        "/api/v1/abonnements/payeur", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200, me.text
    assert me.json()["msisdn"] == "24177123456"
    assert me.json()["valide"] is True

    # Le pêcheur initie sans numéro : le dépôt part de son téléphone enregistré
    init = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers={"Authorization": f"Bearer {token}"},
        json={"code_offre": "b2c_mensuel"},
    )
    assert init.status_code == 201, init.text
    assert init.json()["paiement"]["msisdn"] == "24177123456"


@pytest.mark.asyncio
async def test_pecheur_ne_peut_pas_payer_depuis_un_autre_numero(
    client: AsyncClient, agent_headers: dict
) -> None:
    _, token = await _pecheur(client, agent_headers, "+241 66 00 00 01")
    refus = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers={"Authorization": f"Bearer {token}"},
        json={"code_offre": "b2c_mensuel", "msisdn": "077999999"},
    )
    assert refus.status_code == 422, refus.text
    assert "numéro enregistré" in refus.json()["detail"]
    # Le même numéro, écrit autrement, est accepté
    ok = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers={"Authorization": f"Bearer {token}"},
        json={"code_offre": "b2c_mensuel", "msisdn": "066000001"},
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["paiement"]["msisdn"] == "24166000001"


@pytest.mark.asyncio
async def test_agent_payeur_tiers_explicite(client: AsyncClient, agent_headers: dict) -> None:
    pecheur, _ = await _pecheur(client, agent_headers, "077000002")
    sans = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=agent_headers,
        json={"code_offre": "b2c_mensuel", "pecheur_id": pecheur["id"], "msisdn": "074111111"},
    )
    assert sans.status_code == 422, sans.text
    assert "payeur tiers" in sans.json()["detail"]
    avec = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=agent_headers,
        json={
            "code_offre": "b2c_mensuel",
            "pecheur_id": pecheur["id"],
            "msisdn": "074111111",
            "numero_tiers_autorise": True,
        },
    )
    assert avec.status_code == 201, avec.text
    assert avec.json()["paiement"]["msisdn"] == "24174111111"


@pytest.mark.asyncio
async def test_payeur_sans_telephone_signale(client: AsyncClient, agent_headers: dict) -> None:
    pecheur, _ = await _pecheur(client, agent_headers, None)
    res = await client.get(
        f"/api/v1/abonnements/payeur?pecheur_id={pecheur['id']}", headers=agent_headers
    )
    assert res.status_code == 200
    assert res.json()["valide"] is False
    assert "Aucun téléphone" in res.json()["motif"]
