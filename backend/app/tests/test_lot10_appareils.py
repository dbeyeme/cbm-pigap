"""Lot 10 : un appareil, un seul compte pêcheur (ADR-012). Données fictives.

Un test par ligne du tableau de l'ADR (connexion, envoi de positions), les
tests de périmètre par rôle, la preuve qu'aucun identifiant d'appareil n'est
conservé et celle que la fenêtre d'exclusivité vient du paramétrage.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient, Response
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.regles import charger_regles
from app.db.enums import EtatAppareil, RoleUtilisateur
from app.db.models import Alerte, Appareil, LogAcces, Position
from app.modules.appareils import service as appareils_service
from app.modules.appareils.regles import regle_appareils
from app.tests.aides import (
    MOT_DE_PASSE,
    copier_regles,
    creer_compte,
    creer_embarcation,
    creer_organisation,
    creer_pecheur,
    instant_isole,
)

ENTETE = "X-Appareil-Id"
LARGE = (8.02, -2.02)  # en mer, loin de tout port

REGLE_DE_TEST = {
    "appareils": {
        "fenetre_exclusivite_minutes": 30,
        "appareils_par_defaut": 1,
        "appareils_max": 3,
        "entete_obligatoire": False,
        "comptes_exemptes": [],
    }
}


@pytest.fixture
def regle(tmp_path, monkeypatch):
    """Paramétrage fixé pour le test ; l'appel renvoyé modifie un ou plusieurs paramètres."""
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(tmp_path, "appareils", REGLE_DE_TEST)

    def changer(**appareils) -> None:
        copier_regles(tmp_path, "appareils", {"appareils": appareils})

    return changer


@pytest.fixture
def sans_regles_m7(monkeypatch):
    """Les règles d'alerte du module M7 sont hors sujet ici : elles ne sont pas évaluées,
    pour ne pas semer d'alertes sans rapport dans la base de développement."""

    async def _rien(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr("app.modules.alertes.service.evaluate_after_position", _rien)


def _appareil(origine: str = "android") -> str:
    return f"{origine}:fictif-{uuid.uuid4().hex}"


async def _connecter(client: AsyncClient, email: str, appareil: str | None = None) -> Response:
    return await client.post(
        "/api/v1/auth/login",
        json={"email": email, "mot_de_passe": MOT_DE_PASSE},
        headers={ENTETE: appareil} if appareil else {},
    )


def _session(resp: Response, appareil: str | None = None) -> dict[str, str]:
    assert resp.status_code == 200, resp.text
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    if appareil:
        headers[ENTETE] = appareil
    return headers


def _releve(emb_id: str, quand: datetime, point: tuple[float, float] = LARGE) -> dict:
    return {
        "embarcation_id": emb_id,
        "position": {"type": "Point", "coordinates": list(point)},
        "horodatage": quand.isoformat(),
        "source": "mobile",
    }


async def _envoyer(client: AsyncClient, headers: dict, emb_id: str, quand: datetime) -> Response:
    return await client.post("/api/v1/positions", headers=headers, json=_releve(emb_id, quand))


async def _appareils_du_compte(engine, utilisateur_id: str) -> list[Appareil]:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            select(Appareil)
            .where(Appareil.utilisateur_id == uuid.UUID(utilisateur_id))
            .order_by(Appareil.premiere_utilisation)
        )
        return list(result.scalars().all())


async def _pecheur(client: AsyncClient, agent_headers: dict, **champs) -> tuple[dict, dict]:
    p = await creer_pecheur(client, agent_headers, tag="L10", **champs)
    e = await creer_embarcation(client, agent_headers, p["id"], tag="L10")
    return p, e


async def _classer_alertes(client: AsyncClient, agent_headers: dict, emb_id: str) -> int:
    """Classe « traitée » les alertes fictives du test, pour ne rien laisser à traiter."""
    alertes = (
        await client.get(
            "/api/v1/alertes",
            headers=agent_headers,
            params={"embarcation_id": emb_id, "statut": "nouvelle"},
        )
    ).json()
    for alerte in alertes:
        resp = await client.patch(
            f"/api/v1/alertes/{alerte['id']}", headers=agent_headers, json={"statut": "traitee"}
        )
        assert resp.status_code == 200, resp.text
    return len(alertes)


async def _autoriser(client: AsyncClient, agent_headers: dict, pecheur_id: str) -> Response:
    return await client.post(
        f"/api/v1/pecheurs/{pecheur_id}/appareils/autorisation",
        headers=agent_headers,
        json={"motif": "Arme une seconde embarcation (essai fictif)"},
    )


