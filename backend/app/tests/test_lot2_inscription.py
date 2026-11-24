"""Lot 2, partie E : informations d'inscription complémentaires de l'embarcation.

Toutes facultatives, au statut « Proposé » (valideurs : Christian, DGPA).
Données fictives.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from httpx import AsyncClient

from app.core.errors import ApiError
from app.core.regles import charger_regles
from app.db.models import DemandeLicence, Embarcation
from app.modules.demandes_licence import router as demandes_router
from app.modules.demandes_licence.service import _complements_connus
from app.tests.aides import connexion, creer_embarcation, creer_pecheur

COMPLEMENTS = (
    "mmsi",
    "numero_omi",
    "indicatif_radio",
    "jauge_brute",
    "annee_construction",
    "proprietaire",
    "exploitant",
)


def _mmsi_fictif() -> str:
    return "626" + f"{uuid.uuid4().int % 1_000_000:06d}"


@pytest.mark.asyncio
async def test_l2_e_informations_complementaires_facultatives_et_normalisees(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Acceptation E : rien n'est exigé ; ce qui est saisi est enregistré, mis en forme."""
    pecheur = await creer_pecheur(client, agent_headers, tag="L2E")

    # Sans aucune information complémentaire : inscription inchangée
    simple = await creer_embarcation(client, agent_headers, pecheur["id"], tag="L2E")
    assert {cle: simple[cle] for cle in COMPLEMENTS} == dict.fromkeys(COMPLEMENTS)

    mmsi = _mmsi_fictif()
    complete = await creer_embarcation(
        client,
        agent_headers,
        pecheur["id"],
        tag="L2E",
        mmsi=f"{mmsi[:3]} {mmsi[3:6]} {mmsi[6:]}",
        numero_omi="IMO 9074729",
        indicatif_radio="tr-ab7",
        jauge_brute=12.5,
        annee_construction=2015,
        proprietaire="  Armement fictif SARL ",
        exploitant="Coopérative fictive de l'Estuaire",
    )
    attendu = {
        "mmsi": mmsi,
        "numero_omi": "9074729",
        "indicatif_radio": "TRAB7",
        "jauge_brute": 12.5,
        "annee_construction": 2015,
        "proprietaire": "Armement fictif SARL",
        "exploitant": "Coopérative fictive de l'Estuaire",
    }
    assert {cle: complete[cle] for cle in COMPLEMENTS} == attendu

    relue = await client.get(f"/api/v1/embarcations/{complete['id']}", headers=agent_headers)
    assert relue.status_code == 200
    assert {cle: relue.json()[cle] for cle in COMPLEMENTS} == attendu

    # Correction : une valeur changée, une autre effacée, le reste intact
    corrigee = await client.patch(
        f"/api/v1/embarcations/{complete['id']}",
        headers=agent_headers,
        json={"annee_construction": 2016, "exploitant": None, "indicatif_radio": ""},
    )
    assert corrigee.status_code == 200, corrigee.text
    body = corrigee.json()
    assert body["annee_construction"] == 2016
    assert body["exploitant"] is None and body["indicatif_radio"] is None
    assert body["mmsi"] == mmsi and body["proprietaire"] == "Armement fictif SARL"


