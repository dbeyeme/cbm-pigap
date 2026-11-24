"""Lot 2, partie F : page de profil d'un acteur (pêcheur ou organisation).

Données fictives. Les captures sont datées dans le passé et écrites directement
en base ; la fenêtre des espèces est élargie par le paramétrage du test.
"""

from __future__ import annotations

import asyncio
import copy
import json
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.regles import charger_regles
from app.db.enums import RoleUtilisateur
from app.db.models import Capture
from app.modules.profils.regles import regle_profil
from app.modules.referentiels import service as referentiels
from app.tests.aides import (
    connexion,
    copier_regles,
    creer_compte,
    creer_embarcation,
    creer_organisation,
    creer_pecheur,
    inserer_capture,
    instant_isole,
)

MOI = "/api/v1/profils/moi"

REGLE_DE_TEST = {
    "profil": {
        # Fenêtre large : les captures fictives sont datées entre 1990 et 2014
        "especes_periode_jours": 20000,
        "especes_max": 12,
        "presentation_max_caracteres": 600,
        "tarifs_max": 30,
        "prix_max_fcfa": 10_000_000,
        "unites_tarif": ["kg", "unite"],
    }
}

CLES_PUBLIQUES = {
    "genre",
    "nom",
    "localite",
    "presentation",
    "especes",
    "tarifs_affiches",
    "tarifs",
    "mise_a_jour",
}
CLES_CONNECTEES = CLES_PUBLIQUES | {"acteur_id", "organisation", "nb_embarcations"}


@pytest.fixture
def regle(tmp_path, monkeypatch):
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(tmp_path, "profil_acteur", REGLE_DE_TEST)

    def changer(**profil) -> None:
        copier_regles(tmp_path, "profil_acteur", {"profil": profil})

    return changer


def _especes() -> tuple[str, str, str]:
    """Deux espèces courantes et une espèce protégée du référentiel."""
    protegees = {e["code"] for e in referentiels.especes_protegees()}
    libres = [c for c in referentiels.espece_codes() if c not in protegees]
    return libres[0], libres[1], sorted(protegees)[0]


async def _pecheur_avec_captures(
    client: AsyncClient, agent_headers: dict, engine, **champs
) -> tuple[dict, dict, dict]:
    """Pêcheur fictif, son embarcation et sa session ; 15 kg de A, 20 kg de B, 2 kg protégés."""
    a, b, protegee = _especes()
    telephone = f"+2416{uuid.uuid4().int % 10**7:07d}"
    p = await creer_pecheur(client, agent_headers, tag="L2F", telephone=telephone, **champs)
    p["telephone"] = telephone  # coordonnée du compte, absente de la réponse du registre
    e = await creer_embarcation(
        client, agent_headers, p["id"], tag="L2F", site_attache="Débarcadère fictif d'Owendo"
    )
    t0 = instant_isole()
    for espece, kg in ((a, 10.0), (a, 5.0), (b, 20.0), (protegee, 2.0)):
        await inserer_capture(
            engine,
            pecheur_id=p["id"],
            embarcation_id=e["id"],
            espece=espece,
            quantite_kg=kg,
            quand=t0,
        )
    return p, e, await connexion(client, p["email"])


def _codes(especes: list[dict]) -> list[str]:
    return [e["espece"] for e in especes]


@contextmanager
def referentiel_remplace(dossier: Path, contenu: dict | None) -> Iterator[None]:
    """Le temps d'un bloc : référentiel des espèces absent du serveur (`None`) ou remplacé."""
    chemin = dossier / f"referentiel-{uuid.uuid4().hex}.json"
    if contenu is not None:
        chemin.write_text(json.dumps(contenu), encoding="utf-8")

    def vider_les_caches() -> None:
        for objet in vars(referentiels).values():
            if callable(getattr(objet, "cache_clear", None)):
                objet.cache_clear()

    with pytest.MonkeyPatch.context() as remplacement:
        remplacement.setattr(referentiels, "data_path", lambda _nom: chemin)
        vider_les_caches()
        try:
            yield
        finally:
            remplacement.undo()
            vider_les_caches()


