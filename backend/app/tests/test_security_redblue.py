"""Tests défensifs — cycle sécurité red/blue (webhooks, garde production, IDOR)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.enums import RoleUtilisateur, StatutPecheur
from app.db.models import Pecheur, Utilisateur
from app.core.rate_limit import fo_limiter, login_limiter
from app.main import assert_live_payment_security, assert_production_security, app as fastapi_app
from app.modules.geolocalisation.schemas import POSITION_BATCH_MAX


def test_production_refuse_jwt_secret_defaut() -> None:
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        assert_production_security(
            "production",
            "change-me-in-production-use-openssl-rand-hex-32",
            "https://cbm-pigap-web.vercel.app",
        )


def test_production_refuse_cors_joker() -> None:
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        assert_production_security("production", "secret-fort-assez-long-pour-prod", "*")


def test_production_accepte_config_stricte() -> None:
    assert_production_security(
        "production",
        "secret-fort-assez-long-pour-prod",
        "https://cbm-pigap-web.vercel.app",
    )


def test_developpement_tolere_defauts() -> None:
    assert_production_security(
        "development",
        "change-me-in-production-use-openssl-rand-hex-32",
        "*",
    )


def test_production_refuse_jwt_trop_court() -> None:
    with pytest.raises(RuntimeError, match="trop court"):
        assert_production_security("production", "trop-court", "https://cbm-pigap-web.vercel.app")


def test_live_payment_refuse_sans_secret() -> None:
    with pytest.raises(RuntimeError, match="MOBILE_MONEY_MODE=live"):
        assert_live_payment_security("live", None, None)


def test_live_payment_accepte_secret_ou_jeton() -> None:
    assert_live_payment_security("live", "secret-wh", None)
    assert_live_payment_security("live", None, "jeton-pawa")
    assert_live_payment_security("demo", None, None)


async def _creer_pecheur(engine, tag: str) -> tuple[str, dict[str, str]]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        suffix = uuid.uuid4().hex[:8]
        user = Utilisateur(
            nom=f"{tag} {suffix}",
            role=RoleUtilisateur.pecheur,
            email=f"{tag.lower()}.{suffix}@example.com",
            telephone=f"+2416{uuid.uuid4().int % 10_000_000:07d}",
            mot_de_passe_hash=hash_password("PecheurPass1!"),
        )
        session.add(user)
        await session.flush()
        pecheur = Pecheur(
            utilisateur_id=user.id,
            nom=tag,
            prenom="Test",
            numero_licence=f"LIC-{tag.upper()}-{suffix}",
            statut=StatutPecheur.actif,
        )
        session.add(pecheur)
        await session.commit()
        headers = {
            "Authorization": f"Bearer {create_access_token(subject=user.id, role=user.role.value)}"
        }
        return str(pecheur.id), headers


@pytest.mark.asyncio
async def test_webhook_mm_refuse_sans_secret_en_live(
    client: AsyncClient, engine, admin_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "mobile_money_mode", "live")
    monkeypatch.setattr(settings, "mobile_money_webhook_secret", None)
    pecheur_id, _ = await _creer_pecheur(engine, "WhLive")

    init = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=admin_headers,
        json={
            "code_offre": "b2c_mensuel",
            "pecheur_id": pecheur_id,
            "operateur": "demo",
            "msisdn": "077000222",
            "numero_tiers_autorise": True,
        },
    )
    assert init.status_code == 201, init.text
    ref = init.json()["paiement"]["reference_interne"]

    wh = await client.post(
        "/api/v1/abonnements/webhook/mobile-money",
        json={"reference_interne": ref, "statut": "reussi", "reference_operateur": "X"},
    )
    assert wh.status_code == 503
    assert "WEBHOOK" in wh.json()["detail"].upper() or "configuré" in wh.json()["detail"].lower()


@pytest.mark.asyncio
async def test_webhook_mm_exige_secret_si_configure(
    client: AsyncClient, engine, admin_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "mobile_money_mode", "demo")
    monkeypatch.setattr(settings, "mobile_money_webhook_secret", "secret-test-mm")
    pecheur_id, _ = await _creer_pecheur(engine, "WhSec")

    init = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=admin_headers,
        json={"code_offre": "b2c_mensuel", "pecheur_id": pecheur_id},
    )
    assert init.status_code == 201, init.text
    ref = init.json()["paiement"]["reference_interne"]

    refuse = await client.post(
        "/api/v1/abonnements/webhook/mobile-money",
        json={"reference_interne": ref, "statut": "reussi"},
    )
    assert refuse.status_code == 401

    ok = await client.post(
        "/api/v1/abonnements/webhook/mobile-money",
        json={
            "reference_interne": ref,
            "statut": "reussi",
            "secret": "secret-test-mm",
            "reference_operateur": "AIRTEL-OK",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["statut"] == "reussi"
    assert ok.json()["ok"] is True
    assert "msisdn" not in ok.json()


@pytest.mark.asyncio
async def test_webhook_pawapay_refuse_sans_bearer_en_live(
    client: AsyncClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "mobile_money_mode", "live")
    monkeypatch.setattr(settings, "pawapay_api_token", "jeton-pawa")
    monkeypatch.setattr(settings, "mobile_money_webhook_secret", None)

    wh = await client.post(
        "/api/v1/abonnements/webhook/pawapay/deposits",
        json={"depositId": str(uuid.uuid4()), "status": "COMPLETED"},
    )
    assert wh.status_code == 401


@pytest.mark.asyncio
async def test_webhook_pawapay_exige_bearer_si_jeton_meme_en_demo(
    client: AsyncClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "mobile_money_mode", "demo")
    monkeypatch.setattr(settings, "pawapay_api_token", "jeton-demo")
    monkeypatch.setattr(settings, "mobile_money_webhook_secret", None)

    wh = await client.post(
        "/api/v1/abonnements/webhook/pawapay/deposits",
        json={"depositId": str(uuid.uuid4()), "status": "COMPLETED"},
    )
    assert wh.status_code == 401


def test_docs_ouverts_hors_production() -> None:
    """Hors production : /docs actif. En production l'usine passe docs_url=None."""
    from app.core import config as cfg

    if cfg.settings.app_env == "production":
        assert fastapi_app.docs_url is None
        assert fastapi_app.openapi_url is None
    else:
        assert fastapi_app.docs_url == "/docs"


