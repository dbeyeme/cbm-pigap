"""Lot 6 : prix de vente facultatif, courbes anonymes, carnet des déclarations.

Données fictives. Les seuils d'anonymat et le caractère facultatif du prix
restent au statut « Proposé ».
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from httpx import AsyncClient

from app.core.regles import charger_regles
from app.db.enums import RoleUtilisateur
from app.db.models import Capture
from app.tests.aides import (
    connexion,
    copier_regles,
    creer_compte,
    creer_embarcation,
    creer_pecheur,
    inserer_capture,
    instant_isole,
)

CAPTURES = "/api/v1/captures"
COURBES = "/api/v1/prix/courbes"
CARNET = "/api/v1/prix/carnet"
DASHBOARD = "/api/v1/dashboard"


async def _capture(
    client: AsyncClient,
    headers: dict,
    pecheur_id: str,
    embarcation_id: str,
    *,
    espece: str = "sardine",
    kg: float = 10,
    quand: datetime,
    prix: int | None = None,
) -> dict:
    corps: dict = {
        "pecheur_id": pecheur_id,
        "embarcation_id": embarcation_id,
        "espece": espece,
        "quantite_kg": kg,
        "methode": "filet_sardine",
        "point_debarquement": "Ozoungué",
        "date_capture": quand.isoformat(),
    }
    if prix is not None:
        corps["prix_fcfa_kg"] = prix
    resp = await client.post(CAPTURES, headers=headers, json=corps)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_l6_prix_facultatif_plafond_et_lecture(
    client: AsyncClient, agent_headers: dict
) -> None:
    p = await creer_pecheur(client, agent_headers, tag="L6P")
    e = await creer_embarcation(client, agent_headers, p["id"], tag="L6P")
    quand = instant_isole()

    sans = await _capture(client, agent_headers, p["id"], e["id"], quand=quand)
    assert sans["prix_fcfa_kg"] is None

    avec = await _capture(
        client, agent_headers, p["id"], e["id"], quand=quand + timedelta(hours=1), prix=600
    )
    assert avec["prix_fcfa_kg"] == 600

    trop = await client.post(
        CAPTURES,
        headers=agent_headers,
        json={
            "pecheur_id": p["id"],
            "embarcation_id": e["id"],
            "espece": "sardine",
            "quantite_kg": 1,
            "methode": "filet_sardine",
            "point_debarquement": "Ozoungué",
            "date_capture": (quand + timedelta(hours=2)).isoformat(),
            "prix_fcfa_kg": 10_000_001,
        },
    )
    assert trop.status_code == 422
    assert trop.json()["code"] == "PRIX_TROP_ELEVE"

    zero = await client.post(
        CAPTURES,
        headers=agent_headers,
        json={
            "pecheur_id": p["id"],
            "embarcation_id": e["id"],
            "espece": "sardine",
            "quantite_kg": 1,
            "methode": "filet_sardine",
            "point_debarquement": "Ozoungué",
            "date_capture": (quand + timedelta(hours=3)).isoformat(),
            "prix_fcfa_kg": 0,
        },
    )
    assert zero.status_code == 422


@pytest.mark.asyncio
async def test_l6_courbes_anonymat_et_parametrage(
    client: AsyncClient, agent_headers: dict, engine, tmp_path, monkeypatch
) -> None:
    t0 = instant_isole()
    pecheurs = []
    for i in range(2):
        p = await creer_pecheur(client, agent_headers, tag=f"L6A{i}")
        e = await creer_embarcation(client, agent_headers, p["id"], tag=f"L6A{i}")
        pecheurs.append((p, e))
        for j in range(3):
            await inserer_capture(
                engine,
                pecheur_id=p["id"],
                embarcation_id=e["id"],
                espece="sardine",
                quantite_kg=10,
                quand=t0 + timedelta(hours=j),
                prix_fcfa_kg=600 + i,
            )

    params = {
        "debut": (t0 - timedelta(hours=1)).isoformat(),
        "fin": (t0 + timedelta(days=1)).isoformat(),
        "grain": "jour",
        "espece": "sardine",
    }
    masque = await client.get(COURBES, headers=agent_headers, params=params)
    assert masque.status_code == 200, masque.text
    points = masque.json()["points"]
    assert points and points[0]["masque"] is True
    assert points[0]["prix_moyen_fcfa_kg"] is None
    assert points[0]["prix_reference_2024_fcfa_kg"] == 500
    assert masque.json()["anonymat_min_pecheurs"] == 3

    p3 = await creer_pecheur(client, agent_headers, tag="L6A2")
    e3 = await creer_embarcation(client, agent_headers, p3["id"], tag="L6A2")
    await inserer_capture(
        engine,
        pecheur_id=p3["id"],
        embarcation_id=e3["id"],
        espece="sardine",
        quantite_kg=10,
        quand=t0,
        prix_fcfa_kg=700,
    )
    ouvert = await client.get(COURBES, headers=agent_headers, params=params)
    point = ouvert.json()["points"][0]
    assert point["masque"] is False
    assert point["nb_pecheurs"] == 3
    assert point["prix_moyen_fcfa_kg"] is not None

    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(
        tmp_path,
        "prix_marche",
        {"diffusion": {"anonymat_min_declarations": 1, "anonymat_min_pecheurs": 1}},
    )
    p4 = await creer_pecheur(client, agent_headers, tag="L6A3")
    e4 = await creer_embarcation(client, agent_headers, p4["id"], tag="L6A3")
    t1 = instant_isole()
    await inserer_capture(
        engine,
        pecheur_id=p4["id"],
        embarcation_id=e4["id"],
        espece="sardine",
        quantite_kg=8,
        quand=t1,
        prix_fcfa_kg=550,
    )
    seul = await client.get(
        COURBES,
        headers=agent_headers,
        params={
            "debut": (t1 - timedelta(hours=1)).isoformat(),
            "fin": (t1 + timedelta(hours=1)).isoformat(),
            "grain": "jour",
            "espece": "sardine",
        },
    )
    assert seul.status_code == 200, seul.text
    assert seul.json()["anonymat_min_pecheurs"] == 1
    assert seul.json()["points"][0]["masque"] is False
    assert seul.json()["points"][0]["prix_moyen_fcfa_kg"] == 550.0


@pytest.mark.asyncio
async def test_l6_courbe_globale_ponderee(client: AsyncClient, agent_headers: dict, engine) -> None:
    t0 = instant_isole()
    for i in range(3):
        p = await creer_pecheur(client, agent_headers, tag=f"L6G{i}")
        e = await creer_embarcation(client, agent_headers, p["id"], tag=f"L6G{i}")
        for k in range(2):
            await inserer_capture(
                engine,
                pecheur_id=p["id"],
                embarcation_id=e["id"],
                espece="sardine",
                quantite_kg=10,
                quand=t0 + timedelta(minutes=k),
                prix_fcfa_kg=400,
            )
            await inserer_capture(
                engine,
                pecheur_id=p["id"],
                embarcation_id=e["id"],
                espece="capitaine",
                quantite_kg=10,
                quand=t0 + timedelta(minutes=10 + k),
                prix_fcfa_kg=800,
            )

    resp = await client.get(
        COURBES,
        headers=agent_headers,
        params={
            "debut": (t0 - timedelta(hours=1)).isoformat(),
            "fin": (t0 + timedelta(hours=1)).isoformat(),
            "grain": "jour",
        },
    )
    assert resp.status_code == 200, resp.text
    points = resp.json()["points"]
    globale = next(p for p in points if p["espece"] is None)
    sardine = next(p for p in points if p["espece"] == "sardine")
    assert globale["masque"] is False
    assert globale["nb_pecheurs"] == 3
    assert globale["prix_moyen_fcfa_kg"] == 600.0
    assert sardine["prix_moyen_fcfa_kg"] == 400.0


@pytest.mark.asyncio
async def test_l6_carnet_roles_rendement_sans_charges(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    t0 = instant_isole()
    p = await creer_pecheur(client, agent_headers, tag="L6C")
    e = await creer_embarcation(client, agent_headers, p["id"], tag="L6C")
    await inserer_capture(
        engine,
        pecheur_id=p["id"],
        embarcation_id=e["id"],
        espece="sardine",
        quantite_kg=10,
        quand=t0,
        prix_fcfa_kg=600,
    )
    await inserer_capture(
        engine,
        pecheur_id=p["id"],
        embarcation_id=e["id"],
        espece="capitaine",
        quantite_kg=4,
        quand=t0 + timedelta(hours=2),
    )

    moi = await connexion(client, p["email"])
    propre = await client.get(
        CARNET,
        headers=moi,
        params={
            "debut": (t0 - timedelta(hours=1)).isoformat(),
            "fin": (t0 + timedelta(days=1)).isoformat(),
        },
    )
    assert propre.status_code == 200, propre.text
    body = propre.json()
    assert body["pecheur_id"] == p["id"]
    assert body["volume_kg"] == 14
    assert body["valeur_declaree_fcfa"] == 6000
    # sardine déclaré 10×600 ; capitaine sans prix : référence 2024 (2 500)
    assert body["valeur_estimee_fcfa"] == 6000 + 4 * 2500
    assert body["jours"][0]["charges_fcfa"] is None
    assert body["jours"][0]["rendement_kg"] == 14
    assert "formule reste à valider" in body["note_rentabilite"]

    autre = await creer_pecheur(client, agent_headers, tag="L6X")
    h_autre = await connexion(client, autre["email"])
    vole = await client.get(CARNET, headers=h_autre, params={"pecheur_id": p["id"]})
    assert vole.status_code == 404

    agent = await client.get(CARNET, headers=agent_headers, params={"pecheur_id": p["id"]})
    assert agent.status_code == 200 and agent.json()["pecheur_id"] == p["id"]

    sans = await client.get(CARNET, headers=agent_headers)
    assert sans.status_code == 400 and sans.json()["code"] == "PECHEUR_REQUIS"

    _, h_chercheur = await creer_compte(engine, RoleUtilisateur.chercheur)
    chercheur = await client.get(CARNET, headers=h_chercheur, params={"pecheur_id": p["id"]})
    assert chercheur.status_code == 403 and chercheur.json()["code"] == "CARNET_INTERDIT"

    courbes_chercheur = await client.get(COURBES, headers=h_chercheur)
    assert courbes_chercheur.status_code == 200

    # Le chercheur ne relit pas le prix nominatif d'une déclaration
    detail_agent = await client.get(
        f"{CAPTURES}", headers=agent_headers, params={"pecheur_id": p["id"]}
    )
    assert any(c["prix_fcfa_kg"] == 600 for c in detail_agent.json())
    detail_chercheur = await client.get(
        f"{CAPTURES}", headers=h_chercheur, params={"pecheur_id": p["id"]}
    )
    assert detail_chercheur.status_code == 200
    assert all(c["prix_fcfa_kg"] is None for c in detail_chercheur.json())


@pytest.mark.asyncio
async def test_l6_dashboard_prefere_prix_declare(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    t0 = instant_isole()
    p = await creer_pecheur(client, agent_headers, tag="L6D")
    e = await creer_embarcation(client, agent_headers, p["id"], tag="L6D")
    await inserer_capture(
        engine,
        pecheur_id=p["id"],
        embarcation_id=e["id"],
        espece="sardine",
        quantite_kg=10,
        quand=t0,
        prix_fcfa_kg=800,
    )
    await inserer_capture(
        engine,
        pecheur_id=p["id"],
        embarcation_id=e["id"],
        espece="sardine",
        quantite_kg=10,
        quand=t0 + timedelta(hours=1),
    )
    res = await client.get(
        DASHBOARD,
        headers=agent_headers,
        params={
            "debut": (t0 - timedelta(hours=1)).isoformat(),
            "fin": (t0 + timedelta(days=1)).isoformat(),
        },
    )
    assert res.status_code == 200, res.text
    # 10 kg à 800 (déclaré) + 10 kg à 500 (référence 2024)
    assert res.json()["valeur_estimee_fcfa"] == 10 * 800 + 10 * 500


def test_l6_parametrage_et_migration() -> None:
    contenu = charger_regles("prix_marche")
    assert contenu["statut"] == "Proposé"
    assert contenu["saisie"]["prix_facultatif"] is True
    assert contenu["saisie"]["prix_max_fcfa_kg"] == 10_000_000
    assert contenu["diffusion"]["anonymat_min_declarations"] == 5
    assert contenu["diffusion"]["anonymat_min_pecheurs"] == 3
    assert set(contenu["explications"]) >= {
        "prix_facultatif",
        "anonymat_min_declarations",
        "anonymat_min_pecheurs",
    }
    assert Capture.__table__.c["prix_fcfa_kg"].nullable is True

    racine = Path(__file__).resolve().parents[2]
    config = Config(str(racine / "alembic.ini"))
    config.set_main_option("script_location", str(racine / "alembic"))
    script = ScriptDirectory.from_config(config)
    # Une seule tête, dont la chaîne contient la migration du lot (les lots suivants
    # ajoutent leurs migrations par-dessus : la tête exacte n'est pas figée ici).
    (tete,) = script.get_heads()
    assert "f5b8c9d0e371" in {r.revision for r in script.walk_revisions(base="base", head=tete)}
    assert script.get_revision("e4a7b8c9d260").down_revision == "d3f6a8b9c150"