# --------------------------------------------------------------------------- #
# Espèces, présentation, vue connectée
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l2_f_page_de_profil_especes_tirees_des_captures(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Acceptation F : présentation courte, espèces tirées des captures, masquage par l'acteur."""
    a, b, protegee = _especes()
    p, _e, moi = await _pecheur_avec_captures(client, agent_headers, engine)

    resp = await client.get(MOI, headers=moi)
    assert resp.status_code == 200, resp.text
    profil = resp.json()
    assert profil["genre"] == "pecheur" and profil["acteur_id"] == p["id"]
    assert profil["nom"] == f"{p['prenom']} {p['nom']}"
    assert profil["localite"] == "Débarcadère fictif d'Owendo"
    assert profil["nb_embarcations"] == 1
    # De la plus déclarée à la moins déclarée ; l'espèce protégée ne s'affiche pas
    assert _codes(profil["especes_declarees"]) == [b, a]
    assert _codes(profil["especes"]) == [b, a]
    assert all(e["nom"] for e in profil["especes"]) and protegee not in _codes(profil["especes"])
    # Réglages de départ : rien de masqué, aucun tarif, page fermée au public
    assert profil["especes_masquees"] == [] and profil["mes_tarifs"] == []
    assert profil["tarifs_visibles"] is False and profil["ouvert_au_public"] is False
    assert profil["lien_public"] is None and profil["presentation"] is None
    assert profil["statut_regles"] == "Proposé"
    assert profil["limites"] == {
        "presentation_max_caracteres": 600,
        "tarifs_max": 30,
        "prix_max_fcfa": 10_000_000,
        "unites_tarif": ["kg", "unite"],
    }

    modifie = await client.patch(
        MOI,
        headers=moi,
        json={
            "presentation": "  Pêche à la ligne au large d'Owendo (texte fictif).  ",
            "especes_masquees": [a],
        },
    )
    assert modifie.status_code == 200, modifie.text
    body = modifie.json()
    assert body["presentation"] == "Pêche à la ligne au large d'Owendo (texte fictif)."
    assert _codes(body["especes"]) == [b] and body["especes_masquees"] == [a]
    assert _codes(body["especes_declarees"]) == [b, a]
    assert body["mise_a_jour"] is not None

    # Vue d'un autre compte connecté : la page, sans réglage ni coordonnée
    autre = await creer_pecheur(client, agent_headers, tag="L2F")
    vu = await client.get(
        f"/api/v1/profils/pecheurs/{p['id']}", headers=await connexion(client, autre["email"])
    )
    assert vu.status_code == 200, vu.text
    assert set(vu.json()) == CLES_CONNECTEES
    assert _codes(vu.json()["especes"]) == [b]
    for interdit in (p["email"], p["numero_licence"], "+241"):
        assert interdit not in vu.text

    # Non codé en dur : la fenêtre des captures vient du paramétrage
    regle(especes_periode_jours=1)
    assert (await client.get(MOI, headers=moi)).json()["especes_declarees"] == []
    regle(especes_periode_jours=20000, especes_max=1)
    apres = (await client.get(MOI, headers=moi)).json()
    assert _codes(apres["especes"]) == [b] and len(apres["especes_declarees"]) == 2


# --------------------------------------------------------------------------- #
# Tarifs
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l2_f_tarifs_facultatifs_affiches_si_l_acteur_le_decide(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    a, b, protegee = _especes()
    p, _e, moi = await _pecheur_avec_captures(client, agent_headers, engine)
    vue = f"/api/v1/profils/pecheurs/{p['id']}"
    tarifs = [
        {"espece": a, "unite": "kg", "prix_fcfa": 2500},
        {"espece": b, "unite": "unite", "prix_fcfa": 1500},
    ]

    saisis = await client.patch(MOI, headers=moi, json={"tarifs": tarifs})
    assert saisis.status_code == 200, saisis.text
    assert [(t["espece"], t["unite"], t["prix_fcfa"]) for t in saisis.json()["mes_tarifs"]] == [
        (a, "kg", 2500),
        (b, "unite", 1500),
    ]
    assert all(t["nom"] for t in saisis.json()["mes_tarifs"])
    # Saisis mais non affichés : les autres ne voient aucun tarif
    cache = (await client.get(vue, headers=agent_headers)).json()
    assert cache["tarifs"] == [] and cache["tarifs_affiches"] is False

    affiches = await client.patch(MOI, headers=moi, json={"tarifs_visibles": True})
    assert affiches.json()["tarifs_visibles"] is True
    visible = (await client.get(vue, headers=agent_headers)).json()
    assert visible["tarifs_affiches"] is True
    assert [(t["espece"], t["prix_fcfa"]) for t in visible["tarifs"]] == [(a, 2500), (b, 1500)]

    # Saisies refusées, avec un message en clair ; les tarifs en place ne changent pas
    refus = [
        ([{"espece": "espece-inconnue", "unite": "kg", "prix_fcfa": 100}], 400, "ESPECE_INCONNUE"),
        ([{"espece": protegee, "unite": "kg", "prix_fcfa": 100}], 400, "ESPECE_PROTEGEE"),
        ([{"espece": a, "unite": "litre", "prix_fcfa": 100}], 400, "UNITE_INVALIDE"),
        ([{"espece": a, "unite": "kg", "prix_fcfa": 10_000_001}], 400, "PRIX_INVALIDE"),
        ([{"espece": a, "unite": "kg", "prix_fcfa": 0}], 422, "VALIDATION_ERROR"),
        ([{"espece": a, "unite": "kg", "prix_fcfa": 12.5}], 422, "VALIDATION_ERROR"),
        (
            [
                {"espece": a, "unite": "kg", "prix_fcfa": 100},
                {"espece": a, "unite": "kg", "prix_fcfa": 200},
            ],
            400,
            "TARIF_EN_DOUBLE",
        ),
    ]
    for lignes, statut, code in refus:
        resp = await client.patch(MOI, headers=moi, json={"tarifs": lignes})
        assert (resp.status_code, resp.json()["code"]) == (statut, code), lignes
        assert not resp.json()["detail"].startswith(code)
    assert len((await client.get(MOI, headers=moi)).json()["mes_tarifs"]) == 2

    # Non codé en dur : unités et nombre de lignes viennent du paramétrage
    regle(unites_tarif=["kg"])
    a_l_unite = await client.patch(MOI, headers=moi, json={"tarifs": tarifs})
    assert a_l_unite.status_code == 400 and a_l_unite.json()["code"] == "UNITE_INVALIDE"
    regle(unites_tarif=["kg", "unite"], tarifs_max=1)
    trop = await client.patch(MOI, headers=moi, json={"tarifs": tarifs})
    assert trop.status_code == 400 and trop.json()["code"] == "TARIFS_TROP_NOMBREUX"

    # L'acteur retire ses tarifs : plus rien ne s'affiche
    regle(tarifs_max=30)
    vides = await client.patch(MOI, headers=moi, json={"tarifs": []})
    assert vides.json()["mes_tarifs"] == []
    assert (await client.get(vue, headers=agent_headers)).json()["tarifs_affiches"] is False


# --------------------------------------------------------------------------- #
# Ouverture au public : lien et QR code
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l2_f_ouverture_au_public_par_lien_et_qr_code(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    a, b, _protegee = _especes()
    p, e, moi = await _pecheur_avec_captures(client, agent_headers, engine)
    await client.patch(
        MOI,
        headers=moi,
        json={
            "presentation": "Présentation fictive.",
            "tarifs": [{"espece": a, "unite": "kg", "prix_fcfa": 2500}],
            "tarifs_visibles": True,
        },
    )

    # Désactivée au départ : ni lien, ni QR code, ni page publique
    assert (await client.get(MOI, headers=moi)).json()["lien_public"] is None
    sans_qr = await client.get(f"{MOI}/qr", headers=moi)
    assert sans_qr.status_code == 409 and sans_qr.json()["code"] == "PROFIL_NON_PUBLIC"
    hasard = await client.get(f"/api/v1/public/profils/{uuid.uuid4().hex}")
    assert hasard.status_code == 404 and hasard.json()["code"] == "PROFIL_NOT_FOUND"

    ouverte = await client.patch(MOI, headers=moi, json={"ouvert_au_public": True})
    assert ouverte.status_code == 200, ouverte.text
    lien = ouverte.json()["lien_public"]
    racine = f"{settings.public_web_url.rstrip('/')}/profil/"
    assert lien.startswith(racine)
    jeton = lien[len(racine) :]
    # Le lien ne se déduit d'aucun identifiant
    assert len(jeton) >= 24 and p["id"] not in lien and p["numero_licence"] not in lien

    publique = await client.get(f"/api/v1/public/profils/{jeton}")  # sans connexion
    assert publique.status_code == 200, publique.text
    body = publique.json()
    assert set(body) == CLES_PUBLIQUES
    assert (
        body["nom"] == f"{p['prenom']} {p['nom']}"
        and body["presentation"] == "Présentation fictive."
    )
    assert _codes(body["especes"]) == [b, a]
    assert [(t["espece"], t["unite"], t["prix_fcfa"]) for t in body["tarifs"]] == [(a, "kg", 2500)]
    # Aucune coordonnée personnelle, aucun identifiant
    for interdit in (
        p["email"],
        p["telephone"],
        p["numero_licence"],
        p["id"],
        p["utilisateur_id"],
        e["immatriculation"],
        e["id"],
    ):
        assert interdit not in publique.text, interdit

    qr = await client.get(f"{MOI}/qr", headers=moi)
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in qr.text and "<rect" in qr.text

    # Jetons mal formés : refusés sans chercher
    for mauvais in ("court", "a" * 80, "avec espace et accent é" * 2):
        assert (await client.get(f"/api/v1/public/profils/{mauvais}")).status_code in (404, 422)

    # Pêcheur suspendu : la vitrine publique n'est plus servie
    suspendu = await client.patch(
        f"/api/v1/pecheurs/{p['id']}", headers=agent_headers, json={"statut": "suspendu"}
    )
    assert suspendu.status_code == 200
    assert (await client.get(f"/api/v1/public/profils/{jeton}")).status_code == 404
    await client.patch(
        f"/api/v1/pecheurs/{p['id']}", headers=agent_headers, json={"statut": "actif"}
    )
    assert (await client.get(f"/api/v1/public/profils/{jeton}")).status_code == 200

    # L'acteur referme sa page : plus de page publique ; s'il la rouvre, le lien est le même
    fermee = await client.patch(MOI, headers=moi, json={"ouvert_au_public": False})
    assert fermee.json()["lien_public"] is None
    assert (await client.get(f"/api/v1/public/profils/{jeton}")).status_code == 404
    assert (await client.get(f"{MOI}/qr", headers=moi)).status_code == 409
    rouverte = await client.patch(MOI, headers=moi, json={"ouvert_au_public": True})
    assert rouverte.json()["lien_public"] == lien


# --------------------------------------------------------------------------- #
# Organisation, rôles, périmètre
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l2_f_profil_d_une_organisation(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    a, b, _protegee = _especes()
    org = await creer_organisation(client, agent_headers, tag="L2F")
    coordonnees = await client.patch(
        f"/api/v1/organisations/{org['id']}",
        headers=agent_headers,
        json={
            "ville": "Port-Gentil",
            "telephone": "+24160000000",
            "email": "contact.fictif@example.com",
        },
    )
    assert coordonnees.status_code == 200, coordonnees.text
    t0 = instant_isole()
    for espece, kg in ((a, 30.0), (b, 5.0)):
        membre = await creer_pecheur(client, agent_headers, tag="L2F", organisation_id=org["id"])
        bateau = await creer_embarcation(client, agent_headers, membre["id"], tag="L2F")
        await inserer_capture(
            engine,
            pecheur_id=membre["id"],
            embarcation_id=bateau["id"],
            espece=espece,
            quantite_kg=kg,
            quand=t0,
        )
    _, compte = await creer_compte(engine, RoleUtilisateur.organisation, organisation_id=org["id"])

    profil = (await client.get(MOI, headers=compte)).json()
    assert profil["genre"] == "organisation" and profil["acteur_id"] == org["id"]
    assert profil["nom"] == org["nom"] and profil["localite"] == "Port-Gentil"
    # Espèces de tous les membres, de la plus déclarée à la moins déclarée
    assert _codes(profil["especes"]) == [a, b] and profil["nb_embarcations"] == 2

    modifie = await client.patch(
        MOI,
        headers=compte,
        json={"presentation": "Coopérative fictive.", "ouvert_au_public": True},
    )
    assert modifie.status_code == 200, modifie.text
    jeton = modifie.json()["lien_public"].rsplit("/", 1)[1]

    vu = await client.get(f"/api/v1/profils/organisations/{org['id']}", headers=agent_headers)
    assert vu.status_code == 200 and set(vu.json()) == CLES_CONNECTEES
    assert vu.json()["presentation"] == "Coopérative fictive."
    publique = await client.get(f"/api/v1/public/profils/{jeton}")
    assert publique.status_code == 200 and set(publique.json()) == CLES_PUBLIQUES
    for interdit in ("+24160000000", "contact.fictif@example.com"):
        assert interdit not in publique.text and interdit not in vu.text
    assert org["id"] not in publique.text

    # Organisation désactivée : la vitrine publique n'est plus servie
    await client.patch(
        f"/api/v1/organisations/{org['id']}", headers=agent_headers, json={"actif": False}
    )
    assert (await client.get(f"/api/v1/public/profils/{jeton}")).status_code == 404


@pytest.mark.asyncio
async def test_l2_f_roles_et_perimetre(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    p, _e, moi = await _pecheur_avec_captures(client, agent_headers, engine)
    autre = await creer_pecheur(client, agent_headers, tag="L2F")
    h_autre = await connexion(client, autre["email"])
    vue = f"/api/v1/profils/pecheurs/{p['id']}"

    # Sans connexion : seule la route publique existe
    for chemin in (MOI, f"{MOI}/qr", vue, f"/api/v1/profils/organisations/{uuid.uuid4()}"):
        assert (await client.get(chemin)).status_code == 401
    assert (await client.patch(MOI, json={"presentation": "x"})).status_code == 401

    # Tout compte connecté lit la page d'un acteur
    comptes = [agent_headers, h_autre]
    for role in (
        RoleUtilisateur.autorite,
        RoleUtilisateur.admin,
        RoleUtilisateur.chercheur,
        RoleUtilisateur.organisation,
    ):
        comptes.append((await creer_compte(engine, role))[1])
    for headers in comptes:
        assert (await client.get(vue, headers=headers)).status_code == 200

    # Seul l'acteur règle sa page : les autres rôles n'ont pas de « ma page »
    for headers in comptes[:1] + comptes[2:5]:
        assert (await client.get(MOI, headers=headers)).status_code == 403
        assert (await client.patch(MOI, headers=headers, json={})).status_code == 403
    # Compte d'organisation sans rattachement : pas de profil, et rien à modifier
    orphelin = comptes[5]
    assert (await client.get(MOI, headers=orphelin)).status_code == 404
    assert (
        await client.patch(MOI, headers=orphelin, json={"presentation": "x"})
    ).status_code == 404

    # Un pêcheur ne modifie que sa page : celle du voisin reste intacte
    await client.patch(MOI, headers=h_autre, json={"presentation": "Texte du voisin (fictif)."})
    assert (await client.get(vue, headers=agent_headers)).json()["presentation"] is None
    assert (await client.get(MOI, headers=moi)).json()["presentation"] is None

    # Acteurs inexistants
    for chemin in (
        f"/api/v1/profils/pecheurs/{uuid.uuid4()}",
        f"/api/v1/profils/organisations/{uuid.uuid4()}",
    ):
        resp = await client.get(chemin, headers=agent_headers)
        assert resp.status_code == 404 and resp.json()["code"] == "PROFIL_NOT_FOUND"

    # Présentation trop longue, espèce masquée inconnue
    longue = await client.patch(MOI, headers=moi, json={"presentation": "x" * 601})
    assert longue.status_code == 400 and longue.json()["code"] == "PRESENTATION_TROP_LONGUE"
    inconnue = await client.patch(MOI, headers=moi, json={"especes_masquees": ["inconnue"]})
    assert inconnue.status_code == 400 and inconnue.json()["code"] == "ESPECE_INCONNUE"


# --------------------------------------------------------------------------- #
# Espèces protégées : échec fermé
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l2_f_sans_referentiel_ni_espece_ni_tarif_ne_s_affiche(
    client: AsyncClient, agent_headers: dict, engine, regle, tmp_path
) -> None:
    """Référentiel absent du serveur, ou sans liste des espèces protégées : la page ne
    montre plus rien de ce qu'il devait filtrer, espèce protégée comprise."""
    a, b, protegee = _especes()
    p, e, moi = await _pecheur_avec_captures(client, agent_headers, engine)
    # Espèce saisie en clair, inconnue du référentiel : jamais affichée, même en temps normal
    await inserer_capture(
        engine,
        pecheur_id=p["id"],
        embarcation_id=e["id"],
        espece="espece-fictive-hors-referentiel",
        quantite_kg=50.0,
        quand=instant_isole(),
    )
    ouverte = await client.patch(
        MOI,
        headers=moi,
        json={
            "tarifs": [
                {"espece": a, "unite": "kg", "prix_fcfa": 2500},
                {"espece": b, "unite": "unite", "prix_fcfa": 1500},
            ],
            "tarifs_visibles": True,
            "ouvert_au_public": True,
        },
    )
    assert ouverte.status_code == 200, ouverte.text
    jeton = ouverte.json()["lien_public"].rsplit("/", 1)[1]
    assert _codes(ouverte.json()["especes"]) == [b, a]
    assert "espece-fictive-hors-referentiel" not in ouverte.text
    vues = (
        (MOI, moi),
        (f"/api/v1/profils/pecheurs/{p['id']}", agent_headers),
        (f"/api/v1/public/profils/{jeton}", None),
    )

    async def rien_ne_s_affiche() -> None:
        for chemin, headers in vues:
            resp = await client.get(chemin, headers=headers)
            assert resp.status_code == 200, (chemin, resp.text)
            body = resp.json()
            assert body["especes"] == [] and body["tarifs"] == [], chemin
            assert body["tarifs_affiches"] is False, chemin
            for code in (a, b, protegee, "espece-fictive-hors-referentiel"):
                assert code not in resp.text, (chemin, code)

    complet = copy.deepcopy(referentiels.load_referentiels())

    # 1. Fichier du référentiel absent du serveur
    with referentiel_remplace(tmp_path, None):
        await rien_ne_s_affiche()
        # Aucun réglage d'espèce n'est accepté ; la présentation, elle, s'enregistre
        for corps in (
            {"especes_masquees": [a]},
            {"tarifs": [{"espece": a, "unite": "kg", "prix_fcfa": 100}]},
        ):
            refus = await client.patch(MOI, headers=moi, json=corps)
            assert refus.status_code == 503, refus.text
            assert refus.json()["code"] == "REFERENTIEL_INDISPONIBLE"
            assert not refus.json()["detail"].startswith("REFERENTIEL")
        texte = await client.patch(MOI, headers=moi, json={"presentation": "Texte fictif."})
        assert texte.status_code == 200, texte.text

    # 2. Référentiel sans sa liste des espèces protégées : la règle ne peut pas s'appliquer
    with referentiel_remplace(tmp_path, {**complet, "especes_protegees": []}):
        await rien_ne_s_affiche()

    # 3. Une espèce devient protégée après la saisie de son tarif : elle disparaît
    devenue = copy.deepcopy(complet)
    devenue["especes_protegees"].append({**devenue["especes_protegees"][0], "code": a})
    with referentiel_remplace(tmp_path, devenue):
        publique = (await client.get(f"/api/v1/public/profils/{jeton}")).json()
        assert _codes(publique["especes"]) == [b]
        assert [t["espece"] for t in publique["tarifs"]] == [b]
        assert [t["espece"] for t in (await client.get(MOI, headers=moi)).json()["mes_tarifs"]] == [
            b
        ]

    # Référentiel revenu : rien n'a été effacé
    retour = (await client.get(MOI, headers=moi)).json()
    assert _codes(retour["especes"]) == [b, a]
    assert [t["espece"] for t in retour["mes_tarifs"]] == [a, b]
    publique = (await client.get(f"/api/v1/public/profils/{jeton}")).json()
    assert [t["espece"] for t in publique["tarifs"]] == [a, b]
    assert protegee not in _codes(publique["especes"])


@pytest.mark.asyncio
async def test_l2_f_tarif_d_une_espece_masquee_ou_d_une_unite_retiree(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    a, b, _protegee = _especes()
    p, _e, moi = await _pecheur_avec_captures(client, agent_headers, engine)
    vue = f"/api/v1/profils/pecheurs/{p['id']}"
    regle_en_place = await client.patch(
        MOI,
        headers=moi,
        json={
            "tarifs": [
                {"espece": a, "unite": "kg", "prix_fcfa": 2500},
                {"espece": b, "unite": "unite", "prix_fcfa": 1500},
            ],
            "tarifs_visibles": True,
            "especes_masquees": [a],
        },
    )
    assert regle_en_place.status_code == 200, regle_en_place.text
    # L'espèce masquée ne se devine pas par son tarif ; l'acteur garde le sien dans ses réglages
    visible = (await client.get(vue, headers=agent_headers)).json()
    assert _codes(visible["especes"]) == [b]
    assert [t["espece"] for t in visible["tarifs"]] == [b] and visible["tarifs_affiches"] is True
    assert [t["espece"] for t in regle_en_place.json()["mes_tarifs"]] == [a, b]

    # Toutes les espèces tarifées sont masquées : plus aucun tarif ne s'affiche
    await client.patch(MOI, headers=moi, json={"especes_masquees": [a, b]})
    cache = (await client.get(vue, headers=agent_headers)).json()
    assert cache["tarifs"] == [] and cache["tarifs_affiches"] is False

    # Unité retirée du paramétrage : le tarif enregistré dans cette unité ne s'affiche plus
    await client.patch(MOI, headers=moi, json={"especes_masquees": []})
    regle(unites_tarif=["kg"])
    apres = (await client.get(vue, headers=agent_headers)).json()
    assert [(t["espece"], t["unite"]) for t in apres["tarifs"]] == [(a, "kg")]
    # Le message de refus ne propose que les unités du paramétrage
    refus = await client.patch(
        MOI, headers=moi, json={"tarifs": [{"espece": a, "unite": "unite", "prix_fcfa": 100}]}
    )
    assert refus.status_code == 400 and refus.json()["code"] == "UNITE_INVALIDE"
    assert "« au kilo »" in refus.json()["detail"] and "à l'unité" not in refus.json()["detail"]
    # La casse du paramétrage ne compte pas
    regle(unites_tarif=["KG", " Unite "])
    accepte = await client.patch(
        MOI, headers=moi, json={"tarifs": [{"espece": a, "unite": "unite", "prix_fcfa": 100}]}
    )
    assert accepte.status_code == 200, accepte.text
    assert accepte.json()["limites"]["unites_tarif"] == ["kg", "unite"]


@pytest.mark.asyncio
async def test_l2_f_capture_datee_dans_le_futur_hors_de_la_fenetre(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    a, _b, _protegee = _especes()
    p = await creer_pecheur(client, agent_headers, tag="L2F")
    e = await creer_embarcation(client, agent_headers, p["id"], tag="L2F")
    moi = await connexion(client, p["email"])
    await inserer_capture(
        engine,
        pecheur_id=p["id"],
        embarcation_id=e["id"],
        espece=a,
        quantite_kg=10.0,
        quand=datetime.now(UTC) + timedelta(days=3),
    )
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        assert (await client.get(MOI, headers=moi)).json()["especes_declarees"] == []
    finally:
        # La capture fictive ne reste pas datée dans le futur dans la base partagée
        passe = instant_isole()
        async with factory() as session:
            await session.execute(
                update(Capture)
                .where(Capture.pecheur_id == uuid.UUID(p["id"]))
                .values(date_capture=passe, synchronise_a=passe)
            )
            await session.commit()
    assert _codes((await client.get(MOI, headers=moi)).json()["especes_declarees"]) == [a]


# --------------------------------------------------------------------------- #
# Texte de présentation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l2_f_presentation_en_texte_simple_et_sans_coordonnees(
    client: AsyncClient, agent_headers: dict, regle
) -> None:
    p = await creer_pecheur(client, agent_headers, tag="L2F")
    moi = await connexion(client, p["email"])

    # Caractères invisibles et marques de direction : refus en clair, jamais une erreur du serveur
    for invisible in ("\x00", "\x07", "\x1b", "\u202e", "\u2066"):
        resp = await client.patch(
            MOI, headers=moi, json={"presentation": f"Texte{invisible}fictif"}
        )
        assert resp.status_code == 422, (repr(invisible), resp.text)
        assert resp.json()["detail"].startswith("Présentation : seul du texte simple")
    illisible = await client.patch(
        MOI,
        headers={**moi, "Content-Type": "application/json"},
        content=b'{"presentation": "Texte \\ud800 fictif"}',
    )
    assert illisible.status_code == 422 and "Input should" not in illisible.text

    # Les retours à la ligne sont gardés, ramenés à un seul caractère
    lignes = await client.patch(
        MOI, headers=moi, json={"presentation": "Première ligne.\r\nSeconde ligne."}
    )
    assert lignes.status_code == 200, lignes.text
    assert lignes.json()["presentation"] == "Première ligne.\nSeconde ligne."

    # Coordonnées : numéro de téléphone, adresse électronique, adresse de site
    refusees = (
        "Appelez-moi au 077 65 43 21.",
        "Joignable au +241 60 00 00 00",
        "Numéro : 077.65.43.21",
        "Écrivez à pecheur.fictif@example.com",
        "Mon site : www.exemple-fictif.test",
        "Voir https://exemple-fictif.test/page",
    )
    for texte in refusees:
        resp = await client.patch(MOI, headers=moi, json={"presentation": texte})
        assert resp.status_code == 400, (texte, resp.text)
        assert resp.json()["code"] == "PRESENTATION_COORDONNEES"
        assert resp.json()["detail"].startswith("Votre présentation ne doit pas contenir")
    # La présentation en place n'a pas changé
    assert (await client.get(MOI, headers=moi)).json()["presentation"].startswith("Première")

    # Une année, une date, une quantité ou un prix ne sont pas pris pour un numéro
    admise = "Pêche à la ligne depuis 1998, 12 pirogues, 150 000 FCFA la sortie (texte fictif)."
    for texte in ("Coopérative fictive créée le 12/03/2015.", admise):
        resp = await client.patch(MOI, headers=moi, json={"presentation": texte})
        assert resp.status_code == 200 and resp.json()["presentation"] == texte, texte

    # Non codé en dur : le seuil et le contrôle lui-même viennent du paramétrage
    regle(presentation_chiffres_max=12)
    assert (
        await client.patch(MOI, headers=moi, json={"presentation": refusees[0]})
    ).status_code == 200
    regle(presentation_chiffres_max=3)
    assert (await client.patch(MOI, headers=moi, json={"presentation": admise})).status_code == 400
    regle(presentation_sans_coordonnees=False)
    assert (
        await client.patch(MOI, headers=moi, json={"presentation": refusees[3]})
    ).status_code == 200


@pytest.mark.asyncio
async def test_l2_f_page_publique_non_conservee_et_parametrage_absent(
    client: AsyncClient, agent_headers: dict, regle, tmp_path
) -> None:
    p = await creer_pecheur(client, agent_headers, tag="L2F")
    moi = await connexion(client, p["email"])
    ouverte = await client.patch(MOI, headers=moi, json={"ouvert_au_public": True})
    chemin = f"/api/v1/public/profils/{ouverte.json()['lien_public'].rsplit('/', 1)[1]}"

    publique = await client.get(chemin)
    assert publique.status_code == 200
    # Une page refermée ne doit pas rester servie par un intermédiaire
    assert publique.headers["cache-control"] == "no-store"

    # Paramétrage illisible : service indisponible, sans nommer le fichier au public
    (tmp_path / "profil_acteur.json").write_text("{ illisible", encoding="utf-8")
    casse = await client.get(chemin)
    assert casse.status_code == 503 and casse.json()["code"] == "REGLE_INDISPONIBLE"
    assert "profil_acteur" not in casse.text and "json" not in casse.text.lower()


@pytest.mark.asyncio
async def test_l2_f_page_d_un_acteur_inactif_illisible(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Décision du porteur (2026-11-24) : pêcheur suspendu, licence expirée ou organisation
    désactivée, la page n'est lisible ni des comptes connectés ni du public ; l'acteur
    garde l'accès à la sienne."""
    p, _e, moi = await _pecheur_avec_captures(client, agent_headers, engine)
    ouverte = await client.patch(MOI, headers=moi, json={"ouvert_au_public": True})
    publique = f"/api/v1/public/profils/{ouverte.json()['lien_public'].rsplit('/', 1)[1]}"
    vue = f"/api/v1/profils/pecheurs/{p['id']}"
    autre = await creer_pecheur(client, agent_headers, tag="L2F")
    h_autre = await connexion(client, autre["email"])

    async def lisible(attendu: int) -> None:
        for chemin, headers in ((vue, agent_headers), (vue, h_autre), (publique, None)):
            resp = await client.get(chemin, headers=headers)
            assert resp.status_code == attendu, (chemin, resp.text)
            if attendu == 404:
                assert resp.json()["code"] == "PROFIL_NOT_FOUND"
        assert (await client.get(MOI, headers=moi)).status_code == 200

    await lisible(200)
    for corps in ({"statut": "suspendu"}, {"date_delivrance_licence": "2000-01-01"}):
        modif = await client.patch(f"/api/v1/pecheurs/{p['id']}", headers=agent_headers, json=corps)
        assert modif.status_code == 200, modif.text
        await lisible(404)
        retour = {"statut": "actif"} if "statut" in corps else {"date_delivrance_licence": None}
        await client.patch(f"/api/v1/pecheurs/{p['id']}", headers=agent_headers, json=retour)
        await lisible(200)

    # Organisation désactivée : page fermée aux comptes connectés, ouverte à son compte
    org = await creer_organisation(client, agent_headers, tag="L2F")
    _, compte = await creer_compte(engine, RoleUtilisateur.organisation, organisation_id=org["id"])
    page_org = f"/api/v1/profils/organisations/{org['id']}"
    assert (await client.get(page_org, headers=agent_headers)).status_code == 200
    await client.patch(
        f"/api/v1/organisations/{org['id']}", headers=agent_headers, json={"actif": False}
    )
    assert (await client.get(page_org, headers=agent_headers)).status_code == 404
    assert (await client.get(page_org, headers=h_autre)).status_code == 404
    assert (await client.get(MOI, headers=compte)).status_code == 200


@pytest.mark.asyncio
async def test_l2_f_deux_enregistrements_simultanes_de_la_meme_page(
    client: AsyncClient, agent_headers: dict, regle
) -> None:
    """Deux enregistrements au même instant d'une page encore jamais réglée : les deux
    aboutissent et les deux réglages sont gardés (aucune erreur, aucune perte)."""
    for _ in range(3):
        p = await creer_pecheur(client, agent_headers, tag="L2F")
        moi = await connexion(client, p["email"])
        premier, second = await asyncio.gather(
            client.patch(MOI, headers=moi, json={"presentation": "Texte fictif simultané."}),
            client.patch(MOI, headers=moi, json={"ouvert_au_public": True}),
        )
        assert premier.status_code == 200, premier.text
        assert second.status_code == 200, second.text
        profil = (await client.get(MOI, headers=moi)).json()
        assert profil["presentation"] == "Texte fictif simultané."
        assert profil["ouvert_au_public"] is True and profil["lien_public"]


def test_l2_f_parametrage_du_depot_et_statut_des_regles() -> None:
    """Visibilité et tarifs sont décidés ; espèces et vitrine publique restent « Proposé »."""
    contenu = charger_regles("profil_acteur")
    lu, entete = regle_profil()
    assert entete["statut"] == "Proposé"
    assert lu.unites_tarif == ["kg", "unite"]
    assert set(contenu["explications"]) == set(contenu["profil"])
    regles = contenu["regles"]
    for decidee in ("visibilite", "tarifs"):
        assert regles[decidee]["statut"].startswith("Décidée")
    # Validées par le porteur le 2026-11-24
    for decidee in (
        "presentation_sans_coordonnees",
        "referentiel_indisponible",
        "tarif_espece_masquee",
        "acteur_inactif",
    ):
        assert regles[decidee]["statut"].startswith("Décidée"), decidee
    proposees = ("especes", "especes_protegees", "vitrine_publique", "inscription_embarcation")
    for proposee in proposees:
        assert regles[proposee]["statut"] == "Proposé", proposee
        assert regles[proposee]["valideurs"], proposee
    assert datetime.now(UTC) - timedelta(days=lu.especes_periode_jours) < datetime.now(UTC)
