"""Lot 7 : commandes client → pêcheur (ADR-014). Données fictives."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from httpx import AsyncClient

from app.db.enums import RoleUtilisateur, StatutCommande
from app.db.models import Commande
from app.tests.aides import MOT_DE_PASSE, connexion, creer_compte, creer_pecheur

BASE = "/api/v1/commandes"


async def _inscrire_client(client: AsyncClient, *, tag: str = "L7") -> tuple[dict, dict]:
    suffix = uuid.uuid4().hex[:8]
    email = f"client.{tag.lower()}.{suffix}@example.com"
    resp = await client.post(
        f"{BASE}/inscription",
        json={
            "nom": f"Client fictif {tag} {suffix}",
            "email": email,
            "mot_de_passe": MOT_DE_PASSE,
        },
    )
    assert resp.status_code == 201, resp.text
    corps = resp.json()
    assert corps["email"] == email
    headers = await connexion(client, email)
    return corps, headers


@pytest.mark.asyncio
async def test_l7_parcours_complet_et_prix_facultatif(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur = await creer_pecheur(client, agent_headers, tag="L7")
    pecheur_headers = await connexion(client, pecheur["email"])
    _, client_headers = await _inscrire_client(client, tag="L7A")

    sans_montant = await client.post(
        BASE,
        headers=client_headers,
        json={"pecheur_id": pecheur["id"], "espece": "sardine", "quantite_kg": 5},
    )
    assert sans_montant.status_code == 201, sans_montant.text
    assert sans_montant.json()["statut"] == StatutCommande.reservee.value
    assert sans_montant.json()["montant_prevu_fcfa"] is None

    avec_montant = await client.post(
        BASE,
        headers=client_headers,
        json={
            "pecheur_id": pecheur["id"],
            "espece": "capitaine",
            "quantite_kg": 3,
            "montant_prevu_fcfa": 12_000,
            "message": "Retrait au marché fictif",
        },
    )
    assert avec_montant.status_code == 201
    commande_id = avec_montant.json()["id"]
    assert avec_montant.json()["montant_prevu_fcfa"] == 12_000

    acceptee = await client.post(f"{BASE}/{commande_id}/accepter", headers=pecheur_headers)
    assert acceptee.status_code == 200
    assert acceptee.json()["statut"] == StatutCommande.acceptee.value
    assert acceptee.json()["date_acceptee"] is not None

    vendeur = await client.post(f"{BASE}/{commande_id}/confirmer-vendeur", headers=pecheur_headers)
    assert vendeur.status_code == 200
    assert vendeur.json()["statut"] == StatutCommande.confirmee_vendeur.value

    livree = await client.post(f"{BASE}/{commande_id}/confirmer-client", headers=client_headers)
    assert livree.status_code == 200
    assert livree.json()["statut"] == StatutCommande.confirmee_client.value
    assert livree.json()["date_confirmee_client"] is not None

    annule_finale = await client.post(f"{BASE}/{commande_id}/annuler", headers=client_headers)
    assert annule_finale.status_code == 400
    assert annule_finale.json()["code"] == "STATUT_FINAL"


@pytest.mark.asyncio
async def test_l7_roles_et_perimetre(client: AsyncClient, agent_headers: dict) -> None:
    pecheur = await creer_pecheur(client, agent_headers, tag="L7B")
    pecheur_headers = await connexion(client, pecheur["email"])
    _, client_a = await _inscrire_client(client, tag="L7B1")
    _, client_b = await _inscrire_client(client, tag="L7B2")

    cree = await client.post(
        BASE,
        headers=client_a,
        json={"pecheur_id": pecheur["id"], "quantite_kg": 2, "espece": "sardine"},
    )
    assert cree.status_code == 201
    commande_id = cree.json()["id"]

    interdit_agent = await client.post(
        BASE,
        headers=agent_headers,
        json={"pecheur_id": pecheur["id"]},
    )
    assert interdit_agent.status_code == 403

    liste_client_a = await client.get(BASE, headers=client_a)
    assert liste_client_a.status_code == 200
    ids_a = {c["id"] for c in liste_client_a.json()}
    assert commande_id in ids_a

    liste_client_b = await client.get(BASE, headers=client_b)
    assert liste_client_b.status_code == 200
    assert commande_id not in {c["id"] for c in liste_client_b.json()}

    hors_perimetre = await client.get(f"{BASE}/{commande_id}", headers=client_b)
    assert hors_perimetre.status_code == 404
    assert hors_perimetre.json()["code"] == "COMMANDE_NOT_FOUND"

    liste_pecheur = await client.get(BASE, headers=pecheur_headers)
    assert liste_pecheur.status_code == 200
    assert commande_id in {c["id"] for c in liste_pecheur.json()}

    autre_pecheur = await creer_pecheur(client, agent_headers, tag="L7B3")
    autre_headers = await connexion(client, autre_pecheur["email"])
    refuse = await client.post(f"{BASE}/{commande_id}/accepter", headers=autre_headers)
    assert refuse.status_code == 404
    assert refuse.json()["code"] == "COMMANDE_NOT_FOUND"


@pytest.mark.asyncio
async def test_l7_annulation(client: AsyncClient, agent_headers: dict) -> None:
    pecheur = await creer_pecheur(client, agent_headers, tag="L7C")
    pecheur_headers = await connexion(client, pecheur["email"])
    _, client_headers = await _inscrire_client(client, tag="L7C")

    cree = await client.post(
        BASE,
        headers=client_headers,
        json={"pecheur_id": pecheur["id"], "espece": "thon"},
    )
    commande_id = cree.json()["id"]

    par_client = await client.post(f"{BASE}/{commande_id}/annuler", headers=client_headers)
    assert par_client.status_code == 200
    assert par_client.json()["statut"] == StatutCommande.annulee.value

    cree2 = await client.post(
        BASE,
        headers=client_headers,
        json={"pecheur_id": pecheur["id"], "espece": "maquereau"},
    )
    commande2 = cree2.json()["id"]
    await client.post(f"{BASE}/{commande2}/accepter", headers=pecheur_headers)

    par_pecheur = await client.post(f"{BASE}/{commande2}/annuler", headers=pecheur_headers)
    assert par_pecheur.status_code == 200
    assert par_pecheur.json()["statut"] == StatutCommande.annulee.value


@pytest.mark.asyncio
async def test_l7_staff_voit_toutes_les_commandes(
    client: AsyncClient, engine, agent_headers: dict
) -> None:
    pecheur = await creer_pecheur(client, agent_headers, tag="L7D")
    _, client_headers = await _inscrire_client(client, tag="L7D")
    cree = await client.post(
        BASE,
        headers=client_headers,
        json={"pecheur_id": pecheur["id"]},
    )
    commande_id = cree.json()["id"]

    _, admin_headers = await creer_compte(engine, RoleUtilisateur.admin)
    detail = await client.get(f"{BASE}/{commande_id}", headers=admin_headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == commande_id


def test_l7_modele_et_migration() -> None:
    assert RoleUtilisateur.client.value == "client"
    assert Commande.__tablename__ == "commandes"
    assert Commande.__table__.c["montant_prevu_fcfa"].nullable is True

    racine = Path(__file__).resolve().parents[2]
    config = Config(str(racine / "alembic.ini"))
    config.set_main_option("script_location", str(racine / "alembic"))
    script = ScriptDirectory.from_config(config)
    # Une seule tête, dont la chaîne contient la migration du lot (les lots suivants
    # ajoutent leurs migrations par-dessus : la tête exacte n'est pas figée ici).
    (tete,) = script.get_heads()
    assert "f5b8c9d0e371" in {r.revision for r in script.walk_revisions(base="base", head=tete)}
    assert script.get_revision("e4a7b8c9d260").down_revision == "d3f6a8b9c150"
