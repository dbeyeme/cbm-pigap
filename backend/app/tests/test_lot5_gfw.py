"""Lot 5, partie D : essai Global Fishing Watch (ADR-011). Aucun appel réseau.

L'éditeur est remplacé par un simulateur branché sur le transport HTTP du
client : les demandes réellement construites (adresse, paramètres, en-têtes)
sont vérifiées, les réponses sont fictives. Un essai réel, lancé à la main, est
décrit dans `docs/lot-5-activite-zones-serveur.md`.
"""

from __future__ import annotations

import ast
import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from httpx import AsyncClient
from pydantic import SecretStr

from app.core.config import Settings, settings
from app.db.enums import RoleUtilisateur
from app.modules.gfw import client as gfw_client
from app.modules.gfw import service as gfw_service
from app.modules.gfw.parametres import parametres_gfw
from app.tests.aides import connexion, copier_regles, creer_compte, creer_pecheur

BASE = "/api/v1/gfw"
JETON_FICTIF = "jeton-fictif-de-test-0123456789"
MAINTENANT = datetime(2001, 5, 10, 12, 0, tzinfo=UTC)

# Réponses fictives, à la forme constatée lors de l'essai du 2026-11-24 :
# `entries`, liste d'objets dont chaque valeur est une liste de lignes.
PECHE_PAR_MOIS_ET_PAVILLON = [
    {"date": "2001-03", "flag": "AAA", "hours": 100.5},
    {"date": "2001-03", "flag": "BBB", "hours": 20.25},
    {"date": "2001-04", "flag": "AAA", "hours": 50.0},
    {"date": "2001-04", "flag": None, "hours": 4.0},
]
PECHE_PAR_NAVIRE = [
    {
        "vesselId": "bbbb2222-fictif",
        "shipName": "NAVIRE FICTIF DEUX",
        "flag": "BBB",
        "mmsi": 999000002,
        "imo": None,
        "callsign": "",
        "geartype": "tuna_purse_seines",
        "hours": 54.25,
    },
    {
        "vesselId": "aaaa1111-fictif",
        "shipName": "NAVIRE FICTIF UN",
        "flag": "AAA",
        "mmsi": "999000001",
        "imo": "9990001",
        "callsign": "FICT1",
        "geartype": "trawlers",
        "hours": 120.5,
        "entryTimestamp": "2001-03-02T00:00:00Z",
        "exitTimestamp": "2001-04-20T06:30:00Z",
    },
]
RADAR_PAR_MOIS = [
    {"date": "2001-03", "flag": "AAA", "detections": 12},
    {"date": "2001-03", "flag": None, "detections": 30},
    {"date": "2001-04", "detections": 8},
]
EVENEMENTS_PECHE = {
    "total": 2,
    "nextOffset": None,
    "entries": [
        {
            "id": "evt-fictif-un",
            "type": "fishing",
            "start": "2001-03-02T06:00:00Z",
            "end": "2001-03-02T09:30:00Z",
            "position": {"lon": 8.55, "lat": -0.42},
            "vessel": {
                "id": "aaaa1111-fictif",
                "name": "NAVIRE FICTIF UN",
                "flag": "AAA",
                "ssvid": "999000001",
                "imo": "9990001",
                "callsign": "FICT1",
                "geartype": "trawlers",
            },
            "fishing": {"totalTimeHours": 3.5},
        },
        {
            "id": "evt-fictif-deux",
            "type": "fishing",
            "start": "2001-04-01T12:00:00Z",
            "end": "2001-04-01T14:00:00Z",
            "position": {"lat": 0.21, "lon": 9.12},
            "vessel": {
                "id": "bbbb2222-fictif",
                "name": "NAVIRE FICTIF DEUX",
                "flag": "BBB",
                "ssvid": 999000002,
            },
        },
    ],
}

IDENTITE = {
    "dataset": "public-global-vessel-identity:v-fictive",
    "registryInfoTotalRecords": 1,
    "registryInfo": [
        {
            "shipname": "NAVIRE FICTIF UN",
            "flag": "AAA",
            "ssvid": "999000001",
            "imo": "9990001",
            "callsign": "FICT1",
            "geartypes": ["TRAWLERS"],
            "lengthM": 42.5,
            "tonnageGt": 380,
            "transmissionDateFrom": "1999-01-01T00:00:00Z",
            "transmissionDateTo": "2001-04-20T00:00:00Z",
        }
    ],
    "registryOwners": [
        {
            "name": "ARMEMENT FICTIF",
            "flag": "AAA",
            "sourceCode": ["REGISTRE-FICTIF"],
            "dateFrom": "1999-01-01T00:00:00Z",
            "dateTo": "2001-04-20T00:00:00Z",
        }
    ],
    "registryPublicAuthorizations": [
        {
            "sourceCode": ["ORGANISATION-FICTIVE"],
            "dateFrom": "2000-01-01T00:00:00Z",
            "dateTo": "2001-01-01T00:00:00Z",
        }
    ],
    # Objet seul sur cet appel, liste sur d'autres : les deux formes sont lues
    "selfReportedInfo": {
        "id": "aaaa1111-fictif",
        "ssvid": "999000001",
        "shipname": "NAVIRE FICTIF UN",
        "flag": "AAA",
        "callsign": "FICT1",
        "imo": "9990001",
        "transmissionDateFrom": "1999-02-01T00:00:00Z",
        "transmissionDateTo": "2001-04-20T00:00:00Z",
    },
}


