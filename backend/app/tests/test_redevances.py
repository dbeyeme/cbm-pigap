"""Référentiel espèces et redevances : taxe à la production, quittances, paiement démo."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.config import settings


async def _pecheur(client: AsyncClient, headers: dict, **extra) -> tuple[dict, str]:
    suffix = uuid.uuid4().hex[:8]
    email = f"redev.{suffix}@example.com"
    body = {
        "nom": f"Redevance-{suffix}",
        "prenom": "Test",
        "email": email,
        "mot_de_passe": "PecheurPass1!",
        "telephone": "077123456",
        **extra,
    }
    res = await client.post("/api/v1/pecheurs", headers=headers, json=body)
    assert res.status_code == 201, res.text
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "mot_de_passe": "PecheurPass1!"}
    )
    assert login.status_code == 200, login.text
    return res.json(), login.json()["access_token"]


async def _boat(client: AsyncClient, headers: dict, pecheur_id: str) -> str:
    suffix = uuid.uuid4().hex[:8]
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur_id,
            "nom": f"Pirogue {suffix}",
            "immatriculation": f"OW-{suffix}",
            "type": "pirogue",
            "type_pirogue": "artisanale_motorisee",
            "materiau": "bois",
            "puissance_moteur_cv": 40,
            "site_attache": "Ozoungué",
        },
    )
    assert emb.status_code == 201, emb.text
    body = emb.json()
    assert body["materiau"] == "bois" and body["puissance_moteur_cv"] == 40
    return body["id"]


async def _capture(client, headers, pecheur_id, emb_id, espece, kg, when=None):
    when = when or datetime.now(UTC)
    res = await client.post(
        "/api/v1/captures",
        headers=headers,
        json={
            "pecheur_id": pecheur_id,
            "embarcation_id": emb_id,
            "espece": espece,
            "quantite_kg": kg,
            "methode": "filet_sardine",
            "point_debarquement": "Ozoungué",
            "date_capture": when.isoformat(),
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_catalogue_referentiel(client: AsyncClient, agent_headers: dict) -> None:
    res = await client.get("/api/v1/captures/catalog", headers=agent_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["especes_detail"]) >= 26
    sardine = next(e for e in body["especes_detail"] if e["code"] == "sardine")
    assert sardine["groupe"] == "pelagique" and sardine["taux_taxe_fcfa_kg"] == 5
    assert "capitaine" in body["especes"] and "merou" in body["especes"]
    assert any(e["code"] == "filet_sardine" for e in body["engins_detail"])
    assert "Ozoungué" in body["sites_debarquement"]
    assert "merou_geant" in body["especes_protegees"]

    ref = await client.get("/api/v1/referentiels", headers=agent_headers)
    assert ref.status_code == 200, ref.text
    data = ref.json()
    assert data["a_valider_dgpa"] is True
    assert any(
        b["code"] == "maritime_etranger" and b["montant_fcfa"] == 150000
        for b in data["baremes"]["autorisation_annuelle"]
    )
    assert data["reperes_2024_grand_libreville"]["debarquements_t"] == 5294


@pytest.mark.asyncio
async def test_taxe_calculee_par_bareme(client: AsyncClient, agent_headers: dict) -> None:
    pecheur, _ = await _pecheur(client, agent_headers)
    emb = await _boat(client, agent_headers, pecheur["id"])
    c1 = await _capture(client, agent_headers, pecheur["id"], emb, "sardine", 10)
    assert c1["taxe_taux_kg"] == 5 and c1["taxe_fcfa"] == 50 and c1["taxe_statut"] == "due"
    c2 = await _capture(client, agent_headers, pecheur["id"], emb, "capitaine", 10)
    assert c2["taxe_fcfa"] == 250
    c3 = await _capture(
        client, agent_headers, pecheur["id"], emb, "barracuda", 4
    )  # alias de bécune
    assert c3["taxe_fcfa"] == 40
    c4 = await _capture(client, agent_headers, pecheur["id"], emb, "autre", 3)
    assert c4["taxe_statut"] == "sans_bareme" and c4["taxe_fcfa"] is None


@pytest.mark.asyncio
async def test_quittance_paiement_demo_et_gel(
    client: AsyncClient, agent_headers: dict, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "mobile_money_mode", "demo")
    pecheur, token = await _pecheur(client, agent_headers)
    emb = await _boat(client, agent_headers, pecheur["id"])
    c1 = await _capture(client, agent_headers, pecheur["id"], emb, "sardine", 20)
    await _capture(client, agent_headers, pecheur["id"], emb, "bossu", 4)

    # Encours : 100 + 100 FCFA
    enc = await client.get(
        "/api/v1/redevances/encours", headers=agent_headers, params={"pecheur_id": pecheur["id"]}
    )
    assert enc.status_code == 200, enc.text
    assert enc.json()["nb_captures"] == 2 and enc.json()["montant_fcfa"] == 200

    # Le pêcheur voit son propre encours et génère sa quittance
    me = {"Authorization": f"Bearer {token}"}
    enc_me = await client.get("/api/v1/redevances/encours", headers=me)
    assert enc_me.status_code == 200 and enc_me.json()["montant_fcfa"] == 200
    q = await client.post("/api/v1/redevances/quittances", headers=me, json={})
    assert q.status_code == 201, q.text
    quittance = q.json()
    assert quittance["numero"].startswith("QT-") and quittance["montant_fcfa"] == 200
    assert quittance["nb_captures"] == 2 and quittance["statut"] == "en_attente"

    # Capture figée
    upd = await client.patch(
        f"/api/v1/captures/{c1['id']}", headers=agent_headers, json={"quantite_kg": 50}
    )
    assert upd.status_code == 409, upd.text
    assert upd.json()["code"] == "CAPTURE_QUITTANCEE"

    # Paiement démo depuis le numéro enregistré du pêcheur
    pay = await client.post(
        f"/api/v1/redevances/quittances/{quittance['id']}/payer", headers=me, json={}
    )
    assert pay.status_code == 201, pay.text
    paiement = pay.json()["paiement"]
    assert paiement["operateur"] == "demo" and paiement["statut"] == "en_attente"
    assert paiement["msisdn"] == "24177123456"

    # Un autre numéro est refusé pour le pêcheur lui-même
    refus = await client.post(
        f"/api/v1/redevances/quittances/{quittance['id']}/payer",
        headers=me,
        json={"msisdn": "066000000"},
    )
    assert refus.status_code == 422

    conf = await client.post(
        f"/api/v1/redevances/paiements/{paiement['id']}/confirmer-demo", headers=me
    )
    assert conf.status_code == 200, conf.text
    assert conf.json()["quittance"]["statut"] == "payee"
    assert conf.json()["paiement"]["statut"] == "reussi"

    cap = await client.get(f"/api/v1/captures/{c1['id']}", headers=agent_headers)
    assert cap.json()["taxe_statut"] == "payee"

    # Plus rien de dû ; la synthèse comptabilise le paiement
    enc2 = await client.get(
        "/api/v1/redevances/encours", headers=agent_headers, params={"pecheur_id": pecheur["id"]}
    )
    assert enc2.json()["montant_fcfa"] == 0
    syn = await client.get("/api/v1/redevances/synthese", headers=agent_headers)
    assert syn.status_code == 200 and syn.json()["taxe_payee_fcfa"] >= 200

    pdf = await client.get(f"/api/v1/redevances/quittances/{quittance['id']}/pdf", headers=me)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    pub = await client.get(f"/api/v1/public/verif/quittance/{quittance['numero']}")
    assert pub.status_code == 200 and pub.json()["valide"] is True


@pytest.mark.asyncio
async def test_quittance_annulation_libere_les_captures(
    client: AsyncClient, agent_headers: dict
) -> None:
    pecheur, _ = await _pecheur(client, agent_headers)
    emb = await _boat(client, agent_headers, pecheur["id"])
    await _capture(client, agent_headers, pecheur["id"], emb, "mulet", 10)
    q = await client.post(
        "/api/v1/redevances/quittances", headers=agent_headers, json={"pecheur_id": pecheur["id"]}
    )
    assert q.status_code == 201, q.text
    vide = await client.post(
        "/api/v1/redevances/quittances", headers=agent_headers, json={"pecheur_id": pecheur["id"]}
    )
    assert vide.status_code == 400 and vide.json()["code"] == "AUCUNE_TAXE_DUE"
    ann = await client.post(
        f"/api/v1/redevances/quittances/{q.json()['id']}/annuler", headers=agent_headers
    )
    assert ann.status_code == 200 and ann.json()["statut"] == "annulee"
    enc = await client.get(
        "/api/v1/redevances/encours", headers=agent_headers, params={"pecheur_id": pecheur["id"]}
    )
    assert enc.json()["montant_fcfa"] == 100


@pytest.mark.asyncio
async def test_dashboard_indicateurs_effort(client: AsyncClient, agent_headers: dict) -> None:
    pecheur, _ = await _pecheur(client, agent_headers)
    emb = await _boat(client, agent_headers, pecheur["id"])
    when = datetime(2063, 3, 1, 8, 0, tzinfo=UTC) + timedelta(days=uuid.uuid4().int % 300)
    await _capture(client, agent_headers, pecheur["id"], emb, "sardine", 100, when)
    await _capture(
        client, agent_headers, pecheur["id"], emb, "capitaine", 10, when + timedelta(hours=2)
    )
    res = await client.get(
        "/api/v1/dashboard",
        headers=agent_headers,
        params={"debut": when.isoformat(), "fin": (when + timedelta(days=1)).isoformat()},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["nb_debarquements"] == 2 and body["jours_de_peche"] == 1
    assert body["kg_par_jour_de_peche"] == 110
    # sardine 500 FCFA/kg et capitaine 2 500 FCFA/kg (prix moyens 2024)
    assert body["valeur_estimee_fcfa"] == 100 * 500 + 10 * 2500
    assert body["taxe_due_fcfa"] == 500 + 250
    assert any(g["code"] == "pelagique" for g in body["repartition_groupes"])
    assert body["repartition_sites"][0]["libelle"] == "Ozoungué"
