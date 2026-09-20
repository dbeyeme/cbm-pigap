"""Tests PawaPay live (mocks httpx) + normalisation MSISDN."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.enums import RoleUtilisateur, StatutPecheur
from app.db.models import Pecheur, Utilisateur
from app.modules.abonnements.pawapay import normalize_gabon_msisdn


def test_normalize_gabon_msisdn():
    assert normalize_gabon_msisdn("077123456") == "24177123456"
    assert normalize_gabon_msisdn("+241 77 12 34 56") == "24177123456"
    assert normalize_gabon_msisdn("24177123456") == "24177123456"


async def _pecheur_headers(engine) -> tuple[dict[str, str], Pecheur]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        user = Utilisateur(
            nom="Pêcheur Pawa",
            role=RoleUtilisateur.pecheur,
            email=f"pawa-{uuid.uuid4().hex[:8]}@example.com",
            telephone=f"+2416{uuid.uuid4().int % 10_000_000:07d}",
            mot_de_passe_hash=hash_password("PecheurPass123!"),
        )
        session.add(user)
        await session.flush()
        pecheur = Pecheur(
            utilisateur_id=user.id,
            nom="Mba",
            prenom="Pawa",
            numero_licence=f"LIC-PAWA-{uuid.uuid4().hex[:6].upper()}",
            statut=StatutPecheur.actif,
        )
        session.add(pecheur)
        await session.commit()
        await session.refresh(pecheur)
        token = create_access_token(subject=user.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}, pecheur


@pytest.mark.asyncio
async def test_paiement_config_demo(client: AsyncClient):
    r = await client.get("/api/v1/abonnements/paiement-config")
    assert r.status_code == 200
    assert r.json()["mode"] in ("demo", "live")
    assert "msisdn_required" in r.json()


@pytest.mark.asyncio
async def test_initier_live_pawapay_puis_callback(
    client: AsyncClient, engine, monkeypatch
):
    monkeypatch.setattr(settings, "mobile_money_mode", "live")
    monkeypatch.setattr(settings, "pawapay_api_token", "test-token")
    headers, pecheur = await _pecheur_headers(engine)

    async def fake_init(**kwargs):
        return {"depositId": str(kwargs["deposit_id"]), "status": "ACCEPTED"}

    with patch(
        "app.modules.abonnements.pawapay.initiate_deposit",
        new=AsyncMock(side_effect=fake_init),
    ):
        r = await client.post(
            "/api/v1/abonnements/initier-b2c",
            headers=headers,
            json={
                "code_offre": "b2c_mensuel",
                "operateur": "airtel_money",
                "msisdn": "077000111",
            },
        )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["abonnement"]["statut"] == "en_attente_paiement"
    assert body["paiement"]["operateur"] == "airtel_money"
    assert body["paiement"]["msisdn"] == "24177000111"
    paiement_id = body["paiement"]["id"]

    wh = await client.post(
        "/api/v1/abonnements/webhook/pawapay/deposits",
        json={
            "depositId": paiement_id,
            "status": "COMPLETED",
            "amount": "3000.00",
            "currency": "XAF",
            "country": "GAB",
            "providerTransactionId": "AIRTEL-TX-1",
        },
    )
    assert wh.status_code == 200, wh.text
    assert wh.json()["statut"] == "reussi"

    cov = await client.get("/api/v1/abonnements/me", headers=headers)
    assert cov.status_code == 200
    assert cov.json()["couvert"] is True
    assert cov.json()["source_couverture"] == "b2c"


@pytest.mark.asyncio
async def test_synchroniser_paiement_live(client: AsyncClient, engine, monkeypatch):
    monkeypatch.setattr(settings, "mobile_money_mode", "live")
    monkeypatch.setattr(settings, "pawapay_api_token", "test-token")
    headers, _ = await _pecheur_headers(engine)

    with patch(
        "app.modules.abonnements.pawapay.initiate_deposit",
        new=AsyncMock(return_value={"status": "ACCEPTED"}),
    ):
        r = await client.post(
            "/api/v1/abonnements/initier-b2c",
            headers=headers,
            json={"code_offre": "b2c_mensuel", "msisdn": "+24177111222"},
        )
    assert r.status_code == 201
    paiement_id = r.json()["paiement"]["id"]

    with patch(
        "app.modules.abonnements.pawapay.check_deposit",
        new=AsyncMock(
            return_value={
                "status": "FOUND",
                "data": {
                    "depositId": paiement_id,
                    "status": "COMPLETED",
                    "providerTransactionId": "TX-SYNC",
                },
            }
        ),
    ):
        sync = await client.post(
            f"/api/v1/abonnements/paiements/{paiement_id}/synchroniser",
            headers=headers,
        )
    assert sync.status_code == 200, sync.text
    assert sync.json()["abonnement"]["statut"] == "actif"
    assert sync.json()["paiement"]["statut"] == "reussi"


@pytest.mark.asyncio
async def test_live_refuse_sans_msisdn(client: AsyncClient, engine, monkeypatch):
    monkeypatch.setattr(settings, "mobile_money_mode", "live")
    monkeypatch.setattr(settings, "pawapay_api_token", "test-token")
    headers, _ = await _pecheur_headers(engine)
    r = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=headers,
        json={"code_offre": "b2c_mensuel"},
    )
    assert r.status_code == 422