def _rapport(lignes: list[dict], **extra) -> dict:
    return {"total": 1, "nextOffset": None, "entries": [{"jeu-fictif:v1": lignes}], **extra}


class Editeur:
    """Simulateur de l'éditeur : garde les demandes reçues et compte les appels simultanés."""

    def __init__(self) -> None:
        self.demandes: list[httpx.Request] = []
        self.statut = 200
        self.corps: dict | None = None
        self.en_cours = 0
        self.max_en_cours = 0
        self.exception: Exception | None = None
        self._entree: asyncio.Event | None = None
        self._liberation: asyncio.Event | None = None

    def retenir_les_appels(self) -> None:
        """Les appels restent en attente chez l'éditeur jusqu'à `liberer`."""
        self._entree = asyncio.Event()
        self._liberation = asyncio.Event()

    async def attendre_un_appel(self) -> None:
        assert self._entree is not None
        await asyncio.wait_for(self._entree.wait(), timeout=10)

    def liberer(self) -> None:
        assert self._liberation is not None
        self._liberation.set()

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.demandes.append(request)
        self.en_cours += 1
        self.max_en_cours = max(self.max_en_cours, self.en_cours)
        try:
            if self._entree is not None and self._liberation is not None:
                self._entree.set()
                await self._liberation.wait()
            if self.exception is not None:
                raise self.exception
            if self.statut != 200:
                return httpx.Response(
                    self.statut, json={"statusCode": self.statut, "error": "erreur fictive"}
                )
            if self.corps is not None:
                return httpx.Response(200, json=self.corps)
            params = request.url.params
            if request.url.path.startswith("/v3/events"):
                # L'éditeur répond 201 Created aux recherches d'évènements (POST).
                return httpx.Response(201, json=EVENEMENTS_PECHE)
            if request.url.path.startswith("/v3/vessels/"):
                return httpx.Response(200, json=IDENTITE)
            if "sar" in params.get("datasets[0]", ""):
                return httpx.Response(200, json=_rapport(RADAR_PAR_MOIS))
            if params.get("group-by") == "VESSEL_ID":
                return httpx.Response(200, json=_rapport(PECHE_PAR_NAVIRE))
            return httpx.Response(200, json=_rapport(PECHE_PAR_MOIS_ET_PAVILLON))
        finally:
            self.en_cours -= 1


@pytest.fixture
def horloge(monkeypatch):
    """Heure fixée pour le service et le client ; `avancer` déplace les deux."""
    etat = {"maintenant": MAINTENANT}
    monkeypatch.setattr(gfw_service, "_maintenant", lambda: etat["maintenant"])
    monkeypatch.setattr(gfw_client, "_maintenant", lambda: etat["maintenant"])

    def avancer(**delta) -> None:
        etat["maintenant"] = etat["maintenant"] + timedelta(**delta)

    return avancer


@pytest.fixture
def editeur(monkeypatch, horloge) -> Editeur:
    """Essai activé avec un jeton fictif et un éditeur simulé : aucun réseau."""
    simulateur = Editeur()
    gfw_client.reinitialiser()
    monkeypatch.setattr(settings, "gfw_enabled", True)
    monkeypatch.setattr(settings, "gfw_api_token", SecretStr(JETON_FICTIF))
    monkeypatch.setattr(gfw_client, "_transport", lambda: httpx.MockTransport(simulateur))
    yield simulateur
    gfw_client.reinitialiser()


@pytest.fixture
def parametres(tmp_path, monkeypatch):
    """Paramétrage de l'essai dans un dossier à part, modifiable par le test."""
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(tmp_path, "gfw_source")

    def changer(**source) -> None:
        copier_regles(tmp_path, "gfw_source", {"source": source})

    return changer


@pytest.fixture
async def autorite(engine) -> dict[str, str]:
    _, headers = await creer_compte(engine, RoleUtilisateur.autorite)
    return headers


# --------------------------------------------------------------------------- #
# À l'arrêt par défaut, échec fermé, rôles
# --------------------------------------------------------------------------- #