@pytest.mark.asyncio
async def test_chercheur_ne_peut_pas_ecrire_gps(
    client: AsyncClient, engine
) -> None:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        user = Utilisateur(
            nom="Chercheur Test",
            role=RoleUtilisateur.chercheur,
            email=f"chercheur.{uuid.uuid4().hex[:8]}@example.com",
            mot_de_passe_hash=hash_password("PecheurPass1!"),
        )
        session.add(user)
        await session.commit()
        headers = {
            "Authorization": f"Bearer {create_access_token(subject=user.id, role=user.role.value)}"
        }
    r = await client.post(
        "/api/v1/positions",
        headers=headers,
        json={
            "embarcation_id": str(uuid.uuid4()),
            "position": {"type": "Point", "coordinates": [9.45, 0.42]},
            "horodatage": "2020-06-01T12:00:00Z",
            "source": "mobile",
        },
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_fo_demande_licence_rate_limit(client: AsyncClient) -> None:
    fo_limiter.reset()
    fo_limiter.max_calls = 2
    try:
        corps = {
            "type_demande": "personne_physique",
            "nom": "Test",
            "prenom": "FO",
            "telephone": "077000001",
        }
        for _ in range(2):
            r = await client.post("/api/v1/demandes-licence", json=corps)
            assert r.status_code == 201, r.text
        blocked = await client.post("/api/v1/demandes-licence", json=corps)
        assert blocked.status_code == 429
    finally:
        fo_limiter.max_calls = 30
        fo_limiter.reset()


@pytest.mark.asyncio
async def test_batch_gps_refuse_au_dela_du_plafond(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    """H4 : un batch trop gros est rejeté avant traitement (422)."""
    emb_id = str(uuid.uuid4())
    point = {"type": "Point", "coordinates": [9.45, 0.42]}
    trop = [
        {
            "embarcation_id": emb_id,
            "position": point,
            "horodatage": f"2020-01-01T00:{i // 60:02d}:{i % 60:02d}Z",
            "source": "mobile",
        }
        for i in range(POSITION_BATCH_MAX + 1)
    ]
    r = await client.post(
        "/api/v1/positions/batch",
        headers=admin_headers,
        json={"positions": trop},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_login_rate_limit(client: AsyncClient) -> None:
    login_limiter.reset()
    # Forcer un plafond bas pour le test sans ralentir la suite.
    login_limiter.max_calls = 3
    try:
        for _ in range(3):
            r = await client.post(
                "/api/v1/auth/login",
                json={"email": "rate.limit@example.com", "mot_de_passe": "mauvais"},
            )
            assert r.status_code in (400, 401, 404)
        blocked = await client.post(
            "/api/v1/auth/login",
            json={"email": "rate.limit@example.com", "mot_de_passe": "mauvais"},
        )
        assert blocked.status_code == 429
    finally:
        login_limiter.max_calls = 20
        login_limiter.reset()


@pytest.mark.asyncio
async def test_confirmer_demo_refuse_paiement_tiers(
    client: AsyncClient, engine, admin_headers: dict[str, str]
) -> None:
    """IDOR : un pêcheur ne peut pas confirmer le paiement d'un autre."""
    pecheur_a_id, headers_a = await _creer_pecheur(engine, "idorA")
    _, headers_b = await _creer_pecheur(engine, "idorB")

    init = await client.post(
        "/api/v1/abonnements/initier-b2c",
        headers=admin_headers,
        json={"code_offre": "b2c_mensuel", "pecheur_id": pecheur_a_id},
    )
    assert init.status_code == 201, init.text
    paiement_id = init.json()["paiement"]["id"]

    refuse = await client.post(
        f"/api/v1/abonnements/paiements/{paiement_id}/confirmer-demo",
        headers=headers_b,
        json={},
    )
    assert refuse.status_code == 404

    ok = await client.post(
        f"/api/v1/abonnements/paiements/{paiement_id}/confirmer-demo",
        headers=headers_a,
        json={},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["abonnement"]["statut"] == "actif"
