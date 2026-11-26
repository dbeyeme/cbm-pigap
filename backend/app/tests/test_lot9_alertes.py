"""Lot 9 : traitement des alertes et journal de traçabilité. Données fictives."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.regles import charger_regles
from app.db.enums import NiveauGravite, RoleUtilisateur, StatutAlerte, TypeAlerte
from app.db.models import Alerte
from app.tests.aides import copier_regles, creer_compte, creer_embarcation, creer_pecheur

ALERTES = "/api/v1/alertes"


async def _alerte(
    engine,
    *,
    declencheur: dict,
    embarcation_id: str | None = None,
    quand: datetime | None = None,
    gravite: NiveauGravite = NiveauGravite.critique,
    type_alerte: TypeAlerte = TypeAlerte.zone_interdite,
) -> str:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        alerte = Alerte(
            type=type_alerte,
            niveau_gravite=gravite,
            embarcation_id=uuid.UUID(embarcation_id) if embarcation_id else None,
            declencheur=declencheur,
            horodatage=quand or datetime.now(UTC),
            statut=StatutAlerte.nouvelle,
        )
        session.add(alerte)
        await session.commit()
        return str(alerte.id)


def _zone_interdite(nom: str = "Réserve fictive de la Pointe") -> dict:
    return {
        "regle": "intrusion_zone_interdite",
        "fingerprint": f"essai:{uuid.uuid4().hex}",
        "zone_id": str(uuid.uuid4()),
        "zone_nom": nom,
        "position": {"type": "Point", "coordinates": [9.4536, 0.3912]},
        "horodatage": "2026-11-20T13:05:00+00:00",
    }


async def _traiter(client, headers, alerte_id, etat, commentaire="Commentaire fictif d'essai."):
    return await client.post(
        f"{ALERTES}/{alerte_id}/traitements",
        headers=headers,
        json={"etat": etat, "commentaire": commentaire},
    )


@pytest.mark.asyncio
async def test_l9_description_detaillee_et_lisible(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    """Ce qui s'est passé, où, quand, quelle règle, quelles données ; rien de technique."""
    p = await creer_pecheur(client, agent_headers, tag="L9")
    e = await creer_embarcation(client, agent_headers, p["id"], tag="L9")
    alerte_id = await _alerte(engine, declencheur=_zone_interdite(), embarcation_id=e["id"])

    resp = await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    d = body["description"]
    assert d["titre"] == "Présence en zone interdite"
    assert d["resume"] == (
        f"L'embarcation « {e['nom']} » ({e['immatriculation']}) a été localisée dans la zone "
        "interdite « Réserve fictive de la Pointe »."
    )
    # Heure de Libreville (UTC+1), en clair
    assert d["quand"] == "20/11/2026 à 14 h 05"
    assert d["ou"] == "Réserve fictive de la Pointe ; 0,3912° N, 9,4536° E"
    assert d["regle"] == {
        "code": "intrusion_zone_interdite",
        "libelle": "Présence en zone interdite",
    }
    assert d["embarcation"]["immatriculation"] == e["immatriculation"]
    assert d["donnees"] == [{"libelle": "Zone", "valeur": "Réserve fictive de la Pointe"}]
    assert body["etat_traitement"] == "a_traiter" and body["etat_libelle"] == "À traiter"
    assert body["ouverte"] is True and body["journal"] == []
    assert {t["code"] for t in body["transitions_possibles"]} == {
        "prise_en_charge",
        "cloturee_non_fondee",
    }
    # La liste porte la même description
    liste = await client.get(ALERTES, headers=agent_headers, params={"embarcation_id": e["id"]})
    assert liste.json()[0]["description"] == d

    # Règle inconnue ou donnée manquante : description générique, jamais d'erreur
    autre = await _alerte(engine, declencheur={"regle": "regle_inconnue", "valeur_x": 3.5})
    generique = (await client.get(f"{ALERTES}/{autre}", headers=agent_headers)).json()
    assert generique["description"]["resume"] == (
        "Alerte « regle inconnue » concernant l'embarcation non identifiée."
    )
    assert generique["description"]["donnees"] == [{"libelle": "Valeur x", "valeur": "3,5"}]
    incomplete = await _alerte(engine, declencheur={"regle": "intrusion_zone_interdite"})
    resume = (await client.get(f"{ALERTES}/{incomplete}", headers=agent_headers)).json()
    assert resume["description"]["resume"].startswith("Alerte « Présence en zone interdite »")


