"""Lot 11 (ADR-016) : sorties en mer, alerte de retard, lieu de pêche proposé, origine du lieu.

Données fictives. Chaque test fixe sa propre règle dans un dossier temporaire :
les valeurs proposées dans le dépôt peuvent évoluer sans casser les tests.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import Alerte
from app.modules.sorties import service as sorties_service
from app.modules.sorties.regles import RegleLieu
from app.tests.aides import (
    connexion,
    copier_regles,
    creer_embarcation,
    creer_pecheur,
    inserer_positions,
)

SORTIES = "/api/v1/sorties"
LIEU = "/api/v1/sorties/lieu-de-peche"
# Port d'Owendo (référentiel) et un poste de pêche fictif dans l'estuaire, loin des ports
OWENDO = (9.508, 0.283)
POSTE = (9.15, 0.15)

REGLE_DE_TEST = {
    "sorties": {
        "tolerance_retard_minutes": 60,
        "gravite_alerte": "critique",
        "duree_max_heures": 72,
        "avance_depart_max_minutes": 15,
        "verification_minutes": 5,
    },
    "lieu_de_peche": {
        "fenetre_heures": 24,
        "rayon_regroupement_km": 2,
        "intervalle_max_minutes": 65,
        "vitesse_max_noeuds": None,
        "releves_min": 2,
    },
}


@pytest.fixture
def regle(tmp_path, monkeypatch):
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(tmp_path, "sorties", REGLE_DE_TEST)

    def changer(**sorties) -> None:
        copier_regles(tmp_path, "sorties", {"sorties": sorties})

    return changer


async def _pecheur_et_bateau(client: AsyncClient, admin_headers: dict) -> tuple[dict, dict, dict]:
    pecheur = await creer_pecheur(client, admin_headers, tag="L11")
    emb = await creer_embarcation(client, admin_headers, pecheur["id"], tag="L11")
    headers = await connexion(client, pecheur["email"])
    return pecheur, emb, headers


def _sortie(emb_id: str, depart: datetime, *, heures: float = 8, **champs) -> dict:
    return {
        "client_id": str(uuid.uuid4()),
        "embarcation_id": emb_id,
        "port_depart_id": "owendo",
        "depart_a": depart.isoformat(),
        "retour_prevu_a": (depart + timedelta(hours=heures)).isoformat(),
        **champs,
    }


@pytest.mark.asyncio
async def test_declaration_idempotente_et_retour(client: AsyncClient, admin_headers, regle) -> None:
    _, emb, headers = await _pecheur_et_bateau(client, admin_headers)
    depart = datetime.now(UTC) - timedelta(hours=1)
    corps = _sortie(emb["id"], depart, secteur_vise="large-libreville")

    cree = await client.post(SORTIES, headers=headers, json=corps)
    assert cree.status_code == 201, cree.text
    s = cree.json()
    assert s["statut"] == "en_cours"
    assert s["port_depart_nom"] == "Port d'Owendo"
    assert s["position_depart"]["coordinates"] == list(OWENDO)
    assert s["secteur_vise_nom"].startswith("Large de Libreville")

    # Renvoi du téléphone : même sortie, aucune création
    renvoi = await client.post(SORTIES, headers=headers, json=corps)
    assert renvoi.status_code == 200, renvoi.text
    assert renvoi.json()["id"] == s["id"]

    # Une seule sortie en cours par embarcation
    autre = await client.post(SORTIES, headers=headers, json=_sortie(emb["id"], depart))
    assert autre.status_code == 409
    assert autre.json()["code"] == "SORTIE_DEJA_EN_COURS"

    # Retour fait hors ligne : renvoi complet de la même déclaration
    retour = await client.post(
        SORTIES,
        headers=headers,
        json={**corps, "retour_a": datetime.now(UTC).isoformat(), "port_retour_id": "libreville"},
    )
    assert retour.status_code == 200, retour.text
    fini = retour.json()
    assert fini["statut"] == "terminee"
    assert fini["port_retour_nom"] is not None
    assert fini["retour_constate_par"] == "pecheur"

    deja = await client.post(f"{SORTIES}/{s['id']}/retour", headers=headers, json={})
    assert deja.status_code == 409
    assert deja.json()["code"] == "SORTIE_DEJA_TERMINEE"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("champs", "motif"),
    [
        ({"heures": -1}, "suivre"),
        ({"heures": 100}, "dépasser"),
        ({"port_depart_id": "port-imaginaire"}, "Port"),
        ({"port_depart_id": None}, "port de départ"),
        ({"secteur_vise": "secteur-imaginaire"}, "Secteur"),
    ],
)
async def test_declaration_refusee(
    client: AsyncClient, admin_headers, regle, champs, motif
) -> None:
    _, emb, headers = await _pecheur_et_bateau(client, admin_headers)
    heures = champs.pop("heures", 8)
    corps = _sortie(emb["id"], datetime.now(UTC) - timedelta(hours=1), heures=heures, **champs)
    resp = await client.post(SORTIES, headers=headers, json=corps)
    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "SORTIE_INVALIDE"
    assert motif in resp.json()["detail"]


@pytest.mark.asyncio
async def test_depart_dans_le_futur_refuse(client: AsyncClient, admin_headers, regle) -> None:
    _, emb, headers = await _pecheur_et_bateau(client, admin_headers)
    corps = _sortie(emb["id"], datetime.now(UTC) + timedelta(hours=2))
    resp = await client.post(SORTIES, headers=headers, json=corps)
    assert resp.status_code == 422
    assert "futur" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cloisonnement(client: AsyncClient, admin_headers, agent_headers, regle) -> None:
    _, emb, headers = await _pecheur_et_bateau(client, admin_headers)
    _, _, intrus = await _pecheur_et_bateau(client, admin_headers)
    corps = _sortie(emb["id"], datetime.now(UTC) - timedelta(hours=1))

    # Un autre pêcheur ne déclare pas pour ce bateau et ne voit pas la sortie
    refus = await client.post(SORTIES, headers=intrus, json=corps)
    assert refus.status_code == 404
    s = (await client.post(SORTIES, headers=headers, json=corps)).json()
    assert (await client.get(f"{SORTIES}/{s['id']}", headers=intrus)).status_code == 404
    liste = await client.get(SORTIES, headers=intrus)
    assert s["id"] not in {x["id"] for x in liste.json()}
    retour_intrus = await client.post(f"{SORTIES}/{s['id']}/retour", headers=intrus, json={})
    assert retour_intrus.status_code == 404

    # L'agent de contrôle voit la sortie et constate le retour au port
    vue = await client.get(SORTIES, headers=agent_headers, params={"embarcation_id": emb["id"]})
    assert s["id"] in {x["id"] for x in vue.json()}
    constat = await client.post(
        f"{SORTIES}/{s['id']}/retour", headers=agent_headers, json={"port_retour_id": "owendo"}
    )
    assert constat.status_code == 200, constat.text
    assert constat.json()["retour_constate_par"] == "agent_controle"


@pytest.mark.asyncio
async def test_sans_authentification(client: AsyncClient) -> None:
    assert (await client.get(SORTIES)).status_code == 401


@pytest.mark.asyncio
async def test_retard_alerte_unique(client: AsyncClient, admin_headers, engine, regle) -> None:
    _, emb, headers = await _pecheur_et_bateau(client, admin_headers)
    depart = datetime.now(UTC) - timedelta(hours=10)
    corps = _sortie(emb["id"], depart, heures=8)  # retour prévu il y a 2 h
    s = (await client.post(SORTIES, headers=headers, json=corps)).json()
    assert s["statut"] == "en_retard"
    assert s["retard_minutes"] >= 119
    await inserer_positions(engine, emb["id"], [(depart + timedelta(hours=1), *POSTE)])

    retards = await client.get(SORTIES, headers=admin_headers, params={"statut": "en_retard"})
    assert s["id"] in {x["id"] for x in retards.json()}

    fabrique = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with fabrique() as db:
        assert await sorties_service.verifier_retards(db) >= 1
        assert await sorties_service.verifier_retards(db) == 0
        alertes = (
            (
                await db.execute(
                    select(Alerte).where(
                        Alerte.declencheur["sortie_id"].astext == s["id"],
                    )
                )
            )
            .scalars()
            .all()
        )
    assert len(alertes) == 1
    d = alertes[0].declencheur
    assert d["regle"] == "sortie_non_rentree"
    assert d["position"]["coordinates"] == list(POSTE)
    assert d["parametrage"]["statut"] == "Proposé"
    assert alertes[0].niveau_gravite.value == "critique"
    lu = await client.get(f"{SORTIES}/{s['id']}", headers=headers)
    assert lu.json()["alerte_emise"] is True


@pytest.mark.asyncio
async def test_tolerance_parametree(client: AsyncClient, admin_headers, regle) -> None:
    _, emb, headers = await _pecheur_et_bateau(client, admin_headers)
    corps = _sortie(emb["id"], datetime.now(UTC) - timedelta(hours=10), heures=8)
    s = (await client.post(SORTIES, headers=headers, json=corps)).json()
    assert s["statut"] == "en_retard"
    # Même sortie, tolérance portée à 3 h : plus en retard, sans toucher au code
    regle(**{**REGLE_DE_TEST["sorties"], "tolerance_retard_minutes": 180})
    lu = await client.get(f"{SORTIES}/{s['id']}", headers=headers)
    assert lu.json()["statut"] == "en_cours"


# --------------------------------------------------------------------------- #
# Lieu de pêche proposé
# --------------------------------------------------------------------------- #


def test_point_le_plus_frequente_ignore_port_et_transit() -> None:
    regle = RegleLieu(**REGLE_DE_TEST["lieu_de_peche"])
    t0 = datetime(2026, 11, 1, 5, tzinfo=UTC)
    releves = [(t0 + timedelta(minutes=15 * i), *OWENDO) for i in range(8)]  # 2 h au port
    releves += [(t0 + timedelta(minutes=120 + 15 * i), 9.30, 0.22) for i in range(2)]  # transit
    releves += [
        (t0 + timedelta(minutes=150 + 15 * i), POSTE[0] + 0.001 * (i % 3), POSTE[1])
        for i in range(12)
    ]
    ports = [(OWENDO[0], OWENDO[1], 6.0)]
    point, n, cumul = sorties_service.point_le_plus_frequente(
        [(lon, lat, t) for t, lon, lat in releves], regle, ports
    )
    assert point is not None
    assert abs(point[0] - POSTE[0]) < 0.01 and abs(point[1] - POSTE[1]) < 0.01
    assert n == 13  # relevés hors port suivis d'un relevé, transit compris
    assert cumul >= 11 * 15 * 60


@pytest.mark.asyncio
async def test_lieu_de_peche_depuis_la_sortie(
    client: AsyncClient, admin_headers, engine, regle
) -> None:
    _, emb, headers = await _pecheur_et_bateau(client, admin_headers)
    depart = datetime.now(UTC) - timedelta(hours=8)
    vide = await client.get(
        LIEU, headers=headers, params={"embarcation_id": emb["id"], "avant": depart.isoformat()}
    )
    assert vide.status_code == 200
    assert vide.json()["disponible"] is False and vide.json()["position"] is None

    corps = _sortie(emb["id"], depart, heures=10)
    await client.post(SORTIES, headers=headers, json=corps)
    await inserer_positions(
        engine,
        emb["id"],
        [(depart + timedelta(minutes=10 * i), *OWENDO) for i in range(3)]
        + [(depart + timedelta(minutes=60 + 15 * i), *POSTE) for i in range(10)],
    )
    capture_a = depart + timedelta(hours=6)
    resp = await client.get(
        LIEU, headers=headers, params={"embarcation_id": emb["id"], "avant": capture_a.isoformat()}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["disponible"] is True
    assert body["position"]["coordinates"] == list(POSTE)
    assert body["duree_minutes"] >= 120
    assert body["regle"]["statut"] == "Proposé"
    assert datetime.fromisoformat(body["debut"]) == depart.replace(microsecond=depart.microsecond)

    # Un autre pêcheur n'obtient rien sur ce bateau
    _, _, intrus = await _pecheur_et_bateau(client, admin_headers)
    refus = await client.get(
        LIEU, headers=intrus, params={"embarcation_id": emb["id"], "avant": capture_a.isoformat()}
    )
    assert refus.status_code == 404


# --------------------------------------------------------------------------- #
# Origine du lieu d'une capture
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_origine_du_lieu_de_capture(client: AsyncClient, admin_headers) -> None:
    pecheur = await creer_pecheur(client, admin_headers, tag="L11")
    emb = await creer_embarcation(client, admin_headers, pecheur["id"], tag="L11")
    base = {
        "pecheur_id": pecheur["id"],
        "embarcation_id": emb["id"],
        "espece": "capitaine",
        "quantite_kg": 10,
        "methode": "filet",
        "point_debarquement": "Owendo",
        "date_capture": datetime(2026, 11, 2, 6, tzinfo=UTC).isoformat(),
    }
    avec = await client.post(
        "/api/v1/captures",
        headers=admin_headers,
        json={
            **base,
            "position_capture": {"type": "Point", "coordinates": list(POSTE)},
            "origine_lieu": "trace",
        },
    )
    assert avec.status_code == 201, avec.text
    assert avec.json()["origine_lieu"] == "trace"

    sans = await client.post(
        "/api/v1/captures", headers=admin_headers, json={**base, "origine_lieu": "gps"}
    )
    assert sans.status_code == 201, sans.text
    assert sans.json()["origine_lieu"] is None

    inconnue = await client.post(
        "/api/v1/captures", headers=admin_headers, json={**base, "origine_lieu": "devinette"}
    )
    assert inconnue.status_code == 422

    retire = await client.patch(
        f"/api/v1/captures/{avec.json()['id']}",
        headers=admin_headers,
        json={"position_capture": None},
    )
    assert retire.status_code == 200, retire.text
    assert retire.json()["origine_lieu"] is None
