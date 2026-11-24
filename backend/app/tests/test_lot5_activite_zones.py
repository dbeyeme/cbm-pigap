"""Lot 5, parties A, B et C : heures d'activité par maille, captures par zone, rapport de zone.

Données fictives. Chaque test fixe sa propre règle de calcul dans un dossier
temporaire : les valeurs proposées dans le dépôt peuvent évoluer sans casser
les tests, et un paramètre modifié doit changer le résultat sans toucher au code.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.regles import charger_regles
from app.db.enums import NiveauGravite, RoleUtilisateur, SourcePosition, TypeAlerte
from app.db.models import LogAcces
from app.modules.activite.regles import regle_activite
from app.tests.aides import (
    connexion,
    copier_regles,
    creer_compte,
    creer_embarcation,
    creer_organisation,
    creer_pecheur,
    inserer_alerte,
    inserer_positions,
    instant_isole,
)

MAILLES = "/api/v1/activite/mailles"
CAPTURES = "/api/v1/activite/captures-par-zone"
RAPPORT = "/api/v1/activite/rapport-zone"
RAPPORT_PDF = "/api/v1/documents/rapport-zone"

# Au large, loin de tout port du référentiel et des zones créées par les autres tests
LARGE = (8.02, -2.02)
LARGE_AUTRE_MAILLE = (8.12, -2.02)
OWENDO = (9.505, 0.280)
# Carré d'essai autour de LARGE (polygone fermé, longitude puis latitude)
CARRE = [[[8.0, -2.1], [8.1, -2.1], [8.1, -2.0], [8.0, -2.0], [8.0, -2.1]]]

REGLE_DE_TEST = {
    "activite": {
        "intervalle_max_minutes": 60,
        "vitesse_max_noeuds": None,
        "taille_maille_deg": 0.05,
        "exclusion_ports": {"actif": True, "rayon_km": None},
        "periode_defaut_jours": 30,
        "periode_max_jours": 366,
        "mailles_max": 10000,
    }
}


@pytest.fixture
def regle(tmp_path, monkeypatch):
    """Règle fixée pour le test ; l'appel renvoyé modifie un ou plusieurs paramètres."""
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(tmp_path, "activite_zones", REGLE_DE_TEST)

    def changer(**activite) -> None:
        copier_regles(tmp_path, "activite_zones", {"activite": activite})

    return changer


def _serie(t0: datetime, point: tuple[float, float], n: int, pas_min: int = 15) -> list:
    return [(t0 + timedelta(minutes=pas_min * i), point[0], point[1]) for i in range(n)]


def _fenetre(t0: datetime, heures: float = 6.0) -> dict[str, str]:
    return {
        "debut": (t0 - timedelta(hours=1)).isoformat(),
        "fin": (t0 + timedelta(hours=heures)).isoformat(),
    }


async def _pirogue(client: AsyncClient, headers: dict, **pecheur) -> tuple[dict, dict]:
    p = await creer_pecheur(client, headers, **pecheur)
    e = await creer_embarcation(client, headers, p["id"])
    return p, e