@pytest.mark.asyncio
async def test_l2_e_formats_refuses_avec_un_message_clair(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur = await creer_pecheur(client, agent_headers, tag="L2E")
    cas = [
        ({"mmsi": "62612345"}, "MMSI : le MMSI compte 9 chiffres"),
        ({"mmsi": "62612345A"}, "MMSI"),
        ({"numero_omi": "907472"}, "Numéro OMI : le numéro OMI compte 7 chiffres"),
        ({"indicatif_radio": "T"}, "Indicatif radio"),
        ({"indicatif_radio": "TR@B7"}, "Indicatif radio"),
        ({"annee_construction": datetime.now(UTC).year + 1}, "Année de construction"),
        ({"annee_construction": 1800}, "Année de construction"),
        ({"jauge_brute": 0}, "Jauge brute"),
    ]
    for champs, debut in cas:
        resp = await client.post(
            "/api/v1/embarcations",
            headers=agent_headers,
            json={
                "pecheur_id": pecheur["id"],
                "nom": "Pirogue L2E refus",
                "immatriculation": f"GA-L2E-{uuid.uuid4().hex[:8]}",
                **champs,
            },
        )
        assert resp.status_code == 422, (champs, resp.text)
        assert resp.json()["code"] == "VALIDATION_ERROR"
        assert resp.json()["detail"].startswith(debut), (champs, resp.json()["detail"])


@pytest.mark.asyncio
async def test_l2_e_demande_de_licence_reporte_les_informations_au_registre(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Les informations saisies à la demande publique arrivent sur l'embarcation créée."""
    suffix = uuid.uuid4().hex[:8]
    mmsi = _mmsi_fictif()
    demande = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": f"Fictif{suffix}",
            "prenom": "Demandeur",
            "email": f"demande.l2e.{suffix}@example.com",
            "embarcation_nom": f"Pirogue L2E demande {suffix}",
            "embarcation_type": "pirogue",
            "embarcation_complements": {
                "mmsi": mmsi,
                "annee_construction": 2012,
                "proprietaire": "Propriétaire fictif",
                "exploitant": "",
            },
        },
    )
    assert demande.status_code == 201, demande.text
    # Seul ce qui est renseigné est conservé
    assert demande.json()["embarcation_complements"] == {
        "mmsi": mmsi,
        "annee_construction": 2012,
        "proprietaire": "Propriétaire fictif",
    }

    approuvee = await client.post(
        f"/api/v1/demandes-licence/{demande.json()['id']}/approve",
        headers=agent_headers,
        json={"mot_de_passe": "PecheurPass1!"},
    )
    assert approuvee.status_code == 200, approuvee.text
    embarcations = await client.get(
        "/api/v1/embarcations",
        headers=agent_headers,
        params={"pecheur_id": approuvee.json()["pecheur_id"]},
    )
    (inscrite,) = embarcations.json()
    assert inscrite["mmsi"] == mmsi
    assert inscrite["annee_construction"] == 2012
    assert inscrite["proprietaire"] == "Propriétaire fictif"
    assert inscrite["exploitant"] is None and inscrite["numero_omi"] is None

    # Format invalide à la demande : refus en clair, par l'envoi JSON comme par le formulaire
    refus = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Fictif",
            "prenom": "Refus",
            "email": f"refus.l2e.{suffix}@example.com",
            "embarcation_complements": {"mmsi": "123"},
        },
    )
    assert refus.status_code == 422 and "MMSI" in refus.json()["detail"]

    formulaire = {
        "type_demande": "personne_physique",
        "nom": f"Fictif{suffix}",
        "prenom": "Formulaire",
        "email": f"formulaire.l2e.{suffix}@example.com",
        "embarcation_nom": "Pirogue L2E formulaire",
    }
    avec_pieces = await client.post(
        "/api/v1/demandes-licence/with-files",
        data={**formulaire, "embarcation_complements": json.dumps({"numero_omi": "9074729"})},
    )
    assert avec_pieces.status_code == 201, avec_pieces.text
    assert avec_pieces.json()["embarcation_complements"] == {"numero_omi": "9074729"}
    for mauvais, statut in (('{"numero_omi": "12"}', 422), ("pas du JSON", 400), ("[1]", 400)):
        resp = await client.post(
            "/api/v1/demandes-licence/with-files",
            data={**formulaire, "embarcation_complements": mauvais},
        )
        assert resp.status_code == statut, (mauvais, resp.text)