@pytest.mark.asyncio
async def test_l9_etats_successifs_commentaire_et_journal(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    autorite_id, autorite = await creer_compte(engine, RoleUtilisateur.autorite)

    parcours = [
        (agent_headers, "prise_en_charge", "nouvelle"),
        (autorite, "en_verification", "nouvelle"),
        (agent_headers, "cloturee_fondee", "traitee"),
        (autorite, "prise_en_charge", "nouvelle"),
        (agent_headers, "cloturee_non_fondee", "ignoree"),
    ]
    for i, (headers, etat, statut) in enumerate(parcours):
        resp = await _traiter(
            client, headers, alerte_id, etat, f"Étape {i + 1} : vérification fictive."
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["etat_traitement"] == etat
        # Le statut historique suit : écrans et compteurs existants inchangés
        assert body["statut"] == statut
        assert len(body["journal"]) == i + 1

    journal = body["journal"]
    assert [(j["etat_avant"], j["etat_apres"]) for j in journal] == [
        ("a_traiter", "prise_en_charge"),
        ("prise_en_charge", "en_verification"),
        ("en_verification", "cloturee_fondee"),
        ("cloturee_fondee", "prise_en_charge"),
        ("prise_en_charge", "cloturee_non_fondee"),
    ]
    assert journal[0]["commentaire"] == "Étape 1 : vérification fictive."
    assert journal[0]["etat_apres_libelle"] == "Prise en charge"
    assert journal[1]["auteur_role"] == "autorite" and journal[1]["auteur_nom"].startswith("Compte")
    assert (
        journal[0]["auteur_nom"] == "Agent Test" and journal[0]["auteur_role"] == "agent_controle"
    )
    assert {j["origine"] for j in journal} == {"traitement"}
    instants = [datetime.fromisoformat(j["horodatage"]) for j in journal]
    assert instants == sorted(instants)
    assert body["ouverte"] is False

    # Filtre par état de traitement
    clos = await client.get(
        ALERTES, headers=agent_headers, params={"etat": "cloturee_non_fondee", "limit": 500}
    )
    assert alerte_id in {a["id"] for a in clos.json()}
    assert autorite_id  # compte créé pour l'essai


@pytest.mark.asyncio
async def test_l9_refus_en_clair(client: AsyncClient, agent_headers: dict, engine) -> None:
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    cas = [
        ("prise_en_charge", "", 422, "COMMENTAIRE_OBLIGATOIRE"),
        ("prise_en_charge", "   ok ", 422, "COMMENTAIRE_OBLIGATOIRE"),
        ("prise_en_charge", "x" * 2001, 422, "COMMENTAIRE_TROP_LONG"),
        ("cloturee_fondee", "Clôture directe fictive.", 409, "TRANSITION_NON_PERMISE"),
        ("etat_invente", "Commentaire fictif.", 422, "ETAT_INCONNU"),
        ("a_traiter", "Commentaire fictif.", 409, "ETAT_INCHANGE"),
    ]
    for etat, commentaire, statut, code in cas:
        resp = await _traiter(client, agent_headers, alerte_id, etat, commentaire)
        assert (resp.status_code, resp.json()["code"]) == (statut, code), (etat, resp.text)
        assert not resp.json()["detail"].startswith(code)
    refus = await _traiter(client, agent_headers, alerte_id, "cloturee_fondee")
    assert "« Prise en charge »" in refus.json()["detail"]
    invisible = await _traiter(client, agent_headers, alerte_id, "prise_en_charge", "Texte\x00nul")
    assert invisible.status_code == 422
    # Rien n'a changé, rien n'est inscrit
    detail = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()
    assert detail["etat_traitement"] == "a_traiter" and detail["journal"] == []
    inconnue = await _traiter(client, agent_headers, uuid.uuid4(), "prise_en_charge")
    assert inconnue.status_code == 404 and inconnue.json()["code"] == "ALERTE_NOT_FOUND"
    assert (await client.get(f"{ALERTES}/{uuid.uuid4()}", headers=agent_headers)).status_code == 404


@pytest.mark.asyncio
async def test_l9_ancien_ecran_compatible_et_journalise(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    traitee = await client.patch(
        f"{ALERTES}/{alerte_id}", headers=agent_headers, json={"statut": "traitee"}
    )
    assert traitee.status_code == 200, traitee.text
    assert traitee.json()["statut"] == "traitee"
    assert traitee.json()["etat_traitement"] == "cloturee_fondee"
    rouverte = await client.patch(
        f"{ALERTES}/{alerte_id}",
        headers=agent_headers,
        json={"statut": "nouvelle", "commentaire": "Réouverture fictive."},
    )
    assert rouverte.json()["etat_traitement"] == "a_traiter"
    journal = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()["journal"]
    assert [j["origine"] for j in journal] == ["ancien_ecran", "ancien_ecran"]
    assert journal[0]["commentaire"].startswith("Changement fait depuis l'ancien écran")
    assert journal[1]["commentaire"] == "Réouverture fictive."

    # Déjà dans un état qui correspond au statut demandé : rien ne change, rien n'est inscrit
    await _traiter(client, agent_headers, alerte_id, "prise_en_charge")
    meme = await client.patch(
        f"{ALERTES}/{alerte_id}", headers=agent_headers, json={"statut": "nouvelle"}
    )
    assert meme.status_code == 200 and meme.json()["etat_traitement"] == "prise_en_charge"
    detail = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()
    assert len(detail["journal"]) == 3


@pytest.mark.asyncio
async def test_l9_journal_ni_modifiable_ni_supprimable(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    await _traiter(client, agent_headers, alerte_id, "prise_en_charge")
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    for requete in (
        "UPDATE alertes_journal SET commentaire = 'falsifié' WHERE alerte_id = :id",
        "DELETE FROM alertes_journal WHERE alerte_id = :id",
    ):
        async with factory() as session:
            with pytest.raises(DBAPIError):
                await session.execute(text(requete), {"id": alerte_id})
            await session.rollback()
    # Seule exception : le compte de l'auteur supprimé, son nom figé reste au journal
    async with factory() as session:
        await session.execute(
            text("UPDATE alertes_journal SET auteur_id = NULL WHERE alerte_id = :id"),
            {"id": alerte_id},
        )
        await session.commit()
    # L'alerte elle-même ne peut pas être supprimée tant qu'elle a un journal
    async with factory() as session:
        with pytest.raises(DBAPIError):
            await session.execute(text("DELETE FROM alertes WHERE id = :id"), {"id": alerte_id})
        await session.rollback()
    # Aucun point d'accès d'écriture sur le journal
    for methode in ("put", "patch", "delete"):
        resp = await getattr(client, methode)(
            f"{ALERTES}/{alerte_id}/traitements", headers=agent_headers
        )
        assert resp.status_code == 405
    detail = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()
    assert detail["journal"][0]["commentaire"] == "Commentaire fictif d'essai."


@pytest.mark.asyncio
async def test_l9_roles(client: AsyncClient, agent_headers: dict, engine) -> None:
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    detail, traitements = f"{ALERTES}/{alerte_id}", f"{ALERTES}/{alerte_id}/traitements"
    corps = {"etat": "prise_en_charge", "commentaire": "Commentaire fictif."}

    for chemin in (ALERTES, f"{ALERTES}/etats", detail):
        assert (await client.get(chemin)).status_code == 401
    assert (await client.post(traitements, json=corps)).status_code == 401

    # Chercheur : liste et états, mais ni journal nominatif ni traitement
    _, chercheur = await creer_compte(engine, RoleUtilisateur.chercheur)
    assert (await client.get(ALERTES, headers=chercheur)).status_code == 200
    assert (await client.get(f"{ALERTES}/etats", headers=chercheur)).status_code == 200
    assert (await client.get(detail, headers=chercheur)).status_code == 403
    assert (await client.post(traitements, headers=chercheur, json=corps)).status_code == 403
    assert (
        await client.patch(detail, headers=chercheur, json={"statut": "traitee"})
    ).status_code == 403

    for role in (RoleUtilisateur.pecheur, RoleUtilisateur.organisation):
        _, h = await creer_compte(engine, role)
        for chemin in (ALERTES, detail):
            assert (await client.get(chemin, headers=h)).status_code == 403
        assert (await client.post(traitements, headers=h, json=corps)).status_code == 403

    for role in (RoleUtilisateur.autorite, RoleUtilisateur.admin):
        _, h = await creer_compte(engine, role)
        assert (await client.get(detail, headers=h)).status_code == 200


@pytest.mark.asyncio
async def test_l9_filtres_et_pagination(client: AsyncClient, agent_headers: dict, engine) -> None:
    code = f"essai_lot9_{uuid.uuid4().hex[:8]}"
    t0 = datetime(2026, 11, 1, 8, 0, tzinfo=UTC)
    ids = []
    for i in range(7):
        ids.append(
            await _alerte(
                engine,
                declencheur={"regle": code, "rang": i},
                quand=t0 + timedelta(hours=i),
                gravite=NiveauGravite.critique if i % 2 else NiveauGravite.info,
            )
        )
    base = {"regle": code}

    page1 = await client.get(ALERTES, headers=agent_headers, params={**base, "limit": 3})
    assert page1.status_code == 200 and page1.headers["x-total-count"] == "7"
    page3 = await client.get(
        ALERTES, headers=agent_headers, params={**base, "limit": 3, "offset": 6}
    )
    # De la plus récente à la plus ancienne, sans recouvrement
    assert [a["id"] for a in page1.json()] == ids[::-1][:3]
    assert [a["id"] for a in page3.json()] == [ids[0]]

    critiques = await client.get(
        ALERTES, headers=agent_headers, params={**base, "gravite": "critique"}
    )
    assert critiques.headers["x-total-count"] == "3"
    periode = await client.get(
        ALERTES,
        headers=agent_headers,
        params={
            **base,
            "depuis": (t0 + timedelta(hours=2)).isoformat(),
            "jusqu_a": (t0 + timedelta(hours=4)).isoformat(),
        },
    )
    assert [a["id"] for a in periode.json()] == [ids[3], ids[2]]
    await _traiter(client, agent_headers, ids[0], "prise_en_charge")
    plusieurs = await client.get(
        ALERTES,
        headers=agent_headers,
        params=[("regle", code), ("etat", "prise_en_charge"), ("etat", "en_verification")],
    )
    assert [a["id"] for a in plusieurs.json()] == [ids[0]]
    # Sans précision, la liste garde son ancienne taille de page (100)
    assert len((await client.get(ALERTES, headers=agent_headers)).json()) <= 100

    for params, code_attendu in (
        ({"limit": 501}, "FILTRE_INVALIDE"),
        ({"etat": "inconnu"}, "FILTRE_INVALIDE"),
        ({"depuis": t0.isoformat(), "jusqu_a": t0.isoformat()}, "FILTRE_INVALIDE"),
        ({"gravite": "extreme"}, "VALIDATION_ERROR"),
    ):
        resp = await client.get(ALERTES, headers=agent_headers, params=params)
        assert resp.status_code == 422 and resp.json()["code"] == code_attendu, params


@pytest.mark.asyncio
async def test_l9_deux_traitements_simultanes(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    premier, second = await asyncio.gather(
        _traiter(client, agent_headers, alerte_id, "prise_en_charge", "Premier agent fictif."),
        _traiter(client, agent_headers, alerte_id, "prise_en_charge", "Second agent fictif."),
    )
    assert sorted([premier.status_code, second.status_code]) == [200, 409]
    detail = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()
    assert len(detail["journal"]) == 1


@pytest.mark.asyncio
async def test_l9_regles_non_codees_en_dur(
    client: AsyncClient, agent_headers: dict, engine, tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(
        tmp_path,
        "alertes_traitement",
        {
            "traitement": {
                "transitions": {
                    "a_traiter": ["cloturee_fondee"],
                    "prise_en_charge": [],
                    "en_verification": [],
                    "cloturee_fondee": [],
                    "cloturee_non_fondee": [],
                },
                "commentaire_min_caracteres": 20,
            }
        },
    )
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    court = await _traiter(client, agent_headers, alerte_id, "cloturee_fondee", "Trop court.")
    assert court.status_code == 422 and "20 caractères" in court.json()["detail"]
    ok = await _traiter(
        client, agent_headers, alerte_id, "cloturee_fondee", "Clôture directe permise par l'essai."
    )
    assert ok.status_code == 200, ok.text
    assert (await _traiter(client, agent_headers, alerte_id, "prise_en_charge")).status_code == 409
    etats = (await client.get(f"{ALERTES}/etats", headers=agent_headers)).json()
    assert etats["commentaire_min_caracteres"] == 20

    # Paramétrage incohérent : service indisponible, sans nommer le fichier
    copier_regles(tmp_path, "alertes_traitement", {"traitement": {"etat_initial": "inexistant"}})
    casse = await client.get(ALERTES, headers=agent_headers)
    assert casse.status_code == 503 and casse.json()["code"] == "REGLE_INDISPONIBLE"


def test_l9_parametrage_et_migration() -> None:
    contenu = charger_regles("alertes_traitement")
    assert contenu["statut"] == "Proposé" and contenu["valideurs"] == ["Christian"]
    assert [e["code"] for e in contenu["traitement"]["etats"]] == [
        "a_traiter",
        "prise_en_charge",
        "en_verification",
        "cloturee_fondee",
        "cloturee_non_fondee",
    ]
    assert set(contenu["explications"]) == set(contenu["traitement"])
    from pathlib import Path

    racine = Path(__file__).resolve().parents[2]
    config = Config(str(racine / "alembic.ini"))
    config.set_main_option("script_location", str(racine / "alembic"))
    script = ScriptDirectory.from_config(config)
    assert script.get_revision("b1d4e5f6a738").down_revision == "a9c3e4f5b627"
    assert script.get_revision("c2e5f6a7b849").down_revision == "b1d4e5f6a738"


@pytest.mark.asyncio
async def test_l9_revue_etat_initial_dates_et_modeles(
    client: AsyncClient, agent_headers: dict, engine, tmp_path, monkeypatch
) -> None:
    """Retours de relecture : état de création lu dans le paramétrage, dates sans fuseau,
    valeurs codées traduites, modèle mal formé refusé, état retiré sans impasse."""
    # Toute alerte créée reçoit l'état initial du paramétrage, y compris celles des quotas
    alerte_id = await _alerte(
        engine,
        declencheur={"regle": "sortie_limite_geographique", "limite": "zee_gabon", "espece": "x"},
    )
    detail = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()
    assert detail["etat_traitement"] == "a_traiter"
    valeurs = {d["libelle"]: d["valeur"] for d in detail["description"]["donnees"]}
    assert valeurs["Limite appliquée"] == "Eaux gabonaises (ZEE et marge côtière)"

    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(
        tmp_path,
        "alertes_traitement",
        {
            "traitement": {
                "etats": [
                    {
                        "code": "a_examiner",
                        "libelle": "À examiner",
                        "ouvert": True,
                        "statut_historique": "nouvelle",
                    },
                    {
                        "code": "classee",
                        "libelle": "Classée",
                        "ouvert": False,
                        "statut_historique": "traitee",
                    },
                ],
                "etat_initial": "a_examiner",
                "transitions": {"a_examiner": ["classee"], "classee": []},
                "ancien_ecran": {
                    "statut_vers_etat": {
                        "nouvelle": "a_examiner",
                        "traitee": "classee",
                        "ignoree": "classee",
                    },
                    "controle_des_transitions": True,
                    "commentaire_par_defaut": "Ancien écran (essai).",
                },
            }
        },
    )
    # La fusion clé par clé garde les anciennes transitions : on les remplace entièrement
    chemin = tmp_path / "alertes_traitement.json"
    contenu = json.loads(chemin.read_text(encoding="utf-8"))
    contenu["traitement"]["transitions"] = {"a_examiner": ["classee"], "classee": []}
    chemin.write_text(json.dumps(contenu, ensure_ascii=False), encoding="utf-8")
    nouvelle = await _alerte(engine, declencheur=_zone_interdite())
    lue = (await client.get(f"{ALERTES}/{nouvelle}", headers=agent_headers)).json()
    assert lue["etat_traitement"] == "a_examiner" and lue["ouverte"] is True
    # Une alerte dans un état retiré du paramétrage peut revenir à l'état initial
    assert lue["etat_traitement"] != detail["etat_traitement"]
    ancienne = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()
    assert [t["code"] for t in ancienne["transitions_possibles"]] == ["a_examiner"]
    sortie = await _traiter(client, agent_headers, alerte_id, "a_examiner")
    assert sortie.status_code == 200, sortie.text
    # Ancien écran avec contrôle des transitions : un passage non prévu est refusé
    refus = await client.patch(
        f"{ALERTES}/{nouvelle}", headers=agent_headers, json={"statut": "ignoree"}
    )
    assert refus.status_code == 200 and refus.json()["etat_traitement"] == "classee"
    retour = await client.patch(
        f"{ALERTES}/{nouvelle}", headers=agent_headers, json={"statut": "nouvelle"}
    )
    assert retour.status_code == 409 and retour.json()["code"] == "TRANSITION_NON_PERMISE"

    # Modèle de description avec un accès à un attribut : paramétrage refusé (503)
    copier_regles(tmp_path, "alertes_traitement", {"modele_par_defaut": "{embarcation.nom}"})
    casse = await client.get(ALERTES, headers=agent_headers)
    assert casse.status_code == 503 and casse.json()["code"] == "REGLE_INDISPONIBLE"
    monkeypatch.delenv("PIGAP_REGLES_DIR")

    # Dates sans fuseau, mêlées à des dates avec fuseau : lues en temps universel
    mixte = await client.get(
        ALERTES,
        headers=agent_headers,
        params={"depuis": "2026-11-01T00:00:00", "jusqu_a": "2026-11-24T00:00:00Z"},
    )
    assert mixte.status_code == 200, mixte.text
    # Alerte inconnue : 404 avant tout contrôle du commentaire
    inconnue = await _traiter(client, agent_headers, uuid.uuid4(), "prise_en_charge", "x")
    assert inconnue.status_code == 404


@pytest.mark.asyncio
async def test_l9_journal_auteur_ni_remplace_ni_vide(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    alerte_id = await _alerte(engine, declencheur=_zone_interdite())
    await _traiter(client, agent_headers, alerte_id, "prise_en_charge")
    autre_id, _ = await creer_compte(engine, RoleUtilisateur.admin)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    for requete, params in (
        (
            "UPDATE alertes_journal SET auteur_id = :autre WHERE alerte_id = :id",
            {"autre": autre_id, "id": alerte_id},
        ),
        ("TRUNCATE alertes_journal", {}),
    ):
        async with factory() as session:
            with pytest.raises(DBAPIError):
                await session.execute(text(requete), params)
            await session.rollback()
    detail = (await client.get(f"{ALERTES}/{alerte_id}", headers=agent_headers)).json()
    assert len(detail["journal"]) == 1