ROUTES_DE_DONNEES = (
    "/peche-apparente",
    "/navires",
    "/detections-radar",
    "/evenements-peche",
    "/navires/aaaa1111-fictif",
)


def test_l5_d_reglages_a_l_arret_par_defaut_et_alias_du_jeton(tmp_path) -> None:
    """`GFW_ENABLED` vaut faux par défaut ; le jeton se lit sous ses deux noms, sans s'afficher."""
    assert Settings.model_fields["gfw_enabled"].default is False
    assert Settings.model_fields["gfw_api_token"].default is None

    ancien_nom = tmp_path / "ancien.env"
    ancien_nom.write_text("cbm-pigap-api-globafish=valeur-fictive-ancien-nom\n", encoding="utf-8")
    lu = Settings(_env_file=str(ancien_nom))
    assert lu.gfw_api_token is not None
    assert lu.gfw_api_token.get_secret_value() == "valeur-fictive-ancien-nom"
    assert "valeur-fictive-ancien-nom" not in repr(lu)
    assert "valeur-fictive-ancien-nom" not in lu.model_dump_json()

    nom_prevu = tmp_path / "prevu.env"
    nom_prevu.write_text("GFW_API_TOKEN=valeur-fictive-nom-prevu\n", encoding="utf-8")
    lu = Settings(_env_file=str(nom_prevu))
    assert lu.gfw_api_token.get_secret_value() == "valeur-fictive-nom-prevu"