# --------------------------------------------------------------------------- #
# B. Connexion : les quatre lignes du tableau de l'ADR-012
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l10_b_appareil_inconnu_compte_sans_appareil_rattachement_cree(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    p, _ = await _pecheur(client, agent_headers)
    appareil = _appareil()
    resp = await _connecter(client, p["email"], appareil)
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]
    # Le serveur dit à l'application qu'il a rattaché l'appareil
    assert resp.json()["appareil_rattache"] is True

    (rattache,) = await _appareils_du_compte(engine, p["utilisateur_id"])
    assert rattache.etat == EtatAppareil.actif
    assert rattache.origine == "android"
    assert rattache.empreinte == appareils_service.empreinte(appareil)
    assert rattache.libere_le is None and rattache.motif_liberation is None


@pytest.mark.asyncio
async def test_l10_b_appareil_deja_rattache_a_ce_compte(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    p, _ = await _pecheur(client, agent_headers)
    appareil = _appareil("install")
    assert (await _connecter(client, p["email"], appareil)).status_code == 200
    (premier,) = await _appareils_du_compte(engine, p["utilisateur_id"])

    encore = await _connecter(client, p["email"], appareil)
    assert encore.status_code == 200, encore.text
    assert encore.json()["appareil_rattache"] is True  # appareil reconnu
    (meme,) = await _appareils_du_compte(engine, p["utilisateur_id"])
    assert meme.id == premier.id and meme.origine == "install"
    assert meme.derniere_utilisation >= premier.derniere_utilisation


@pytest.mark.asyncio
async def test_l10_b_appareil_rattache_a_un_autre_compte_refuse(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    titulaire, _ = await _pecheur(client, agent_headers)
    autre, _ = await _pecheur(client, agent_headers)
    appareil = _appareil()
    assert (await _connecter(client, titulaire["email"], appareil)).status_code == 200

    refus = await _connecter(client, autre["email"], appareil)
    assert refus.status_code == 409
    body = refus.json()
    assert body["code"] == "APPAREIL_DEJA_RATTACHE"
    assert "access_token" not in body
    # Le message ne dit jamais à qui l'appareil est rattaché
    for secret in (
        titulaire["email"],
        titulaire["nom"],
        titulaire["numero_licence"],
        titulaire["id"],
        titulaire["utilisateur_id"],
    ):
        assert secret not in refus.text
    assert not body["detail"].startswith("APPAREIL")
    assert await _appareils_du_compte(engine, autre["utilisateur_id"]) == []

    # Le refus laisse une trace au journal des accès, sans identifiant d'appareil
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        traces = (
            (
                await session.execute(
                    select(LogAcces).where(
                        LogAcces.utilisateur_id == uuid.UUID(autre["utilisateur_id"]),
                        LogAcces.ressource == "appareils",
                    )
                )
            )
            .scalars()
            .all()
        )
    assert [t.action for t in traces] == ["connexion_refusee"]
    assert "APPAREIL_DEJA_RATTACHE" in traces[0].detail and appareil not in traces[0].detail

    # Le titulaire, lui, se connecte toujours depuis son appareil
    assert (await _connecter(client, titulaire["email"], appareil)).status_code == 200


@pytest.mark.asyncio
async def test_l10_b_compte_rattache_a_un_autre_appareil_refuse(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    p, _ = await _pecheur(client, agent_headers)
    assert (await _connecter(client, p["email"], _appareil())).status_code == 200

    second = await _connecter(client, p["email"], _appareil())
    assert second.status_code == 409
    assert second.json()["code"] == "COMPTE_RATTACHE_AUTRE_APPAREIL"
    assert "access_token" not in second.json()
    assert len(await _appareils_du_compte(engine, p["utilisateur_id"])) == 1

    # Avec l'autorisation d'un agent, le second appareil est rattaché
    assert (await _autoriser(client, agent_headers, p["id"])).status_code == 200
    autorise = await _connecter(client, p["email"], _appareil())
    assert autorise.status_code == 200, autorise.text
    assert len(await _appareils_du_compte(engine, p["utilisateur_id"])) == 2


@pytest.mark.asyncio
async def test_l10_b_sans_entete_et_autres_roles_inchanges(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Transition : l'ancienne application, sans en-tête, se connecte comme avant (R6 compris)."""
    p, _ = await _pecheur(client, agent_headers)
    sans_entete = await _connecter(client, p["email"])
    assert sans_entete.status_code == 200
    assert sans_entete.json()["appareil_rattache"] is False
    assert await _appareils_du_compte(engine, p["utilisateur_id"]) == []

    # Un agent n'est pas concerné, même s'il envoie l'en-tête, même mal formé
    compte_id, _ = await creer_compte(engine, RoleUtilisateur.agent_controle)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from app.db.models import Utilisateur

        email_agent = (await session.get(Utilisateur, compte_id)).email
    for valeur in (_appareil(), "n'importe quoi"):
        agent = await _connecter(client, email_agent, valeur)
        assert agent.status_code == 200 and agent.json()["appareil_rattache"] is False
    assert await _appareils_du_compte(engine, str(compte_id)) == []

    # Paramètre d'obligation activé : le pêcheur sans en-tête est refusé, pas l'agent
    regle(entete_obligatoire=True)
    refus = await _connecter(client, p["email"])
    assert refus.status_code == 403 and refus.json()["code"] == "APPAREIL_REQUIS"
    assert (await _connecter(client, email_agent)).status_code == 200
    assert (await _connecter(client, p["email"], _appareil())).status_code == 200


@pytest.mark.asyncio
async def test_l10_b_identifiant_mal_forme_ou_mot_de_passe_faux(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    p, _ = await _pecheur(client, agent_headers)
    for valeur in (
        "android:court",
        "ios:" + "a" * 40,
        "android:avec espace " + "a" * 20,
        "x" * 200,
    ):
        resp = await _connecter(client, p["email"], valeur)
        assert resp.status_code == 400, valeur
        assert resp.json()["code"] == "APPAREIL_ID_INVALIDE"
    # Identifiants faux : aucune information sur l'appareil, aucun rattachement
    faux = await client.post(
        "/api/v1/auth/login",
        json={"email": p["email"], "mot_de_passe": "MauvaisMotDePasse1!"},
        headers={ENTETE: _appareil()},
    )
    assert faux.status_code == 400 and faux.json()["code"] == "INVALID_CREDENTIALS"
    assert await _appareils_du_compte(engine, p["utilisateur_id"]) == []


# --------------------------------------------------------------------------- #
# C. Envoi de positions
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l10_c_envoi_depuis_un_appareil_non_rattache_refuse(
    client: AsyncClient, agent_headers: dict, engine, regle, sans_regles_m7
) -> None:
    p, e = await _pecheur(client, agent_headers)
    appareil = _appareil()
    headers = _session(await _connecter(client, p["email"], appareil), appareil)
    t0 = instant_isole()
    assert (await _envoyer(client, headers, e["id"], t0)).status_code == 201

    # Même session, autre appareil : refusé, unitaire et par lot
    intrus = {**headers, ENTETE: _appareil()}
    refus = await _envoyer(client, intrus, e["id"], t0 + timedelta(minutes=5))
    assert refus.status_code == 403
    assert refus.json()["code"] == "APPAREIL_NON_RATTACHE"
    lot = await client.post(
        "/api/v1/positions/batch",
        headers=intrus,
        json={"positions": [_releve(e["id"], t0 + timedelta(minutes=6))]},
    )
    assert lot.status_code == 403 and lot.json()["code"] == "APPAREIL_NON_RATTACHE"

    # L'appareil d'un autre pêcheur ne sert pas davantage, et rien n'est dit de son titulaire
    autre, _ = await _pecheur(client, agent_headers)
    appareil_autre = _appareil()
    assert (await _connecter(client, autre["email"], appareil_autre)).status_code == 200
    emprunt = await _envoyer(
        client, {**headers, ENTETE: appareil_autre}, e["id"], t0 + timedelta(minutes=7)
    )
    assert emprunt.status_code == 403 and emprunt.json()["code"] == "APPAREIL_NON_RATTACHE"
    assert autre["email"] not in emprunt.text and autre["nom"] not in emprunt.text

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        nb = len(
            (
                await session.execute(
                    select(Position.id).where(Position.embarcation_id == uuid.UUID(e["id"]))
                )
            ).all()
        )
    assert nb == 1


@pytest.mark.asyncio
async def test_l10_c_reference_de_l_appareil_sur_chaque_position(
    client: AsyncClient, agent_headers: dict, engine, regle, sans_regles_m7
) -> None:
    p, e = await _pecheur(client, agent_headers)
    appareil = _appareil()
    headers = _session(await _connecter(client, p["email"], appareil), appareil)
    t0 = instant_isole()
    assert (await _envoyer(client, headers, e["id"], t0)).status_code == 201
    lot = await client.post(
        "/api/v1/positions/batch",
        headers=headers,
        json={
            "positions": [
                _releve(e["id"], t0 + timedelta(minutes=5), (8.021, -2.02)),
                _releve(e["id"], t0 + timedelta(minutes=10), (8.022, -2.02)),
            ]
        },
    )
    assert lot.status_code == 201, lot.text
    # Ancienne application : même session, sans en-tête, position acceptée sans référence
    sans_entete = {"Authorization": headers["Authorization"]}
    assert (
        await _envoyer(client, sans_entete, e["id"], t0 + timedelta(minutes=15))
    ).status_code == 201
    # Depuis le correctif de sécurité du 2026-11-27, un agent n'écrit plus de position :
    # refus par rôle, avant tout contrôle d'appareil (R6 sans objet pour lui)
    assert (
        await _envoyer(
            client, {**agent_headers, ENTETE: _appareil()}, e["id"], t0 + timedelta(minutes=20)
        )
    ).status_code == 403

    (rattache,) = await _appareils_du_compte(engine, p["utilisateur_id"])
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        lignes = (
            await session.execute(
                select(Position.appareil_id)
                .where(Position.embarcation_id == uuid.UUID(e["id"]))
                .order_by(Position.horodatage)
            )
        ).all()
    assert [ligne[0] for ligne in lignes] == [rattache.id, rattache.id, rattache.id, None]

    regle(entete_obligatoire=True)
    refus = await _envoyer(client, sans_entete, e["id"], t0 + timedelta(minutes=25))
    assert refus.status_code == 403 and refus.json()["code"] == "APPAREIL_REQUIS"


async def _deux_appareils(
    client: AsyncClient, agent_headers: dict
) -> tuple[dict, dict, dict, dict]:
    """Pêcheur autorisé à deux appareils, tous deux rattachés : (pêcheur, embarcation, a, b)."""
    p, e = await _pecheur(client, agent_headers)
    assert (await _autoriser(client, agent_headers, p["id"])).status_code == 200
    un, deux = _appareil(), _appareil()
    a = _session(await _connecter(client, p["email"], un), un)
    b = _session(await _connecter(client, p["email"], deux), deux)
    return p, e, a, b


@pytest.mark.asyncio
async def test_l10_c_suivi_deja_assure_par_un_autre_appareil_refuse_et_signale(
    client: AsyncClient, agent_headers: dict, engine, regle, sans_regles_m7
) -> None:
    p, e, a, b = await _deux_appareils(client, agent_headers)
    t0 = instant_isole()
    assert (await _envoyer(client, a, e["id"], t0)).status_code == 201

    # Dix minutes plus tard, le second appareil émet pour la même embarcation
    refus = await _envoyer(client, b, e["id"], t0 + timedelta(minutes=10))
    assert refus.status_code == 409
    assert refus.json()["code"] == "SUIVI_DEJA_ASSURE"
    par_lot = await client.post(
        "/api/v1/positions/batch",
        headers=b,
        json={
            "positions": [
                _releve(e["id"], t0 + timedelta(minutes=45)),
                _releve(e["id"], t0 - timedelta(minutes=20)),
            ]
        },
    )
    assert par_lot.status_code == 409  # le second relevé du lot tombe dans la fenêtre

    # Une alerte du type existant, au déclencheur explicite, sans identifiant d'appareil
    appareils = await _appareils_du_compte(engine, p["utilisateur_id"])
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        alertes = (
            (
                await session.execute(
                    select(Alerte).where(Alerte.embarcation_id == uuid.UUID(e["id"]))
                )
            )
            .scalars()
            .all()
        )
        positions = (
            await session.execute(
                select(Position.appareil_id).where(Position.embarcation_id == uuid.UUID(e["id"]))
            )
        ).all()
    assert len(alertes) == 1  # une seule alerte pour les deux refus (anti-doublon)
    alerte = alertes[0]
    assert alerte.type.value == "anomalie" and alerte.niveau_gravite.value == "attention"
    d = alerte.declencheur
    assert d["regle"] == "suivi_double_appareil"
    assert d["embarcation_id"] == e["id"] and d["fenetre_minutes"] == 30
    assert {d["appareil_refuse"], d["appareil_en_place"]} == {a_.empreinte[:8] for a_ in appareils}
    assert datetime.fromisoformat(d["releve_en_place"]) == t0
    assert d["message"]
    assert a[ENTETE] not in json.dumps(d) and b[ENTETE] not in json.dumps(d)
    # Rien n'a été enregistré pour le second appareil
    assert len(positions) == 1

    # Hors de la fenêtre, le second appareil peut prendre le relais
    assert (await _envoyer(client, b, e["id"], t0 + timedelta(minutes=31))).status_code == 201
    # Et le premier est à son tour refusé tant que le second suit
    retour = await _envoyer(client, a, e["id"], t0 + timedelta(minutes=40))
    assert retour.status_code == 409 and retour.json()["code"] == "SUIVI_DEJA_ASSURE"
    # Une alerte par appareil refusé ; elles sont classées en fin de test
    assert await _classer_alertes(client, agent_headers, e["id"]) == 2


@pytest.mark.asyncio
async def test_l10_c_fenetre_d_exclusivite_parametree(
    client: AsyncClient, agent_headers: dict, regle, sans_regles_m7
) -> None:
    """Non codé en dur : modifier la fenêtre dans le fichier de règles change le résultat."""
    _p, e, a, b = await _deux_appareils(client, agent_headers)
    t0 = instant_isole()
    assert (await _envoyer(client, a, e["id"], t0)).status_code == 201
    plus_tard = t0 + timedelta(minutes=10)
    assert (await _envoyer(client, b, e["id"], plus_tard)).status_code == 409

    regle(fenetre_exclusivite_minutes=5)
    assert (await _envoyer(client, b, e["id"], plus_tard)).status_code == 201

    # Deux embarcations du même pêcheur, un appareil chacune : aucun conflit
    regle(fenetre_exclusivite_minutes=30)
    seconde = await creer_embarcation(client, agent_headers, _p["id"], tag="L10")
    t1 = t0 + timedelta(days=1)
    assert (await _envoyer(client, a, e["id"], t1)).status_code == 201
    assert (await _envoyer(client, b, seconde["id"], t1)).status_code == 201
    assert await _classer_alertes(client, agent_headers, e["id"]) == 1


@pytest.mark.asyncio
async def test_l10_c_appareil_libere_ne_bloque_pas_son_successeur(
    client: AsyncClient, agent_headers: dict, engine, regle, sans_regles_m7
) -> None:
    """Téléphone perdu ou remplacé : après libération, le nouveau prend le suivi aussitôt."""
    p, e = await _pecheur(client, agent_headers)
    ancien, nouveau = _appareil(), _appareil()
    h_ancien = _session(await _connecter(client, p["email"], ancien), ancien)
    t0 = instant_isole()
    assert (await _envoyer(client, h_ancien, e["id"], t0)).status_code == 201

    base = f"/api/v1/pecheurs/{p['id']}/appareils"
    a_liberer = (await client.get(base, headers=agent_headers)).json()["appareils"][0]["id"]
    motif = {"motif": "Téléphone remplacé (essai fictif)"}
    liberation = await client.post(
        f"{base}/{a_liberer}/liberation", headers=agent_headers, json=motif
    )
    assert liberation.status_code == 200, liberation.text
    # L'ancien téléphone, libéré, n'émet plus pour ce compte
    plus = await _envoyer(client, h_ancien, e["id"], t0 + timedelta(minutes=5))
    assert plus.status_code == 403 and plus.json()["code"] == "APPAREIL_NON_RATTACHE"

    # Le nouveau téléphone émet dix minutes après le dernier relevé de l'ancien : accepté
    h_nouveau = _session(await _connecter(client, p["email"], nouveau), nouveau)
    relais = await _envoyer(client, h_nouveau, e["id"], t0 + timedelta(minutes=10))
    assert relais.status_code == 201, relais.text

    # Même téléphone rattaché de nouveau après une libération : pas de conflit avec lui-même
    a_liberer = next(
        a["id"]
        for a in (await client.get(base, headers=agent_headers)).json()["appareils"]
        if a["etat"] == "actif"
    )
    assert (
        await client.post(f"{base}/{a_liberer}/liberation", headers=agent_headers, json=motif)
    ).status_code == 200
    h_retour = _session(await _connecter(client, p["email"], nouveau), nouveau)
    retour = await _envoyer(client, h_retour, e["id"], t0 + timedelta(minutes=15))
    assert retour.status_code == 201, retour.text
    assert await _classer_alertes(client, agent_headers, e["id"]) == 0


@pytest.mark.asyncio
async def test_l10_b_connexions_simultanees(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Deux connexions au même instant ne contournent ni R1 ni R2."""
    # Même compte, deux téléphones : un seul est rattaché
    p, _ = await _pecheur(client, agent_headers)
    deux = await asyncio.gather(
        _connecter(client, p["email"], _appareil()), _connecter(client, p["email"], _appareil())
    )
    assert sorted(r.status_code for r in deux) == [200, 409]
    refus = next(r for r in deux if r.status_code == 409)
    assert refus.json()["code"] == "COMPTE_RATTACHE_AUTRE_APPAREIL"
    assert len(await _appareils_du_compte(engine, p["utilisateur_id"])) == 1

    # Même compte, même téléphone, demande envoyée deux fois : les deux aboutissent
    q, _ = await _pecheur(client, agent_headers)
    appareil = _appareil()
    doublon = await asyncio.gather(
        _connecter(client, q["email"], appareil), _connecter(client, q["email"], appareil)
    )
    assert [r.status_code for r in doublon] == [200, 200]
    assert len(await _appareils_du_compte(engine, q["utilisateur_id"])) == 1

    # Deux comptes, même téléphone : un seul l'obtient
    r1, _ = await _pecheur(client, agent_headers)
    r2, _ = await _pecheur(client, agent_headers)
    partage = _appareil()
    course = await asyncio.gather(
        _connecter(client, r1["email"], partage), _connecter(client, r2["email"], partage)
    )
    assert sorted(r.status_code for r in course) == [200, 409]
    perdant = next(r for r in course if r.status_code == 409)
    assert perdant.json()["code"] == "APPAREIL_DEJA_RATTACHE"
    rattaches = len(await _appareils_du_compte(engine, r1["utilisateur_id"])) + len(
        await _appareils_du_compte(engine, r2["utilisateur_id"])
    )
    assert rattaches == 1


@pytest.mark.asyncio
async def test_l10_c_date_sans_fuseau_acceptee(
    client: AsyncClient, agent_headers: dict, regle, sans_regles_m7
) -> None:
    """Une date de relevé sans fuseau ne provoque pas d'erreur interne au contrôle."""
    _p, e, a, b = await _deux_appareils(client, agent_headers)
    t0 = instant_isole().replace(tzinfo=None)
    sans_fuseau = {**_releve(e["id"], instant_isole()), "horodatage": t0.isoformat()}
    assert (await client.post("/api/v1/positions", headers=a, json=sans_fuseau)).status_code == 201
    conflit = await client.post(
        "/api/v1/positions",
        headers=b,
        json={**sans_fuseau, "horodatage": (t0 + timedelta(minutes=10)).isoformat()},
    )
    assert conflit.status_code == 409 and conflit.json()["code"] == "SUIVI_DEJA_ASSURE"
    assert await _classer_alertes(client, agent_headers, e["id"]) == 1


@pytest.mark.asyncio
async def test_l10_c_balises_non_concernees(
    client: AsyncClient, agent_headers: dict, engine, regle, sans_regles_m7, monkeypatch
) -> None:
    """L'ingestion des balises ne passe pas par le contrôle des appareils."""
    cle = "cle-balise-fictive"
    monkeypatch.setattr("app.modules.geolocalisation.router.settings.balise_ingest_key", cle)
    p = await creer_pecheur(client, agent_headers, tag="L10")
    balise = f"BAL-FICTIF-{uuid.uuid4().hex[:8]}"
    e = await creer_embarcation(client, agent_headers, p["id"], tag="L10", balise_id=balise)
    appareil = _appareil()
    headers = _session(await _connecter(client, p["email"], appareil), appareil)
    t0 = instant_isole()
    assert (await _envoyer(client, headers, e["id"], t0)).status_code == 201

    ingest = await client.post(
        "/api/v1/positions/balises/ingest",
        headers={"X-Balise-Ingest-Key": cle},
        json={
            "messages": [
                {
                    "balise_id": balise,
                    "lon": LARGE[0],
                    "lat": LARGE[1],
                    "horodatage": (t0 + timedelta(minutes=5)).isoformat(),
                }
            ]
        },
    )
    assert ingest.status_code == 200, ingest.text
    assert ingest.json()["integres"] == 1
    # La balise n'empêche pas le téléphone de continuer, et inversement
    assert (await _envoyer(client, headers, e["id"], t0 + timedelta(minutes=10))).status_code == 201


# --------------------------------------------------------------------------- #
# D. Agents de contrôle et administrateurs
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l10_d_liste_liberation_et_autorisation(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    p, _ = await _pecheur(client, agent_headers)
    autre, _ = await _pecheur(client, agent_headers)
    appareil = _appareil()
    assert (await _connecter(client, p["email"], appareil)).status_code == 200
    base = f"/api/v1/pecheurs/{p['id']}/appareils"

    liste = await client.get(base, headers=agent_headers)
    assert liste.status_code == 200, liste.text
    body = liste.json()
    assert (body["appareils_autorises"], body["appareils_actifs"]) == (1, 1)
    (ligne,) = body["appareils"]
    assert ligne["etat"] == "actif" and ligne["origine"] == "android"
    assert ligne["empreinte_abregee"] == appareils_service.empreinte(appareil)[:8]
    assert set(ligne) == {
        "id",
        "empreinte_abregee",
        "origine",
        "etat",
        "premiere_utilisation",
        "derniere_utilisation",
        "libere_le",
        "libere_par_id",
        "libere_par",
        "motif_liberation",
    }
    assert appareil not in liste.text

    # Libération : motif obligatoire
    liberation = f"{base}/{ligne['id']}/liberation"
    assert (await client.post(liberation, headers=agent_headers, json={})).status_code == 422
    assert (
        await client.post(liberation, headers=agent_headers, json={"motif": "  ok "})
    ).status_code == 422
    admin_id, admin = await creer_compte(engine, RoleUtilisateur.admin)
    fait = await client.post(
        liberation, headers=admin, json={"motif": "Téléphone perdu en mer (essai fictif)"}
    )
    assert fait.status_code == 200, fait.text
    (libere,) = fait.json()["appareils"]
    assert libere["etat"] == "libere"
    assert libere["libere_par_id"] == str(admin_id) and libere["libere_par"]
    assert libere["motif_liberation"] == "Téléphone perdu en mer (essai fictif)"
    assert libere["libere_le"] is not None
    assert fait.json()["appareils_actifs"] == 0
    encore = await client.post(liberation, headers=admin, json={"motif": "Seconde demande"})
    assert encore.status_code == 409 and encore.json()["code"] == "APPAREIL_DEJA_LIBERE"

    # Après libération : le compte rattache un nouveau téléphone, l'ancien un autre compte ;
    # le serveur le confirme, pour que l'application aligne sa garde locale.
    assert (await _connecter(client, p["email"], _appareil())).status_code == 200
    repris = await _connecter(client, autre["email"], appareil)
    assert repris.status_code == 200 and repris.json()["appareil_rattache"] is True
    historique = (await client.get(base, headers=agent_headers)).json()
    assert sorted(a["etat"] for a in historique["appareils"]) == ["actif", "libere"]

    # Autorisation d'un appareil supplémentaire, jusqu'au plafond du paramétrage
    assert (
        await client.post(f"{base}/autorisation", headers=agent_headers, json={})
    ).status_code == 422
    for attendu in (2, 3):
        ok = await _autoriser(client, agent_headers, p["id"])
        assert ok.status_code == 200 and ok.json()["appareils_autorises"] == attendu
    plafond = await _autoriser(client, agent_headers, p["id"])
    assert plafond.status_code == 409 and plafond.json()["code"] == "APPAREILS_PLAFOND_ATTEINT"

    # Motifs et auteurs conservés au journal des accès
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        traces = (
            (
                await session.execute(
                    select(LogAcces).where(
                        LogAcces.ressource == "appareils", LogAcces.detail.contains(p["id"])
                    )
                )
            )
            .scalars()
            .all()
        )
    assert sorted(t.action for t in traces) == ["autorisation", "autorisation", "liberation"]
    assert all("motif=" in t.detail for t in traces)


@pytest.mark.asyncio
async def test_l10_d_roles_et_perimetre(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    org = await creer_organisation(client, agent_headers, tag="L10")
    p, _ = await _pecheur(client, agent_headers, organisation_id=org["id"])
    autre, _ = await _pecheur(client, agent_headers)
    appareil = _appareil()
    session_pecheur = _session(await _connecter(client, p["email"], appareil))
    assert (await _connecter(client, autre["email"], _appareil())).status_code == 200
    base = f"/api/v1/pecheurs/{p['id']}/appareils"
    a_liberer = (await client.get(base, headers=agent_headers)).json()["appareils"][0]["id"]
    motif = {"motif": "Essai de périmètre (fictif)"}

    async def essais(headers: dict | None) -> list[int]:
        kw = {"headers": headers} if headers else {}
        return [
            (await client.get(base, **kw)).status_code,
            (await client.post(f"{base}/autorisation", json=motif, **kw)).status_code,
            (await client.post(f"{base}/{a_liberer}/liberation", json=motif, **kw)).status_code,
        ]

    assert await essais(None) == [401, 401, 401]
    # Ni le pêcheur lui-même, ni son organisation, ni le chercheur, ni l'autorité
    refuses = [session_pecheur]
    refuses.append(
        (await creer_compte(engine, RoleUtilisateur.organisation, organisation_id=org["id"]))[1]
    )
    for role in (RoleUtilisateur.chercheur, RoleUtilisateur.autorite):
        refuses.append((await creer_compte(engine, role))[1])
    for headers in refuses:
        assert await essais(headers) == [403, 403, 403]
    assert (await client.get(base, headers=agent_headers)).json()["appareils_actifs"] == 1

    # Pêcheur inexistant, appareil inexistant, appareil d'un autre pêcheur : 404, sans distinction
    inconnu = f"/api/v1/pecheurs/{uuid.uuid4()}/appareils"
    assert (await client.get(inconnu, headers=agent_headers)).status_code == 404
    assert (
        await client.post(f"{inconnu}/autorisation", headers=agent_headers, json=motif)
    ).status_code == 404
    appareil_autre = (
        await client.get(f"/api/v1/pecheurs/{autre['id']}/appareils", headers=agent_headers)
    ).json()["appareils"][0]["id"]
    for cible in (str(uuid.uuid4()), appareil_autre):
        resp = await client.post(f"{base}/{cible}/liberation", headers=agent_headers, json=motif)
        assert resp.status_code == 404 and resp.json()["code"] == "APPAREIL_NOT_FOUND"
    # L'appareil de l'autre pêcheur est resté actif
    assert (
        await client.get(f"/api/v1/pecheurs/{autre['id']}/appareils", headers=agent_headers)
    ).json()["appareils_actifs"] == 1


# --------------------------------------------------------------------------- #
# A et E. Aucune valeur brute stockée ; paramétrage versionné
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l10_a_aucun_identifiant_brut_stocke(
    client: AsyncClient, agent_headers: dict, engine, regle, monkeypatch
) -> None:
    p, _ = await _pecheur(client, agent_headers)
    appareil = _appareil()
    assert (await _connecter(client, p["email"], appareil)).status_code == 200
    (rattache,) = await _appareils_du_compte(engine, p["utilisateur_id"])

    # Empreinte : 64 caractères hexadécimaux, ni la valeur ni un simple condensé de la valeur
    assert len(rattache.empreinte) == 64 and int(rattache.empreinte, 16) >= 0
    assert rattache.empreinte != appareil
    assert rattache.empreinte != hashlib.sha256(appareil.encode()).hexdigest()
    brut = appareil.split(":", 1)[1]
    for colonne in Appareil.__table__.columns:
        valeur = getattr(rattache, colonne.name)
        assert appareil not in str(valeur) and brut not in str(valeur), colonne.name

    # L'empreinte dépend du secret du serveur : sans lui, elle ne se recalcule pas
    avant = appareils_service.empreinte(appareil)
    monkeypatch.setattr(settings, "appareil_secret", SecretStr("autre-secret-fictif-de-test"))
    assert appareils_service.empreinte(appareil) != avant
    assert "autre-secret-fictif-de-test" not in repr(settings)


def test_l10_e_parametrage_du_depot_et_statut_des_regles() -> None:
    """Le fichier versionné du dépôt se lit ; R1 est décidée, R2 à R6 sont « Proposé »."""
    contenu = charger_regles("appareils")
    lu = regle_appareils()
    assert lu.fenetre_exclusivite_minutes == 30
    assert lu.appareils_par_defaut == 1
    assert lu.entete_obligatoire is False  # désactivée au départ
    assert set(contenu["explications"]) == set(contenu["appareils"])
    regles = contenu["regles"]
    assert regles["R1"]["statut"].startswith("Décidée")
    for numero in ("R2", "R3", "R4", "R5", "R6"):
        assert regles[numero]["statut"] == "Proposé", numero
        assert regles[numero]["valideurs"], numero
        assert regles[numero]["enonce"], numero


@pytest.mark.asyncio
async def test_l10_e_parametrage_absent_echec_ferme(
    client: AsyncClient, agent_headers: dict, tmp_path, monkeypatch
) -> None:
    """Sans paramétrage lisible, un pêcheur ne se connecte pas : aucune valeur de repli."""
    p, _ = await _pecheur(client, agent_headers)
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    resp = await _connecter(client, p["email"], _appareil())
    assert resp.status_code == 503 and resp.json()["code"] == "REGLE_INDISPONIBLE"


@pytest.mark.asyncio
async def test_l10_f_comptes_de_demonstration_exemptes(
    client: AsyncClient, agent_headers: dict, engine, regle, sans_regles_m7
) -> None:
    """Décision du 2026-11-25 : un compte exempté se connecte et émet depuis plusieurs
    téléphones ; un téléphone passe d'un compte exempté à un autre ; les autres comptes
    restent soumis à la règle. Le paramètre seul change le comportement."""
    demo_a, emb_a = await _pecheur(client, agent_headers)
    demo_b, _ = await _pecheur(client, agent_headers)
    reel, _ = await _pecheur(client, agent_headers)
    regle(comptes_exemptes=[demo_a["email"].upper(), demo_b["email"]])

    tel_1, tel_2 = _appareil(), _appareil()
    for tel in (tel_1, tel_2):
        resp = await _connecter(client, demo_a["email"], tel)
        assert resp.status_code == 200, resp.text
    assert (await _connecter(client, demo_b["email"], tel_1)).status_code == 200
    assert await _appareils_du_compte(engine, demo_a["utilisateur_id"]) == []

    # Deux téléphones émettent pour la même embarcation sans conflit
    quand = instant_isole()
    for tel in (tel_1, tel_2):
        session = _session(await _connecter(client, demo_a["email"], tel), tel)
        envoi = await _envoyer(client, session, emb_a["id"], quand)
        assert envoi.status_code == 201, envoi.text

    # Un compte réel reste soumis à la règle
    assert (await _connecter(client, reel["email"], tel_1)).status_code == 200
    second = await _connecter(client, reel["email"], tel_2)
    assert second.status_code == 409
    assert second.json()["code"] == "COMPTE_RATTACHE_AUTRE_APPAREIL"

    # Liste vide : le compte de démonstration retombe sous la règle
    regle(comptes_exemptes=[])
    assert (await _connecter(client, demo_b["email"], tel_1)).status_code == 409


def test_l10_f_exemption_du_depot_decidee() -> None:
    contenu = charger_regles("appareils")
    assert regle_appareils().comptes_exemptes, "comptes de démonstration attendus"
    assert all(e.endswith("@example.com") for e in regle_appareils().comptes_exemptes)
    assert contenu["regles"]["exemption_demonstration"]["statut"].startswith("Décidée")