@pytest.mark.asyncio
async def test_l2_e_textes_libres_sans_caractere_invisible(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Propriétaire et exploitant : un caractère invisible est refusé en clair, y compris
    sur la demande publique, sans connexion ; jamais une erreur du serveur."""
    pecheur = await creer_pecheur(client, agent_headers, tag="L2E")
    suffix = uuid.uuid4().hex[:8]
    for champ, valeur, libelle in (
        ("proprietaire", "Armement\x00fictif", "Propriétaire"),
        ("exploitant", "Coopérative\u202efictive", "Exploitant"),
        ("proprietaire", "Deux\nlignes", "Propriétaire"),
    ):
        au_registre = await client.post(
            "/api/v1/embarcations",
            headers=agent_headers,
            json={
                "pecheur_id": pecheur["id"],
                "nom": "Pirogue L2E texte",
                "immatriculation": f"GA-L2E-{uuid.uuid4().hex[:8]}",
                champ: valeur,
            },
        )
        assert au_registre.status_code == 422, (champ, au_registre.text)
        assert au_registre.json()["detail"].startswith(f"{libelle} : seul du texte simple")
        a_la_demande = await client.post(
            "/api/v1/demandes-licence",
            json={
                "type_demande": "personne_physique",
                "nom": "Fictif",
                "prenom": "Texte",
                "email": f"texte.l2e.{suffix}@example.com",
                "embarcation_complements": {champ: valeur},
            },
        )
        assert a_la_demande.status_code == 422, (champ, a_la_demande.text)
        assert libelle in a_la_demande.json()["detail"]

    # Formulaire avec pièces : un texte fait de crochets imbriqués est refusé en clair
    imbrique = "[" * 100_000
    for champ in ("embarcation_complements", "embarcation_equipements"):
        resp = await client.post(
            "/api/v1/demandes-licence/with-files",
            data={
                "type_demande": "personne_physique",
                "nom": "Fictif",
                "prenom": "Imbriqué",
                "email": f"imbrique.l2e.{suffix}@example.com",
                champ: imbrique,
            },
        )
        assert resp.status_code == 400, (champ, resp.text[:200])


def test_l2_e_texte_trop_imbrique_refuse_en_clair(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le décodeur déborde sur un texte trop imbriqué (dès un millier de niveaux selon la
    version de Python) : le formulaire répond par un refus, pas par une erreur du serveur."""

    def deborde(_texte: str) -> object:
        raise RecursionError("imbrication trop profonde")

    monkeypatch.setattr(demandes_router.json, "loads", deborde)
    for decoder, code in (
        (demandes_router._parse_complements, "COMPLEMENTS_INVALIDES"),
        (demandes_router._parse_equipements, "EQUIPEMENTS_INVALIDES"),
    ):
        with pytest.raises(ApiError) as refus:
            decoder("[[[[")
        assert refus.value.status_code == 400 and refus.value.code == code


@pytest.mark.asyncio
async def test_l2_e_messages_de_saisie_en_francais(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Aucun message d'origine en anglais pour les champs du lot, ni rang de liste en libellé."""
    pecheur = await creer_pecheur(client, agent_headers, tag="L2E")
    cas = [
        ({"jauge_brute": 0}, "Jauge brute : doit être supérieur à 0."),
        ({"jauge_brute": "lourde"}, "Jauge brute : format numérique invalide."),
        ({"annee_construction": 2010.5}, "Année de construction : un nombre entier est attendu"),
        ({"proprietaire": 12}, "Propriétaire : un texte est attendu."),
        ({"proprietaire": "x" * 256}, "Propriétaire : maximum 255 caractères."),
    ]
    for champs, attendu in cas:
        resp = await client.post(
            "/api/v1/embarcations",
            headers=agent_headers,
            json={
                "pecheur_id": pecheur["id"],
                "nom": "Pirogue L2E message",
                "immatriculation": f"GA-L2E-{uuid.uuid4().hex[:8]}",
                **champs,
            },
        )
        assert resp.status_code == 422, (champs, resp.text)
        assert resp.json()["detail"].startswith(attendu), (champs, resp.json()["detail"])
        assert "Input should" not in resp.text and "should" not in resp.text

    # Corps illisible : le message nomme les données envoyées, pas un rang de caractère
    illisible = await client.post(
        "/api/v1/embarcations",
        headers={**agent_headers, "Content-Type": "application/json"},
        content=b'{"pecheur_id": ',
    )
    assert illisible.status_code == 422
    assert illisible.json()["detail"] == "Données envoyées : format invalide."

    moi = await connexion(client, pecheur["email"])
    profil = [
        (
            {"tarifs": [{"espece": "x", "unite": "kg", "prix_fcfa": 12.5}]},
            "Prix : un nombre entier",
        ),
        (
            {"tarifs": [{"espece": "x", "unite": "kg", "prix_fcfa": 0}]},
            "Prix : doit être supérieur",
        ),
        ({"tarifs": [{"espece": "x", "unite": "kg"}]}, "Prix : champ obligatoire."),
        ({"tarifs": "aucun"}, "Tarifs : une liste est attendue."),
        ({"especes_masquees": [12]}, "Espèces masquées : un texte est attendu."),
        ({"tarifs_visibles": {"oui": 1}}, "Affichage des tarifs : une réponse par oui ou par non"),
        ({"ouvert_au_public": []}, "Ouverture au public : une réponse par oui ou par non"),
    ]
    for corps, attendu in profil:
        resp = await client.patch("/api/v1/profils/moi", headers=moi, json=corps)
        assert resp.status_code == 422, (corps, resp.text)
        assert resp.json()["code"] == "VALIDATION_ERROR"
        assert resp.json()["detail"].startswith(attendu), (corps, resp.json()["detail"])
        assert "Input should" not in resp.text


@pytest.mark.asyncio
async def test_l2_e_correction_d_une_demande_garde_les_autres_informations(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Corriger une information complémentaire ne fait pas perdre les autres."""
    suffix = uuid.uuid4().hex[:8]
    mmsi = _mmsi_fictif()
    demande = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": f"Fictif{suffix}",
            "prenom": "Correction",
            "email": f"correction.l2e.{suffix}@example.com",
            "embarcation_complements": {
                "mmsi": mmsi,
                "annee_construction": 2012,
                "proprietaire": "Propriétaire fictif",
            },
        },
    )
    assert demande.status_code == 201, demande.text
    chemin = f"/api/v1/demandes-licence/{demande.json()['id']}"

    ajout = await client.patch(
        chemin,
        headers=agent_headers,
        json={"embarcation_complements": {"exploitant": "Exploitant fictif"}},
    )
    assert ajout.status_code == 200, ajout.text
    assert ajout.json()["embarcation_complements"] == {
        "mmsi": mmsi,
        "annee_construction": 2012,
        "proprietaire": "Propriétaire fictif",
        "exploitant": "Exploitant fictif",
    }
    # Une information envoyée vide est retirée, une autre corrigée, le reste intact
    retrait = await client.patch(
        chemin,
        headers=agent_headers,
        json={"embarcation_complements": {"proprietaire": "", "annee_construction": 2013}},
    )
    assert retrait.json()["embarcation_complements"] == {
        "mmsi": mmsi,
        "annee_construction": 2013,
        "exploitant": "Exploitant fictif",
    }
    # Une correction qui ne touche pas à ces informations les laisse en place
    autre = await client.patch(chemin, headers=agent_headers, json={"message": "Message fictif."})
    assert autre.status_code == 200, autre.text
    assert autre.json()["embarcation_complements"]["mmsi"] == mmsi
    # Tout effacer reste possible, explicitement
    efface = await client.patch(
        chemin, headers=agent_headers, json={"embarcation_complements": None}
    )
    assert efface.json()["embarcation_complements"] is None


def test_l2_e_seuls_les_champs_prevus_sont_reportes_a_l_approbation() -> None:
    """Une valeur stockée sur la demande ne peut remplacer ni le titulaire, ni
    l'immatriculation, ni la balise de l'embarcation créée à l'approbation."""
    stockes = {
        "mmsi": "626123456",
        "proprietaire": "Propriétaire fictif",
        "pecheur_id": str(uuid.uuid4()),
        "immatriculation": "GA-AUTRE-0001",
        "balise_id": "BAL-AUTRE",
        "nom": "Autre nom",
    }
    assert _complements_connus(stockes) == {
        "mmsi": "626123456",
        "proprietaire": "Propriétaire fictif",
    }
    assert _complements_connus(None) == {} and _complements_connus(["mmsi"]) == {}


def test_l2_e_migration_additive_et_regle_proposee() -> None:
    """Colonnes facultatives, une seule tête de migration, règle au statut « Proposé »."""
    for cle in COMPLEMENTS:
        assert Embarcation.__table__.c[cle].nullable is True, cle
    assert DemandeLicence.__table__.c["embarcation_complements"].nullable is True

    racine = Path(__file__).resolve().parents[2]
    config = Config(str(racine / "alembic.ini"))
    config.set_main_option("script_location", str(racine / "alembic"))
    script = ScriptDirectory.from_config(config)
    assert len(script.get_heads()) == 1
    lot2 = script.get_revision("a9c3e4f5b627")
    assert lot2 is not None and lot2.down_revision == "f8b2d3e4a516"

    regle = charger_regles("profil_acteur")["regles"]["inscription_embarcation"]
    assert regle["statut"] == "Proposé"
    assert set(regle["valideurs"]) == {"Christian", "DGPA"}