@pytest.mark.asyncio
async def test_l5_d_a_l_arret_aucun_appel_a_l_editeur(
    client: AsyncClient, autorite: dict, editeur: Editeur, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gfw_enabled", False)
    for route in ROUTES_DE_DONNEES:
        resp = await client.get(BASE + route, headers=autorite)
        assert resp.status_code == 503, route
        assert resp.json()["code"] == "GFW_DESACTIVE"
        assert not resp.json()["detail"].startswith("GFW")
    etat = await client.get(BASE + "/etat", headers=autorite)
    assert etat.status_code == 200
    assert etat.json()["active"] is False
    assert etat.json()["attribution"]["mention"] == "Powered by Global Fishing Watch."
    assert editeur.demandes == []


@pytest.mark.asyncio
async def test_l5_d_sans_jeton_echec_ferme(
    client: AsyncClient, autorite: dict, editeur: Editeur, monkeypatch
) -> None:
    for vide in (None, SecretStr(""), SecretStr("   ")):
        monkeypatch.setattr(settings, "gfw_api_token", vide)
        for route in ROUTES_DE_DONNEES:
            resp = await client.get(BASE + route, headers=autorite)
            assert resp.status_code == 503, route
            assert resp.json()["code"] == "GFW_JETON_ABSENT"
        etat = (await client.get(BASE + "/etat", headers=autorite)).json()
        assert etat["active"] is True and etat["jeton_configure"] is False
    assert editeur.demandes == []


@pytest.mark.asyncio
async def test_l5_d_roles_autorite_agent_administrateur_seulement(
    client: AsyncClient, agent_headers: dict, engine, editeur: Editeur
) -> None:
    routes = ("/etat", *ROUTES_DE_DONNEES)
    for route in routes:
        assert (await client.get(BASE + route)).status_code == 401, route

    pecheur = await creer_pecheur(client, agent_headers, tag="GFW")
    refuses = [await connexion(client, pecheur["email"])]
    for role in (RoleUtilisateur.organisation, RoleUtilisateur.chercheur):
        refuses.append((await creer_compte(engine, role))[1])
    for headers in refuses:
        for route in routes:
            assert (await client.get(BASE + route, headers=headers)).status_code == 403, route
    assert editeur.demandes == []

    admis = [agent_headers]
    for role in (RoleUtilisateur.autorite, RoleUtilisateur.admin):
        admis.append((await creer_compte(engine, role))[1])
    for headers in admis:
        for route in routes:
            resp = await client.get(BASE + route, headers=headers)
            assert resp.status_code == 200, (route, resp.text)


# --------------------------------------------------------------------------- #
# Contenu des réponses
# --------------------------------------------------------------------------- #


def _entete_attendu(body: dict, *, debut: str, fin: str, publie: str, retard: int) -> None:
    assert body["periode"] == {"debut": debut, "fin": fin}
    assert body["fraicheur"]["donnees_jusqu_au"] == publie
    assert body["fraicheur"]["retard_publication_heures"] == retard
    assert datetime.fromisoformat(body["fraicheur"]["recupere_a"]) == MAINTENANT
    assert body["attribution"] == {
        "mention": "Powered by Global Fishing Watch.",
        "lien": "https://globalfishingwatch.org",
    }
    assert body["zone"]["identifiant"] == 8476
    assert "indice" in body["avertissement"]


@pytest.mark.asyncio
async def test_l5_d_peche_apparente_par_mois_et_par_pavillon(
    client: AsyncClient, autorite: dict, editeur: Editeur
) -> None:
    """Acceptation D : heures par mois et par pavillon, avec période, fraîcheur et mention."""
    resp = await client.get(
        BASE + "/peche-apparente",
        headers=autorite,
        params={"debut": "2001-03-01", "fin": "2001-05-01"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    _entete_attendu(body, debut="2001-03-01", fin="2001-05-01", publie="2001-05-06", retard=96)
    assert body["fraicheur"]["en_cache"] is False
    assert body["fraicheur"]["periode_incomplete"] is False
    assert body["total_heures"] == 174.75
    assert body["par_mois"] == [
        {"mois": "2001-03", "heures": 120.75},
        {"mois": "2001-04", "heures": 54.0},
    ]
    assert body["par_pavillon"] == [
        {"pavillon": "AAA", "heures": 150.5},
        {"pavillon": "BBB", "heures": 20.25},
        {"pavillon": None, "heures": 4.0},
    ]

    # La demande envoyée à l'éditeur : forme vérifiée lors de l'essai du 2026-11-24
    (demande,) = editeur.demandes
    assert demande.method == "GET"
    assert demande.url.host == "gateway.api.globalfishingwatch.org"
    assert demande.url.path == "/v3/4wings/report"
    assert dict(demande.url.params) == {
        "region-id": "8476",
        "region-dataset": "public-eez-areas",
        "datasets[0]": "public-global-fishing-effort:latest",
        "date-range": "2001-03-01,2001-05-01",
        "temporal-resolution": "MONTHLY",
        "group-by": "FLAG",
        "spatial-resolution": "LOW",
        "spatial-aggregation": "true",
        "format": "JSON",
    }
    assert demande.headers["authorization"] == f"Bearer {JETON_FICTIF}"


@pytest.mark.asyncio
async def test_l5_d_navires_observes(client: AsyncClient, autorite: dict, editeur: Editeur) -> None:
    resp = await client.get(
        BASE + "/navires", headers=autorite, params={"debut": "2001-03-01", "fin": "2001-05-01"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    _entete_attendu(body, debut="2001-03-01", fin="2001-05-01", publie="2001-05-06", retard=96)
    assert body["nb_navires"] == 2 and body["total_heures"] == 174.75
    premier, second = body["navires"]
    assert premier == {
        "vessel_id": "aaaa1111-fictif",
        "nom": "NAVIRE FICTIF UN",
        "pavillon": "AAA",
        "mmsi": "999000001",
        "numero_omi": "9990001",
        "indicatif": "FICT1",
        "engin": "trawlers",
        "heures": 120.5,
        "premiere_entree": "2001-03-02T00:00:00Z",
        "derniere_sortie": "2001-04-20T06:30:00Z",
    }
    # Valeurs absentes ou vides chez l'éditeur : champs vides, jamais inventés
    assert second["mmsi"] == "999000002"
    assert second["numero_omi"] is None and second["indicatif"] is None
    assert second["premiere_entree"] is None
    (demande,) = editeur.demandes
    assert demande.url.params["group-by"] == "VESSEL_ID"
    assert demande.url.params["temporal-resolution"] == "ENTIRE"


@pytest.mark.asyncio
async def test_l5_d_detections_radar(client: AsyncClient, autorite: dict, editeur: Editeur) -> None:
    resp = await client.get(
        BASE + "/detections-radar",
        headers=autorite,
        params={"debut": "2001-03-01", "fin": "2001-05-01"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Le radar est publié avec 5 jours de retard
    _entete_attendu(body, debut="2001-03-01", fin="2001-05-01", publie="2001-05-05", retard=120)
    assert body["total_detections"] == 50
    assert body["par_mois"] == [
        {"mois": "2001-03", "detections": 42},
        {"mois": "2001-04", "detections": 8},
    ]
    assert body["par_pavillon"] == [
        {"pavillon": None, "detections": 38},
        {"pavillon": "AAA", "detections": 12},
    ]
    (demande,) = editeur.demandes
    assert demande.url.params["datasets[0]"] == "public-global-sar-presence:latest"


@pytest.mark.asyncio
async def test_l5_d_evenements_peche_avec_lieu(
    client: AsyncClient, autorite: dict, editeur: Editeur
) -> None:
    """Acceptation : chaque épisode porte un lieu, cliquable sur la carte."""
    resp = await client.get(
        BASE + "/evenements-peche",
        headers=autorite,
        params={"debut": "2001-03-01", "fin": "2001-05-01"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    _entete_attendu(body, debut="2001-03-01", fin="2001-05-01", publie="2001-05-06", retard=96)
    assert "indice" in body["avertissement"]
    assert body["total"] == 2 and body["nb_affiches"] == 2
    premier, second = body["evenements"]
    assert premier["id"] == "evt-fictif-un"
    assert premier["vessel_id"] == "aaaa1111-fictif"
    assert premier["nom"] == "NAVIRE FICTIF UN"
    assert premier["mmsi"] == "999000001"
    assert (premier["longitude"], premier["latitude"]) == (8.55, -0.42)
    assert premier["heures"] == 3.5
    assert second["mmsi"] == "999000002"
    assert second["heures"] == 2.0  # durée déduite du début et de la fin
    assert (second["longitude"], second["latitude"]) == (9.12, 0.21)
    (demande,) = editeur.demandes
    assert demande.method == "POST"
    assert demande.url.path == "/v3/events"
    assert demande.url.params["limit"] == "400"
    corps = json.loads(demande.content)
    assert corps["datasets"] == ["public-global-fishing-events:latest"]
    assert corps["region"] == {"dataset": "public-eez-areas", "id": 8476}
    assert demande.headers["authorization"] == f"Bearer {JETON_FICTIF}"


@pytest.mark.asyncio
async def test_l5_d_fiche_d_identite_d_un_navire(
    client: AsyncClient, autorite: dict, editeur: Editeur
) -> None:
    resp = await client.get(BASE + "/navires/aaaa1111-fictif", headers=autorite)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["vessel_id"] == "aaaa1111-fictif"
    (registre,) = body["registre"]
    assert registre["nom"] == "NAVIRE FICTIF UN" and registre["numero_omi"] == "9990001"
    assert registre["engins"] == ["TRAWLERS"]
    assert (registre["longueur_m"], registre["jauge_brute"]) == (42.5, 380.0)
    (emission,) = body["emission"]
    assert emission["vessel_id"] == "aaaa1111-fictif" and emission["mmsi"] == "999000001"
    assert emission["derniere_emission"] == "2001-04-20T00:00:00Z"
    assert body["proprietaires"][0]["nom"] == "ARMEMENT FICTIF"
    assert body["autorisations"][0]["sources"] == ["ORGANISATION-FICTIVE"]
    assert body["attribution"]["mention"] == "Powered by Global Fishing Watch."
    assert body["fraicheur"]["en_cache"] is False
    (demande,) = editeur.demandes
    assert demande.url.path == "/v3/vessels/aaaa1111-fictif"
    assert dict(demande.url.params) == {"dataset": "public-global-vessel-identity:latest"}

    # Identifiant mal formé : refusé avant tout appel
    mal_forme = await client.get(BASE + "/navires/..%2Fsecret", headers=autorite)
    assert mal_forme.status_code in (404, 422)
    court = await client.get(BASE + "/navires/abc", headers=autorite)
    assert court.status_code == 422
    assert len(editeur.demandes) == 1

    editeur.statut = 404
    inconnu = await client.get(BASE + "/navires/cccc3333-fictif", headers=autorite)
    assert inconnu.status_code == 404
    assert inconnu.json()["code"] == "GFW_INTROUVABLE"


@pytest.mark.asyncio
async def test_l5_d_periode_par_defaut_incomplete_et_bornes(
    client: AsyncClient, autorite: dict, editeur: Editeur
) -> None:
    # Sans dates : la période se termine au dernier jour publié, sur 90 jours
    defaut = (await client.get(BASE + "/peche-apparente", headers=autorite)).json()
    assert defaut["periode"] == {"debut": "2001-02-05", "fin": "2001-05-06"}
    assert editeur.demandes[-1].url.params["date-range"] == "2001-02-05,2001-05-06"

    # Période qui dépasse le dernier jour publié : signalée, jamais tronquée en silence
    recente = await client.get(
        BASE + "/peche-apparente",
        headers=autorite,
        params={"debut": "2001-04-01", "fin": "2001-05-10"},
    )
    assert recente.json()["fraicheur"]["periode_incomplete"] is True
    assert recente.json()["periode"]["fin"] == "2001-05-10"

    avant = len(editeur.demandes)
    for params, code in (
        ({"debut": "2001-05-01", "fin": "2001-04-01"}, "PERIODE_INVALIDE"),
        ({"debut": "1999-01-01", "fin": "2001-04-01"}, "PERIODE_TROP_LONGUE"),
    ):
        resp = await client.get(BASE + "/navires", headers=autorite, params=params)
        assert resp.status_code == 400 and resp.json()["code"] == code
    mal_datee = await client.get(
        BASE + "/navires", headers=autorite, params={"debut": "pas-une-date"}
    )
    assert mal_datee.status_code == 422
    extreme = await client.get(BASE + "/navires", headers=autorite, params={"fin": "0001-01-05"})
    assert extreme.status_code == 400 and extreme.json()["code"] == "PERIODE_INVALIDE"
    assert len(editeur.demandes) == avant


@pytest.mark.asyncio
async def test_l5_d_suite_de_resultats_signalee(
    client: AsyncClient, autorite: dict, editeur: Editeur
) -> None:
    editeur.corps = _rapport(PECHE_PAR_MOIS_ET_PAVILLON, nextOffset=1000)
    body = (await client.get(BASE + "/peche-apparente", headers=autorite)).json()
    assert body["fraicheur"]["resultat_partiel"] is True


# --------------------------------------------------------------------------- #
# Cache, verrou, budget, erreurs
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l5_d_cache_un_rapport_demande_une_fois(
    client: AsyncClient, autorite: dict, editeur: Editeur, horloge
) -> None:
    params = {"debut": "2001-03-01", "fin": "2001-05-01"}
    premier = (await client.get(BASE + "/navires", headers=autorite, params=params)).json()
    horloge(hours=5)
    second = (await client.get(BASE + "/navires", headers=autorite, params=params)).json()
    assert len(editeur.demandes) == 1
    assert premier["fraicheur"]["en_cache"] is False
    assert second["fraicheur"]["en_cache"] is True
    # La date de fraîcheur reste celle de la réponse de l'éditeur
    assert second["fraicheur"]["recupere_a"] == premier["fraicheur"]["recupere_a"]
    assert second["navires"] == premier["navires"]

    # Autre période : autre rapport
    await client.get(
        BASE + "/navires", headers=autorite, params={"debut": "2001-01-01", "fin": "2001-02-01"}
    )
    assert len(editeur.demandes) == 2

    # Au-delà de la durée de cache (24 h), le rapport est redemandé
    horloge(hours=20)
    rafraichi = (await client.get(BASE + "/navires", headers=autorite, params=params)).json()
    assert len(editeur.demandes) == 3
    assert rafraichi["fraicheur"]["en_cache"] is False


@pytest.mark.asyncio
async def test_l5_d_un_seul_rapport_a_la_fois(
    client: AsyncClient, autorite: dict, editeur: Editeur
) -> None:
    """Verrou : des rapports demandés ensemble partent un par un chez l'éditeur."""
    editeur.retenir_les_appels()
    params = {"debut": "2001-03-01", "fin": "2001-05-01"}
    taches = [
        asyncio.create_task(client.get(BASE + route, headers=autorite, params=params))
        for route in ("/peche-apparente", "/navires", "/detections-radar", "/navires")
    ]
    await editeur.attendre_un_appel()
    await asyncio.sleep(0.3)  # le temps, pour les autres demandes, d'arriver au verrou
    # Tant que le premier rapport n'est pas revenu, aucun autre n'est parti
    assert (editeur.en_cours, len(editeur.demandes)) == (1, 1)

    editeur.liberer()
    reponses = await asyncio.gather(*taches)
    assert [r.status_code for r in reponses] == [200, 200, 200, 200]
    assert editeur.max_en_cours == 1
    # La demande identique profite du résultat de la première : trois appels, pas quatre
    assert len(editeur.demandes) == 3
    en_cache = sorted(r.json()["fraicheur"]["en_cache"] for r in reponses)
    assert en_cache == [False, False, False, True]


@pytest.mark.asyncio
async def test_l5_d_connexion_de_base_rendue_pendant_l_appel_a_l_editeur(
    client: AsyncClient, autorite: dict, editeur: Editeur, engine
) -> None:
    """Une demande qui attend l'éditeur ne garde aucune connexion de la réserve :
    quelques rapports lents ne doivent pas figer le reste de l'API."""
    editeur.retenir_les_appels()
    params = {"debut": "2001-03-01", "fin": "2001-05-01"}
    taches = [
        asyncio.create_task(client.get(BASE + route, headers=autorite, params=params))
        for route in ("/peche-apparente", "/navires", "/detections-radar")
    ]
    await editeur.attendre_un_appel()
    await asyncio.sleep(0.3)  # les deux autres demandes ont passé le contrôle du rôle
    assert engine.pool.checkedout() == 0

    editeur.liberer()
    assert [r.status_code for r in await asyncio.gather(*taches)] == [200, 200, 200]


@pytest.mark.asyncio
async def test_l5_d_rapport_en_cours_trop_long(
    client: AsyncClient, autorite: dict, editeur: Editeur, parametres
) -> None:
    """Un rapport qui dure : la demande suivante reçoit une réponse claire, sans attendre."""
    parametres(delai_reponse_secondes=0.05)
    editeur.retenir_les_appels()
    params = {"debut": "2001-03-01", "fin": "2001-05-01"}
    longue = asyncio.create_task(
        client.get(BASE + "/peche-apparente", headers=autorite, params=params)
    )
    await editeur.attendre_un_appel()

    bloquee = await client.get(BASE + "/detections-radar", headers=autorite, params=params)
    assert bloquee.status_code == 503
    assert bloquee.json()["code"] == "GFW_RAPPORT_EN_COURS"
    assert len(editeur.demandes) == 1

    editeur.liberer()
    assert (await longue).status_code == 200
    # Le verrou est rendu : la demande refusée aboutit ensuite
    ensuite = await client.get(BASE + "/detections-radar", headers=autorite, params=params)
    assert ensuite.status_code == 200
    assert editeur.max_en_cours == 1


@pytest.mark.asyncio
async def test_l5_d_budget_de_requetes_par_jour(
    client: AsyncClient, autorite: dict, editeur: Editeur, parametres, horloge
) -> None:
    parametres(budget_requetes_jour=2)
    for mois in ("01", "02"):
        ok = await client.get(
            BASE + "/navires",
            headers=autorite,
            params={"debut": f"2001-{mois}-01", "fin": f"2001-{mois}-20"},
        )
        assert ok.status_code == 200
    refuse = await client.get(
        BASE + "/navires", headers=autorite, params={"debut": "2001-03-01", "fin": "2001-03-20"}
    )
    assert refuse.status_code == 429
    assert refuse.json()["code"] == "GFW_BUDGET_ATTEINT"
    assert len(editeur.demandes) == 2
    # Une réponse déjà en cache reste servie
    encore = await client.get(
        BASE + "/navires", headers=autorite, params={"debut": "2001-01-01", "fin": "2001-01-20"}
    )
    assert encore.status_code == 200 and encore.json()["fraicheur"]["en_cache"] is True
    # Le lendemain, le budget repart
    horloge(days=1)
    demain = await client.get(
        BASE + "/navires", headers=autorite, params={"debut": "2001-03-01", "fin": "2001-03-20"}
    )
    assert demain.status_code == 200
    assert len(editeur.demandes) == 3


@pytest.mark.asyncio
async def test_l5_d_erreurs_de_l_editeur_et_jeton_jamais_renvoye(
    client: AsyncClient, autorite: dict, editeur: Editeur
) -> None:
    params = {"debut": "2001-03-01", "fin": "2001-05-01"}
    cas = [
        (401, 502, "GFW_ACCES_REFUSE"),
        (403, 502, "GFW_ACCES_REFUSE"),
        (422, 502, "GFW_DEMANDE_REFUSEE"),
        (429, 503, "GFW_LIMITE_EDITEUR"),
        (500, 502, "GFW_INDISPONIBLE"),
        (524, 502, "GFW_INDISPONIBLE"),
    ]
    for statut_editeur, statut, code in cas:
        editeur.statut = statut_editeur
        resp = await client.get(BASE + "/peche-apparente", headers=autorite, params=params)
        assert (resp.status_code, resp.json()["code"]) == (statut, code), statut_editeur
        assert JETON_FICTIF not in resp.text
        assert "erreur fictive" not in resp.text  # le corps de l'éditeur n'est pas relayé

    editeur.statut = 200
    editeur.exception = httpx.ReadTimeout("délai fictif")
    lent = await client.get(BASE + "/peche-apparente", headers=autorite, params=params)
    assert (lent.status_code, lent.json()["code"]) == (504, "GFW_DELAI_DEPASSE")
    editeur.exception = httpx.ConnectError("coupure fictive")
    coupe = await client.get(BASE + "/peche-apparente", headers=autorite, params=params)
    assert (coupe.status_code, coupe.json()["code"]) == (502, "GFW_INDISPONIBLE")

    editeur.exception = None
    editeur.corps = None
    etat = await client.get(BASE + "/etat", headers=autorite)
    assert JETON_FICTIF not in etat.text
    assert JETON_FICTIF not in repr(settings)


@pytest.mark.asyncio
async def test_l5_d_reponse_perimee_resservie_si_l_editeur_ne_repond_plus(
    client: AsyncClient, autorite: dict, editeur: Editeur, horloge
) -> None:
    params = {"debut": "2001-03-01", "fin": "2001-05-01"}
    fraiche = (await client.get(BASE + "/navires", headers=autorite, params=params)).json()
    horloge(hours=30)
    editeur.statut = 500
    resp = await client.get(BASE + "/navires", headers=autorite, params=params)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["fraicheur"]["perime"] is True and body["fraicheur"]["en_cache"] is True
    assert body["fraicheur"]["recupere_a"] == fraiche["fraicheur"]["recupere_a"]
    assert body["navires"] == fraiche["navires"]


@pytest.mark.asyncio
async def test_l5_d_fraicheur_d_une_reponse_en_cache(
    client: AsyncClient, autorite: dict, editeur: Editeur, horloge
) -> None:
    """La fraîcheur est celle de la réponse de l'éditeur, pas celle de la demande."""
    params = {"debut": "2001-04-01", "fin": "2001-05-07"}  # un jour au-delà du publié
    fraiche = (await client.get(BASE + "/navires", headers=autorite, params=params)).json()
    assert fraiche["fraicheur"]["donnees_jusqu_au"] == "2001-05-06"
    assert fraiche["fraicheur"]["periode_incomplete"] is True

    # Le lendemain, l'éditeur a publié ce jour, mais la réponse en cache ne le contient pas
    horloge(hours=23)
    resservie = (await client.get(BASE + "/navires", headers=autorite, params=params)).json()
    assert len(editeur.demandes) == 1
    assert resservie["fraicheur"]["en_cache"] is True
    assert resservie["fraicheur"]["donnees_jusqu_au"] == "2001-05-06"
    assert resservie["fraicheur"]["periode_incomplete"] is True


@pytest.mark.asyncio
async def test_l5_d_pas_de_repli_quand_l_editeur_refuse_l_acces(
    client: AsyncClient, autorite: dict, editeur: Editeur, horloge
) -> None:
    """Accès retiré par l'éditeur : l'ancienne réponse n'est plus servie."""
    params = {"debut": "2001-03-01", "fin": "2001-05-01"}
    assert (await client.get(BASE + "/navires", headers=autorite, params=params)).status_code == 200
    horloge(hours=30)
    for statut_editeur, code in ((401, "GFW_ACCES_REFUSE"), (403, "GFW_ACCES_REFUSE")):
        editeur.statut = statut_editeur
        resp = await client.get(BASE + "/navires", headers=autorite, params=params)
        assert resp.status_code == 502 and resp.json()["code"] == code


@pytest.mark.asyncio
async def test_l5_d_parametrage_versionne_et_echec_ferme(
    client: AsyncClient, autorite: dict, editeur: Editeur, parametres, tmp_path
) -> None:
    """Zone, jeux, retard et mention viennent du fichier versionné, pas du code."""
    parametres(
        zone={"identifiant": 1234, "jeu": "jeu-de-zones-fictif", "nom": "Zone fictive"},
        retard_publication_heures={"peche_apparente": 48, "detections_radar": 120},
        attribution={"mention": "Mention fictive.", "lien": "https://exemple.invalid"},
    )
    body = (await client.get(BASE + "/peche-apparente", headers=autorite)).json()
    assert editeur.demandes[-1].url.params["region-id"] == "1234"
    assert editeur.demandes[-1].url.params["region-dataset"] == "jeu-de-zones-fictif"
    assert body["zone"]["nom"] == "Zone fictive"
    assert body["fraicheur"]["donnees_jusqu_au"] == "2001-05-08"
    assert body["attribution"]["mention"] == "Mention fictive."

    (tmp_path / "gfw_source.json").write_text('{"source": {"zone": {}}}', encoding="utf-8")
    casse = await client.get(BASE + "/peche-apparente", headers=autorite)
    assert casse.status_code == 503 and casse.json()["code"] == "REGLE_INDISPONIBLE"


def test_l5_d_parametrage_du_depot_lisible() -> None:
    p = parametres_gfw()
    assert p.zone.identifiant == 8476 and p.zone.jeu == "public-eez-areas"
    assert p.attribution.mention == "Powered by Global Fishing Watch."
    assert p.retard_publication_heures.peche_apparente == 96
    # Très en dessous du plafond de l'éditeur (50 000 requêtes par jour)
    assert p.budget_requetes_jour <= 1000


# --------------------------------------------------------------------------- #
# Architecture : ces données ne déclenchent aucune alerte
# --------------------------------------------------------------------------- #


def test_l5_d_aucune_alerte_ni_ecriture_en_base() -> None:
    """Le module n'importe ni les alertes, ni les notifications, ni la session de base."""
    dossier = Path(gfw_service.__file__).parent
    interdits = ("app.modules.alertes", "app.modules.notifications", "app.db.session")
    for fichier in sorted(dossier.glob("*.py")):
        source = fichier.read_text(encoding="utf-8")
        assert "DbSession" not in source, fichier.name
        importes: set[str] = set()
        for noeud in ast.walk(ast.parse(source)):
            if isinstance(noeud, ast.ImportFrom) and noeud.module:
                importes.add(noeud.module)
            elif isinstance(noeud, ast.Import):
                importes.update(alias.name for alias in noeud.names)
        for module in importes:
            assert not module.startswith(interdits), (fichier.name, module)
            if fichier.name in ("client.py", "service.py", "parametres.py", "schemas.py"):
                assert not module.startswith("app.db"), (fichier.name, module)
            # Le jeton ne sort du réglage que dans le client
            if fichier.name != "client.py":
                assert "get_secret_value" not in source, fichier.name
