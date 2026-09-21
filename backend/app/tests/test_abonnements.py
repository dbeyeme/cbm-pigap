"""Tests abonnements B2C / B2B + Mobile Money démo."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.enums import RoleUtilisateur, StatutPecheur
from app.db.models import Organisation, Pecheur, Utilisateur


async def _pecheur_headers(engine) -> tuple[dict[str, str], Pecheur]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        user = Utilisateur(
            nom="Pêcheur Test",
            role=RoleUtilisateur.pecheur,
            email=f"pecheur-{uuid.uuid4().hex[:8]}@example.com",
            telephone=f"+2416{uuid.uuid4().int % 10_000_000:07d}",
            mot_de_passe_hash=hash_password("PecheurPass123!"),
        )
        session.add(user)
        await session.flush()
        pecheur = Pecheur(
            utilisateur_id=user.id,
            nom="Mba",
            prenom="Jean",
            numero_licence=f"LIC-ABO-{uuid.uuid4().hex[:6].upper()}",
            statut=StatutPecheur.actif,
        )
        session.add(pecheur)
        await session.commit()
        await session.refresh(pecheur)
        token = create_access_token(subject=user.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}, pecheur


@pytest.mark.asyncio
async def test_catalogue_offres_public(client: AsyncClient):
    r = await client.get("/api/v1/abonnements/offres")
    assert r.status_code == 200
    codes = {o["code"] for o in r.json()}
    assert "b2c_mensuel" in codes
    assert "b2c_annuel" in codes
    assert "b2b_autorite_annuel" in codes
    b2c = next(o for o in r.json() if o["code"] == "b2c_mensuel")
    assert b2c["montant_fcfa"] == 3000


@pytest.mark.asyncio
async def test_initier_et_confirmer_b2c_demo(
    client: AsyncClient, engine, agent_headers: dict[str, str]
):
    _, pecheur = await _pecheur_headers(engine)
    r = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=agent_headers,
        json={
            "code_offre": "b2c_annuel",
            "numero_licence": pecheur.numero_licence,
            "operateur": "demo",
            "msisdn": "077000111",
            # L'agent règle depuis un autre numéro que le titulaire : autorisation explicite
            "numero_tiers_autorise": True,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["abonnement"]["statut"] == "en_attente_paiement"
    assert body["abonnement"]["montant_fcfa"] == 30_000
    paiement_id = body["paiement"]["id"]

    r2 = await client.post(
        f"/api/v1/abonnements/paiements/{paiement_id}/confirmer-demo",
        headers=agent_headers,
        json={},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["abonnement"]["statut"] == "actif"
    assert r2.json()["paiement"]["statut"] == "reussi"

    cov = await client.get(
        f"/api/v1/abonnements/couverture/{pecheur.id}",
        headers=agent_headers,
    )
    assert cov.status_code == 200
    assert cov.json()["couvert"] is True
    assert cov.json()["source_couverture"] == "b2c"


@pytest.mark.asyncio
async def test_b2b_flotte_couvre_pecheur(
    client: AsyncClient, engine, agent_headers: dict[str, str]
):
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        org = Organisation(nom="Coop Test Abonnement", type_organisation="cooperative")
        session.add(org)
        await session.flush()
        user = Utilisateur(
            nom="Pecheur Flotte",
            role=RoleUtilisateur.pecheur,
            email=f"flotte-{uuid.uuid4().hex[:8]}@example.com",
            mot_de_passe_hash=hash_password("x"),
        )
        session.add(user)
        await session.flush()
        pecheur = Pecheur(
            utilisateur_id=user.id,
            nom="Nzé",
            prenom="Paul",
            numero_licence=f"LIC-FLT-{uuid.uuid4().hex[:6].upper()}",
            organisation_id=org.id,
        )
        session.add(pecheur)
        await session.commit()
        await session.refresh(org)
        await session.refresh(pecheur)

    r = await client.post(
        "/api/v1/abonnements/initier-b2b",
        headers=agent_headers,
        json={
            "code_offre": "b2b_flotte_mensuel",
            "organisation_id": str(org.id),
            "embarcations": 15,
            "activer_demo": True,
        },
    )
    assert r.status_code == 201, r.text
    # 150k + 5*12k = 210k
    assert r.json()["abonnement"]["montant_fcfa"] == 210_000
    assert r.json()["abonnement"]["statut"] == "actif"

    cov = await client.get(
        f"/api/v1/abonnements/couverture/{pecheur.id}",
        headers=agent_headers,
    )
    assert cov.status_code == 200
    assert cov.json()["couvert"] is True
    assert cov.json()["source_couverture"] == "b2b_flotte"


@pytest.mark.asyncio
async def test_webhook_active_abonnement(
    client: AsyncClient, engine, agent_headers: dict[str, str]
):
    _, pecheur = await _pecheur_headers(engine)
    r = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=agent_headers,
        json={"code_offre": "b2c_mensuel", "pecheur_id": str(pecheur.id)},
    )
    assert r.status_code == 201
    ref = r.json()["paiement"]["reference_interne"]
    wh = await client.post(
        "/api/v1/abonnements/webhook/mobile-money",
        json={"reference_interne": ref, "statut": "reussi", "reference_operateur": "AIRTEL-1"},
    )
    assert wh.status_code == 200
    assert wh.json()["statut"] == "reussi"


@pytest.mark.asyncio
async def test_enforce_bloque_capture_sans_abo(
    client: AsyncClient, engine, agent_headers: dict[str, str], monkeypatch
):
    monkeypatch.setattr(settings, "abonnement_enforce", True)
    headers, pecheur = await _pecheur_headers(engine)

    # Créer embarcation via agent
    emb = await client.post(
        "/api/v1/embarcations",
        headers=agent_headers,
        json={
            "pecheur_id": str(pecheur.id),
            "nom": "Espoir",
            "immatriculation": f"GA-{uuid.uuid4().hex[:6].upper()}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    emb_id = emb.json()["id"]

    # Position en mer (Cap Lopez approx)
    pos = await client.post(
        "/api/v1/positions",
        headers=headers,
        json={
            "embarcation_id": emb_id,
            "horodatage": "2026-09-15T10:00:00Z",
            "position": {"type": "Point", "coordinates": [8.78, -0.72]},
            "source": "mobile",
        },
    )
    assert pos.status_code == 402, pos.text

    monkeypatch.setattr(settings, "abonnement_enforce", False)