async def _zone(client: AsyncClient, headers: dict, t0: datetime) -> dict:
    """Zone d'essai inactive : aucune alerte ne s'y déclenche pour les autres tests."""
    resp = await client.post(
        "/api/v1/zones",
        headers=headers,
        json={
            "nom": f"Zone essai lot5 {uuid.uuid4().hex[:8]}",
            "type": "sensible",
            "geometrie": {"type": "Polygon", "coordinates": CARRE},
            "periode_debut": t0.date().isoformat(),
            "periode_fin": (t0 + timedelta(days=2)).date().isoformat(),
            "actif": False,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _capture(
    client: AsyncClient,
    headers: dict,
    pecheur: dict,
    embarcation: dict,
    *,
    espece: str,
    kg: float,
    quand: datetime,
    position: tuple[float, float] | None,
    methode: str,
) -> None:
    corps = {
        "pecheur_id": pecheur["id"],
        "embarcation_id": embarcation["id"],
        "espece": espece,
        "quantite_kg": kg,
        "methode": methode,
        "point_debarquement": "Débarcadère fictif",
        "date_capture": quand.isoformat(),
    }
    if position is not None:
        corps["position_capture"] = {"type": "Point", "coordinates": list(position)}
    resp = await client.post("/api/v1/captures", headers=headers, json=corps)
    assert resp.status_code == 201, resp.text


async def _catalogue(client: AsyncClient, headers: dict) -> tuple[str, str, str]:
    """Deux espèces non protégées et un engin du référentiel."""
    cat = (await client.get("/api/v1/captures/catalog", headers=headers)).json()
    libres = [e for e in cat["especes"] if e not in set(cat["especes_protegees"])]
    return libres[0], libres[1], cat["methodes"][0]


# --------------------------------------------------------------------------- #
# A. Heures d'activité par maille
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l5_a_heures_par_maille_en_geojson(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Acceptation A : mailles GeoJSON, heures calculées depuis les positions."""
    _, emb = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    # Trois intervalles de 15 min dans une maille, puis un silence de plus d'une heure,
    # puis un intervalle de 15 min dans une autre maille.
    await inserer_positions(engine, emb["id"], _serie(t0, LARGE, 4))
    await inserer_positions(
        engine, emb["id"], _serie(t0 + timedelta(hours=3), LARGE_AUTRE_MAILLE, 2)
    )

    resp = await client.get(
        MAILLES, headers=agent_headers, params={**_fenetre(t0), "embarcation_id": emb["id"]}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert body["taille_maille_deg"] == 0.05
    assert body["regle"]["statut"] == "Proposé"
    assert body["regle"]["parametres"]["intervalle_max_minutes"] == 60
    assert set(body["regle"]) == {"version", "statut", "parametres"}
    assert body["totaux"] == {
        "heures_activite": 1.0,
        "nb_embarcations": 1,
        "nb_intervalles": 4,
        "nb_mailles": 2,
    }
    par_id = {f["id"]: f for f in body["features"]}
    assert set(par_id) == {"160:-41", "162:-41"}
    premiere = par_id["160:-41"]
    assert premiere["type"] == "Feature"
    assert premiere["properties"] == {
        "heures_activite": 0.75,
        "nb_embarcations": 1,
        "nb_intervalles": 3,
        "sources": ["mobile"],
    }
    assert par_id["162:-41"]["properties"]["heures_activite"] == 0.25
    anneau = premiere["geometry"]["coordinates"][0]
    assert premiere["geometry"]["type"] == "Polygon"
    assert len(anneau) == 5 and anneau[0] == anneau[-1]
    assert anneau[0] == pytest.approx([8.0, -2.05])
    assert anneau[2] == pytest.approx([8.05, -2.0])
    # Période renvoyée telle qu'elle a été appliquée (UTC)
    assert datetime.fromisoformat(body["periode"]["debut"]) == t0 - timedelta(hours=1)


@pytest.mark.asyncio
async def test_l5_a_releve_en_bord_de_maille(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Un relevé posé exactement sur une limite de maille appartient à la maille suivante."""
    _, emb = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    # 8.35 / 0.05 vaut 166,99999999999997 en virgule flottante : le calcul est décimal
    await inserer_positions(engine, emb["id"], _serie(t0, (8.35, -2.0), 2))
    resp = await client.get(
        MAILLES, headers=agent_headers, params={**_fenetre(t0), "embarcation_id": emb["id"]}
    )
    assert resp.status_code == 200, resp.text
    assert [f["id"] for f in resp.json()["features"]] == ["167:-40"]


@pytest.mark.asyncio
async def test_l5_a_filtres_source_emprise_secteur(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    _, emb = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    await inserer_positions(engine, emb["id"], _serie(t0, LARGE, 3))  # 0,5 h, application
    await inserer_positions(
        engine,
        emb["id"],
        _serie(t0 + timedelta(hours=2), LARGE_AUTRE_MAILLE, 2, pas_min=30),  # 0,5 h, balise
        source=SourcePosition.balise,
    )
    base = {**_fenetre(t0), "embarcation_id": emb["id"]}

    tout = (await client.get(MAILLES, headers=agent_headers, params=base)).json()
    assert tout["totaux"]["heures_activite"] == 1.0
    assert {f["id"]: f["properties"]["sources"] for f in tout["features"]} == {
        "160:-41": ["mobile"],
        "162:-41": ["balise"],
    }

    mobile = (
        await client.get(MAILLES, headers=agent_headers, params={**base, "source": "mobile"})
    ).json()
    assert mobile["totaux"]["heures_activite"] == 0.5
    assert mobile["filtres"]["source"] == "mobile"
    balise = (
        await client.get(MAILLES, headers=agent_headers, params={**base, "source": "balise"})
    ).json()
    assert [f["id"] for f in balise["features"]] == ["162:-41"]

    emprise = (
        await client.get(
            MAILLES, headers=agent_headers, params={**base, "emprise": "8.0,-2.1,8.05,-2.0"}
        )
    ).json()
    assert [f["id"] for f in emprise["features"]] == ["160:-41"]
    assert emprise["emprise"] == [8.0, -2.1, 8.05, -2.0]
    # Emprise demi-ouverte : un relevé posé sur le bord commun de deux emprises
    # voisines (longitude 8.02) n'est compté que dans celle de droite.
    gauche = (
        await client.get(
            MAILLES, headers=agent_headers, params={**base, "emprise": "7.9,-2.1,8.02,-2.0"}
        )
    ).json()
    droite = (
        await client.get(
            MAILLES, headers=agent_headers, params={**base, "emprise": "8.02,-2.1,8.1,-2.0"}
        )
    ).json()
    assert gauche["totaux"]["heures_activite"] == 0.0
    assert droite["totaux"]["heures_activite"] == 0.5

    # Secteurs du référentiel : relevés posés au centre du premier, absents du second
    regle(exclusion_ports={"actif": False, "rayon_km": None})
    secteurs = (await client.get("/api/v1/activite/secteurs", headers=agent_headers)).json()
    assert len(secteurs) >= 2
    dedans = secteurs[0]
    t1 = t0 + timedelta(days=1)
    await inserer_positions(engine, emb["id"], _serie(t1, (dedans["lon"], dedans["lat"]), 2))
    fenetre = {**_fenetre(t1), "embarcation_id": emb["id"]}
    dans = (
        await client.get(
            MAILLES, headers=agent_headers, params={**fenetre, "secteur": dedans["id"]}
        )
    ).json()
    assert dans["totaux"]["heures_activite"] == 0.25
    assert dans["filtres"]["secteur"] == dedans["id"]
    ailleurs = (
        await client.get(
            MAILLES, headers=agent_headers, params={**fenetre, "secteur": secteurs[-1]["id"]}
        )
    ).json()
    assert ailleurs["totaux"]["heures_activite"] == 0.0
    assert ailleurs["features"] == []


@pytest.mark.asyncio
async def test_l5_a_abords_du_port_exclus(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Les relevés aux abords d'un port ne comptent pas ; le paramètre le décide."""
    _, emb = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    await inserer_positions(engine, emb["id"], _serie(t0, OWENDO, 3))
    params = {**_fenetre(t0), "embarcation_id": emb["id"]}

    au_port = (await client.get(MAILLES, headers=agent_headers, params=params)).json()
    assert au_port["totaux"]["heures_activite"] == 0.0

    regle(exclusion_ports={"actif": False, "rayon_km": None})
    sans_exclusion = (await client.get(MAILLES, headers=agent_headers, params=params)).json()
    assert sans_exclusion["totaux"]["heures_activite"] == 0.5

    # Rayon propre à la règle, plus court que celui du référentiel des ports
    regle(exclusion_ports={"actif": True, "rayon_km": 0.1})
    rayon_court = (await client.get(MAILLES, headers=agent_headers, params=params)).json()
    assert rayon_court["totaux"]["heures_activite"] == 0.5


@pytest.mark.asyncio
async def test_l5_a_regle_parametree_sans_toucher_au_code(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Non codé en dur : modifier le fichier de règles change le résultat."""
    _, emb = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    # Lent : environ 0,55 km en 15 min. Rapide : environ 11 km en 15 min (près de 24 noeuds).
    await inserer_positions(
        engine,
        emb["id"],
        [
            (t0, 8.02, -2.02),
            (t0 + timedelta(minutes=15), 8.025, -2.02),
            (t0 + timedelta(minutes=30), 8.125, -2.02),
        ],
    )
    params = {**_fenetre(t0), "embarcation_id": emb["id"]}

    async def heures() -> float:
        resp = await client.get(MAILLES, headers=agent_headers, params=params)
        assert resp.status_code == 200, resp.text
        return resp.json()["totaux"]["heures_activite"]

    assert await heures() == 0.5

    regle(vitesse_max_noeuds=5)
    assert await heures() == 0.25  # l'intervalle rapide ne compte plus

    regle(vitesse_max_noeuds=None, intervalle_max_minutes=10)
    assert await heures() == 0.0  # 15 min entre deux relevés dépasse le nouvel écart

    regle(intervalle_max_minutes=60, taille_maille_deg=0.1)
    resp = await client.get(MAILLES, headers=agent_headers, params=params)
    body = resp.json()
    assert body["taille_maille_deg"] == 0.1
    assert [f["id"] for f in body["features"]] == ["80:-21"]
    assert body["regle"]["parametres"]["taille_maille_deg"] == 0.1


@pytest.mark.asyncio
async def test_l5_a_periodes_qui_se_suivent_s_additionnent(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    _, emb = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    await inserer_positions(engine, emb["id"], _serie(t0, LARGE, 9))  # 8 intervalles, 2 h
    coupe = t0 + timedelta(hours=1)

    async def heures(debut: datetime, fin: datetime) -> float:
        resp = await client.get(
            MAILLES,
            headers=agent_headers,
            params={
                "debut": debut.isoformat(),
                "fin": fin.isoformat(),
                "embarcation_id": emb["id"],
            },
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["totaux"]["heures_activite"]

    avant = await heures(t0 - timedelta(hours=1), coupe)
    apres = await heures(coupe, t0 + timedelta(hours=4))
    total = await heures(t0 - timedelta(hours=1), t0 + timedelta(hours=4))
    assert (avant, apres, total) == (1.0, 1.0, 2.0)


@pytest.mark.asyncio
async def test_l5_a_perimetre_par_role(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Pêcheur : ses embarcations. Organisation : ses membres. Pilotage : toute la flotte."""
    org = await creer_organisation(client, agent_headers)
    p1, e1 = await _pirogue(client, agent_headers, organisation_id=org["id"])
    p2, e2 = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    await inserer_positions(engine, e1["id"], _serie(t0, LARGE, 3))  # 0,5 h
    await inserer_positions(engine, e2["id"], _serie(t0, LARGE_AUTRE_MAILLE, 4))  # 0,75 h
    fenetre = _fenetre(t0)

    assert (await client.get(MAILLES, params=fenetre)).status_code == 401

    h1 = await connexion(client, p1["email"])
    mien = await client.get(MAILLES, headers=h1, params=fenetre)
    assert mien.status_code == 200, mien.text
    assert mien.json()["totaux"]["heures_activite"] == 0.5
    assert [f["id"] for f in mien.json()["features"]] == ["160:-41"]
    # L'embarcation d'un autre pêcheur n'existe pas pour lui
    autre = await client.get(MAILLES, headers=h1, params={**fenetre, "embarcation_id": e2["id"]})
    assert autre.status_code == 404
    assert autre.json()["code"] == "EMBARCATION_NOT_FOUND"

    # Le rôle organisation n'a pas accès aux positions de ses membres ailleurs dans
    # l'API : il n'est pas admis ici non plus, rattaché ou non (décision du porteur).
    for organisation_id in (org["id"], None):
        _, h_org = await creer_compte(
            engine, RoleUtilisateur.organisation, organisation_id=organisation_id
        )
        for params in (fenetre, {**fenetre, "embarcation_id": e1["id"]}):
            assert (await client.get(MAILLES, headers=h_org, params=params)).status_code == 403
        assert (await client.get("/api/v1/activite/secteurs", headers=h_org)).status_code == 403

    for role in (RoleUtilisateur.chercheur, RoleUtilisateur.autorite, RoleUtilisateur.admin):
        _, h = await creer_compte(engine, role)
        flotte = (await client.get(MAILLES, headers=h, params=fenetre)).json()
        assert flotte["totaux"]["heures_activite"] == 1.25, role
        assert flotte["totaux"]["nb_embarcations"] == 2

    inconnue = await client.get(
        MAILLES, headers=agent_headers, params={**fenetre, "embarcation_id": str(uuid.uuid4())}
    )
    assert inconnue.status_code == 404


@pytest.mark.asyncio
async def test_l5_a_demandes_invalides(client: AsyncClient, agent_headers: dict, regle) -> None:
    t0 = instant_isole()
    cas = [
        ({"emprise": "8,2,7"}, 400, "EMPRISE_INVALIDE"),
        ({"emprise": "9,0,8,1"}, 400, "EMPRISE_INVALIDE"),
        ({"emprise": "a,b,c,d"}, 400, "EMPRISE_INVALIDE"),
        (
            {"debut": t0.isoformat(), "fin": (t0 - timedelta(hours=1)).isoformat()},
            400,
            "PERIODE_INVALIDE",
        ),
        (
            {"debut": t0.isoformat(), "fin": (t0 + timedelta(days=400)).isoformat()},
            400,
            "PERIODE_TROP_LONGUE",
        ),
        ({"secteur": "secteur-inexistant"}, 404, "SECTEUR_NOT_FOUND"),
        ({"zone_id": str(uuid.uuid4())}, 404, "ZONE_NOT_FOUND"),
        ({"zone_id": str(uuid.uuid4()), "secteur": "estuaire"}, 400, "ZONE_OU_SECTEUR"),
        ({"source": "satellite"}, 422, "VALIDATION_ERROR"),
        # Dates aux limites du calendrier : refus clair, jamais une erreur interne
        ({"fin": "0001-01-10T00:00:00Z"}, 400, "PERIODE_INVALIDE"),
        ({"fin": "9999-12-31T23:59:59Z"}, 400, "PERIODE_INVALIDE"),
        ({"debut": "0001-01-01T00:00:00+14:00"}, 400, "PERIODE_INVALIDE"),
    ]
    for params, statut, code in cas:
        resp = await client.get(MAILLES, headers=agent_headers, params=params)
        assert resp.status_code == statut, (params, resp.text)
        assert resp.json()["code"] == code, params
        # Message en clair d'abord, le code technique à part
        assert not resp.json()["detail"].startswith(code)


@pytest.mark.asyncio
async def test_l5_a_trop_de_mailles_demande_refusee(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Au-delà du plafond de mailles du paramétrage, la demande doit être resserrée."""
    _, emb = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    await inserer_positions(engine, emb["id"], _serie(t0, LARGE, 2))
    await inserer_positions(
        engine, emb["id"], _serie(t0 + timedelta(hours=3), LARGE_AUTRE_MAILLE, 2)
    )
    params = {**_fenetre(t0), "embarcation_id": emb["id"]}
    assert (await client.get(MAILLES, headers=agent_headers, params=params)).status_code == 200

    regle(mailles_max=1)
    trop = await client.get(MAILLES, headers=agent_headers, params=params)
    assert trop.status_code == 400
    assert trop.json()["code"] == "EMPRISE_TROP_LARGE"


@pytest.mark.asyncio
async def test_l5_a_fichier_de_regles_absent_ou_incomplet_echec_ferme(
    client: AsyncClient, agent_headers: dict, tmp_path, monkeypatch
) -> None:
    """Sans paramétrage lisible, aucun calcul : pas de valeur de repli dans le code."""
    # Dossier externe demandé mais introuvable : pas de repli sur les règles du dépôt
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path / "volume-non-monte"))
    introuvable = await client.get(MAILLES, headers=agent_headers)
    assert introuvable.status_code == 503
    assert introuvable.json()["code"] == "REGLE_INDISPONIBLE"

    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    absent = await client.get(MAILLES, headers=agent_headers)
    assert absent.status_code == 503
    assert absent.json()["code"] == "REGLE_INDISPONIBLE"

    chemin = copier_regles(tmp_path, "activite_zones", REGLE_DE_TEST)
    assert (await client.get(MAILLES, headers=agent_headers)).status_code == 200

    # Une clé retirée du fichier n'est pas remplacée par une valeur du code
    chemin.write_text('{"activite": {"intervalle_max_minutes": 60}}', encoding="utf-8")
    incomplet = await client.get(MAILLES, headers=agent_headers)
    assert incomplet.status_code == 503
    assert incomplet.json()["code"] == "REGLE_INDISPONIBLE"

    chemin.write_text("pas du JSON", encoding="utf-8")
    assert (await client.get(MAILLES, headers=agent_headers)).status_code == 503


def test_l5_a_regle_du_depot_proposee_et_lisible() -> None:
    """Le fichier versionné du dépôt se lit et porte son statut et ses valideurs."""
    contenu = charger_regles("activite_zones")
    assert contenu["statut"] == "Proposé"
    assert set(contenu["valideurs"]) == {"Christian", "expert halieutique"}
    regle_lue, entete = regle_activite()
    assert entete["version"]
    assert regle_lue.taille_maille_deg > 0
    # Chaque paramètre est expliqué au porteur dans le fichier lui-même
    assert set(contenu["explications"]) == set(contenu["activite"])


# --------------------------------------------------------------------------- #
# B. Captures par zone
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l5_b_captures_par_zone_sans_position_a_part(
    client: AsyncClient, agent_headers: dict, regle
) -> None:
    """Acceptation B : volumes par espèce dans la zone ; sans position, comptées à part."""
    a, b, methode = await _catalogue(client, agent_headers)
    p, e = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    zone = await _zone(client, agent_headers, t0)
    dedans, dehors = (8.05, -2.05), (8.5, -2.5)
    for espece, kg, minutes, position in (
        (a, 10.0, 0, dedans),
        (a, 5.5, 10, dedans),
        (b, 7.0, 20, dedans),
        (a, 3.0, 30, dehors),
        (b, 20.0, 40, None),
    ):
        await _capture(
            client,
            agent_headers,
            p,
            e,
            espece=espece,
            kg=kg,
            quand=t0 + timedelta(minutes=minutes),
            position=position,
            methode=methode,
        )

    resp = await client.get(
        CAPTURES, headers=agent_headers, params={**_fenetre(t0), "zone_id": zone["id"]}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["zone"] == {
        "genre": "zone_reglementee",
        "id": zone["id"],
        "nom": zone["nom"],
        "type": "sensible",
    }
    dans = body["dans_la_zone"]
    assert (dans["nb_declarations"], dans["quantite_kg"]) == (3, 22.5)
    assert [(v["espece"], v["quantite_kg"], v["nb_declarations"]) for v in dans["par_espece"]] == [
        (a, 15.5, 2),
        (b, 7.0, 1),
    ]
    assert all(v["nom"] for v in dans["par_espece"])
    # Jamais attribuée par supposition : la capture sans lieu de pêche reste à part
    assert (body["sans_position"]["nb_declarations"], body["sans_position"]["quantite_kg"]) == (
        1,
        20.0,
    )
    assert body["sans_position"]["par_espece"][0]["espece"] == b
    hors = body["positionnees_hors_zone"]
    assert (hors["nb_declarations"], hors["quantite_kg"]) == (1, 3.0)

    # Hors période : rien
    vide = await client.get(
        CAPTURES,
        headers=agent_headers,
        params={
            "zone_id": zone["id"],
            "debut": (t0 + timedelta(days=5)).isoformat(),
            "fin": (t0 + timedelta(days=6)).isoformat(),
        },
    )
    assert vide.json()["dans_la_zone"] == {
        "quantite_kg": 0.0,
        "nb_declarations": 0,
        "par_espece": [],
    }


@pytest.mark.asyncio
async def test_l5_b_captures_par_secteur_et_perimetre(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    a, _b, methode = await _catalogue(client, agent_headers)
    p1, e1 = await _pirogue(client, agent_headers)
    p2, e2 = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    secteur = (await client.get("/api/v1/activite/secteurs", headers=agent_headers)).json()[0]
    centre = (secteur["lon"], secteur["lat"])
    await _capture(
        client, agent_headers, p1, e1, espece=a, kg=4.0, quand=t0, position=centre, methode=methode
    )
    await _capture(
        client, agent_headers, p2, e2, espece=a, kg=9.0, quand=t0, position=centre, methode=methode
    )
    await _capture(
        client, agent_headers, p2, e2, espece=a, kg=1.5, quand=t0, position=None, methode=methode
    )
    params = {**_fenetre(t0), "secteur": secteur["id"]}

    assert (await client.get(CAPTURES, params=params)).status_code == 401

    flotte = (await client.get(CAPTURES, headers=agent_headers, params=params)).json()
    assert flotte["zone"]["genre"] == "secteur" and flotte["zone"]["id"] == secteur["id"]
    assert flotte["dans_la_zone"]["quantite_kg"] == 13.0
    assert flotte["sans_position"]["quantite_kg"] == 1.5

    # Le pêcheur ne voit que ses déclarations, dans chaque groupe
    h1 = await connexion(client, p1["email"])
    mien = (await client.get(CAPTURES, headers=h1, params=params)).json()
    assert mien["dans_la_zone"]["quantite_kg"] == 4.0
    assert mien["sans_position"]["nb_declarations"] == 0

    # Pêcheur sans aucune déclaration : rien, dans aucun groupe
    sans_capture = await creer_pecheur(client, agent_headers)
    rien = (
        await client.get(
            CAPTURES, headers=await connexion(client, sans_capture["email"]), params=params
        )
    ).json()
    assert rien["dans_la_zone"]["nb_declarations"] == 0
    assert rien["sans_position"]["nb_declarations"] == 0

    _, h_org = await creer_compte(engine, RoleUtilisateur.organisation)
    assert (await client.get(CAPTURES, headers=h_org, params=params)).status_code == 403


@pytest.mark.asyncio
async def test_l5_b_zone_ou_secteur_obligatoire(
    client: AsyncClient, agent_headers: dict, regle
) -> None:
    resp = await client.get(CAPTURES, headers=agent_headers)
    assert resp.status_code == 400
    assert resp.json()["code"] == "ZONE_OU_SECTEUR"
    inconnue = await client.get(
        CAPTURES, headers=agent_headers, params={"zone_id": str(uuid.uuid4())}
    )
    assert inconnue.status_code == 404


# --------------------------------------------------------------------------- #
# C. Rapport de zone
# --------------------------------------------------------------------------- #


async def _scenario_rapport(client: AsyncClient, agent_headers: dict, engine) -> dict:
    a, _b, methode = await _catalogue(client, agent_headers)
    p1, e1 = await _pirogue(client, agent_headers)
    _p2, e2 = await _pirogue(client, agent_headers)
    _p3, e3 = await _pirogue(client, agent_headers)
    t0 = instant_isole()
    zone = await _zone(client, agent_headers, t0)
    dedans, dehors = (8.05, -2.05), (8.5, -2.5)
    await inserer_positions(engine, e1["id"], _serie(t0, dedans, 4))  # 0,75 h dans la zone
    await inserer_positions(engine, e2["id"], [(t0, dedans[0], dedans[1])])  # présente, 0 h
    await inserer_positions(engine, e3["id"], _serie(t0, dehors, 3))  # hors de la zone
    await _capture(
        client, agent_headers, p1, e1, espece=a, kg=12.0, quand=t0, position=dedans, methode=methode
    )
    await _capture(
        client, agent_headers, p1, e1, espece=a, kg=4.0, quand=t0, position=None, methode=methode
    )
    quand = t0 + timedelta(minutes=5)
    # Rattachées : par référence de zone, par point GeoJSON, par couple longitude et latitude
    await inserer_alerte(
        engine,
        horodatage=quand,
        embarcation_id=e1["id"],
        type_alerte=TypeAlerte.zone_interdite,
        gravite=NiveauGravite.critique,
        declencheur={"regle": "intrusion_zone_interdite", "zone_id": zone["id"]},
    )
    await inserer_alerte(
        engine,
        horodatage=quand,
        declencheur={
            "regle": "concentration_zone",
            "position": {"type": "Point", "coordinates": list(dedans)},
        },
    )
    await inserer_alerte(
        engine,
        horodatage=quand,
        gravite=NiveauGravite.critique,
        declencheur={"regle": "detresse_balise", "position": {"lon": dedans[0], "lat": dedans[1]}},
    )
    # Non rattachées : position hors de la zone, puis aucune position
    await inserer_alerte(
        engine,
        horodatage=quand,
        declencheur={
            "regle": "concentration_zone",
            "position": {"type": "Point", "coordinates": list(dehors)},
        },
    )
    await inserer_alerte(
        engine, horodatage=quand, declencheur={"regle": "espece_protegee", "espece": a}
    )
    await inserer_alerte(
        engine,
        horodatage=quand,
        declencheur={"regle": "valeur_inattendue", "position": {"coordinates": ["x", None]}},
    )
    return {"t0": t0, "zone": zone, "e1": e1, "e2": e2, "e3": e3, "espece": a}


@pytest.mark.asyncio
async def test_l5_c_rapport_de_zone_json(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    """Acceptation C : heures d'activité, embarcations présentes, captures, alertes."""
    s = await _scenario_rapport(client, agent_headers, engine)
    compte_id, headers = await creer_compte(engine, RoleUtilisateur.autorite)
    params = {**_fenetre(s["t0"]), "zone_id": s["zone"]["id"]}

    resp = await client.get(RAPPORT, headers=headers, params=params)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["zone"]["nom"] == s["zone"]["nom"]
    assert body["activite"] == {
        "heures_activite": 0.75,
        "nb_embarcations_actives": 1,
        "nb_intervalles": 3,
    }
    assert body["nb_embarcations_presentes"] == 2
    presentes = body["embarcations"]
    assert [e["embarcation_id"] for e in presentes] == [s["e1"]["id"], s["e2"]["id"]]
    assert presentes[0]["nb_releves"] == 4 and presentes[0]["heures_activite"] == 0.75
    assert presentes[0]["immatriculation"] == s["e1"]["immatriculation"]
    assert presentes[1]["nb_releves"] == 1 and presentes[1]["heures_activite"] == 0.0
    assert datetime.fromisoformat(presentes[0]["premier_releve"]) == s["t0"]

    assert body["captures"]["dans_la_zone"]["quantite_kg"] == 12.0
    assert body["captures"]["dans_la_zone"]["par_espece"][0]["espece"] == s["espece"]
    assert body["captures"]["sans_position"]["quantite_kg"] == 4.0

    alertes = body["alertes"]
    assert alertes["total"] == 3
    assert alertes["par_type"] == {"anomalie": 2, "zone_interdite": 1}
    assert alertes["par_gravite"] == {"attention": 1, "critique": 2}
    assert {a["regle"] for a in alertes["elements"]} == {
        "intrusion_zone_interdite",
        "concentration_zone",
        "detresse_balise",
    }
    # Deux alertes sans lieu exploitable : comptées à part, jamais rattachées
    assert alertes["sans_position"] == 2
    assert body["regle"]["statut"] == "Proposé"

    # Journalisation : la consultation est inscrite au journal des accès
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        lignes = (
            (
                await session.execute(
                    select(LogAcces).where(
                        LogAcces.utilisateur_id == compte_id, LogAcces.ressource == "rapport_zone"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert [ligne.action for ligne in lignes] == ["consultation"]
    assert s["zone"]["id"] in (lignes[0].detail or "")


@pytest.mark.asyncio
async def test_l5_c_rapport_de_zone_pdf(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    s = await _scenario_rapport(client, agent_headers, engine)
    compte_id, headers = await creer_compte(engine, RoleUtilisateur.agent_controle)
    resp = await client.get(
        RAPPORT_PDF, headers=headers, params={**_fenetre(s["t0"]), "zone_id": s["zone"]["id"]}
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.headers["content-disposition"].startswith('attachment; filename="rapport-zone-')
    assert resp.content.startswith(b"%PDF")
    texte = resp.content.decode("latin-1", errors="ignore")
    # Le dernier mot du nom est propre à chaque embarcation et ne se coupe pas à la ligne
    propre = {cle: s[cle]["nom"].split()[-1] for cle in ("e1", "e2", "e3")}
    for attendu in (
        s["zone"]["nom"].split()[-1],
        propre["e1"],
        s["e1"]["immatriculation"],
        propre["e2"],
    ):
        assert attendu in texte, f"manque {attendu!r} dans le PDF"
    assert propre["e3"] not in texte

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        actions = (
            (
                await session.execute(
                    select(LogAcces.action).where(LogAcces.utilisateur_id == compte_id)
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["export_pdf"]


@pytest.mark.asyncio
async def test_l5_c_rapport_de_zone_reserve_au_pilotage(
    client: AsyncClient, agent_headers: dict, engine, regle
) -> None:
    t0 = instant_isole()
    zone = await _zone(client, agent_headers, t0)
    params = {**_fenetre(t0), "zone_id": zone["id"]}
    pecheur = await creer_pecheur(client, agent_headers)
    h_pecheur = await connexion(client, pecheur["email"])
    _, h_org = await creer_compte(engine, RoleUtilisateur.organisation)

    for chemin in (RAPPORT, RAPPORT_PDF):
        assert (await client.get(chemin, params=params)).status_code == 401
        assert (await client.get(chemin, headers=h_pecheur, params=params)).status_code == 403
        assert (await client.get(chemin, headers=h_org, params=params)).status_code == 403
        sans_zone = await client.get(chemin, headers=agent_headers, params=_fenetre(t0))
        assert sans_zone.status_code == 400 and sans_zone.json()["code"] == "ZONE_OU_SECTEUR"
        inconnue = await client.get(
            chemin, headers=agent_headers, params={**_fenetre(t0), "zone_id": str(uuid.uuid4())}
        )
        assert inconnue.status_code == 404

    for role in (RoleUtilisateur.chercheur, RoleUtilisateur.admin):
        _, h = await creer_compte(engine, role)
        vide = await client.get(RAPPORT, headers=h, params=params)
        assert vide.status_code == 200, vide.text
        assert vide.json()["nb_embarcations_presentes"] == 0
        assert vide.json()["alertes"]["total"] == 0

    # Rapport par secteur de mer
    secteur = (await client.get("/api/v1/activite/secteurs", headers=agent_headers)).json()[0]
    par_secteur = await client.get(
        RAPPORT, headers=agent_headers, params={**_fenetre(t0), "secteur": secteur["id"]}
    )
    assert par_secteur.status_code == 200, par_secteur.text
    assert par_secteur.json()["zone"] == {
        "genre": "secteur",
        "id": secteur["id"],
        "nom": secteur["nom"],
        "type": secteur["type"],
    }
