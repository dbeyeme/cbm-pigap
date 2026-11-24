"""Lot 2, partie G : fiche d'identité à deux volets (registre, suivi). Données fictives."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.enums import RoleUtilisateur, SourcePosition
from app.db.models import LogAcces
from app.tests.aides import (
    connexion,
    creer_compte,
    creer_embarcation,
    creer_organisation,
    creer_pecheur,
    inserer_positions,
    instant_isole,
)

LARGE = (8.02, -2.02)


async def _journal(engine, compte_id) -> list[LogAcces]:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            select(LogAcces).where(
                LogAcces.utilisateur_id == compte_id, LogAcces.ressource == "fiche_identite"
            )
        )
        return list(result.scalars().all())


@pytest.mark.asyncio
async def test_l2_g_fiche_a_deux_volets_registre_et_suivi(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    """Acceptation G : ce que dit le registre d'un côté, ce que l'embarcation émet de l'autre."""
    org = await creer_organisation(client, agent_headers, tag="L2G")
    delivree = date.today() - timedelta(days=30)
    p = await creer_pecheur(
        client,
        agent_headers,
        tag="L2G",
        organisation_id=org["id"],
        nationalite="gabonaise",
        date_delivrance_licence=delivree.isoformat(),
    )
    suivie = await creer_embarcation(
        client,
        agent_headers,
        p["id"],
        tag="L2G",
        nom=f"Alpha L2G {uuid.uuid4().hex[:8]}",
        longueur=9.5,
        materiau="bois",
        puissance_moteur_cv=40,
        site_attache="Débarcadère fictif",
        balise_id=f"BAL-FICTIF-{uuid.uuid4().hex[:8]}",
        equipements={"engins": ["filet"]},
        mmsi="626" + f"{uuid.uuid4().int % 1_000_000:06d}",
        annee_construction=2014,
        proprietaire="Propriétaire fictif",
    )
    muette = await creer_embarcation(
        client, agent_headers, p["id"], tag="L2G", nom=f"Bravo L2G {uuid.uuid4().hex[:8]}"
    )
    t0 = instant_isole()
    await inserer_positions(
        engine, suivie["id"], [(t0 + timedelta(minutes=10 * i), *LARGE) for i in range(3)]
    )
    await inserer_positions(
        engine,
        suivie["id"],
        [(t0 + timedelta(hours=1, minutes=30 * i), *LARGE) for i in range(2)],
        source=SourcePosition.balise,
    )
    compte_id, autorite = await creer_compte(engine, RoleUtilisateur.autorite)

    resp = await client.get(f"/api/v1/identite/pecheurs/{p['id']}", headers=autorite)
    assert resp.status_code == 200, resp.text
    fiche = resp.json()
    assert set(fiche) == {"pecheur_id", "registre", "suivi"} and fiche["pecheur_id"] == p["id"]

    # Volet registre
    registre = fiche["registre"]
    assert registre["identite"] == {
        "nom": p["nom"],
        "prenom": p["prenom"],
        "nationalite": "gabonaise",
        "statut": "actif",
    }
    licence = registre["licence"]
    assert licence["numero"] == p["numero_licence"] and licence["statut"] == "valide"
    assert licence["date_delivrance"] == delivree.isoformat()
    assert (
        licence["date_expiration"]
        == (delivree + timedelta(days=licence["validite_jours"])).isoformat()
    )
    assert registre["organisation"] == {"id": org["id"], "nom": org["nom"], "type": "cooperative"}
    alpha, bravo = registre["embarcations"]
    assert alpha["id"] == suivie["id"] and bravo["id"] == muette["id"]
    assert alpha["immatriculation"] == suivie["immatriculation"]
    assert (alpha["longueur_m"], alpha["materiau"], alpha["puissance_moteur_cv"]) == (
        9.5,
        "bois",
        40.0,
    )
    assert alpha["site_attache"] == "Débarcadère fictif" and alpha["balise"] is True
    assert alpha["equipements"] == {"engins": ["filet"]}
    assert alpha["mmsi"] == suivie["mmsi"] and alpha["annee_construction"] == 2014
    assert alpha["proprietaire"] == "Propriétaire fictif" and alpha["exploitant"] is None
    assert bravo["balise"] is False and bravo["mmsi"] is None

    # Volet suivi : source et âge du dernier relevé, période observée, nombre de relevés
    suivi = fiche["suivi"]
    assert suivi["nb_releves"] == 5
    s_alpha, s_bravo = suivi["embarcations"]
    assert s_alpha["embarcation_id"] == suivie["id"] and s_alpha["nb_releves"] == 5
    assert s_alpha["releves_par_source"] == {"balise": 2, "mobile": 3}
    dernier = t0 + timedelta(hours=1, minutes=30)
    assert s_alpha["dernier_releve"]["source"] == "balise"
    assert datetime.fromisoformat(s_alpha["dernier_releve"]["horodatage"]) == dernier
    age = (datetime.now(UTC) - dernier).total_seconds()
    assert abs(s_alpha["dernier_releve"]["age_secondes"] - age) < 120
    assert datetime.fromisoformat(s_alpha["periode_observee"]["debut"]) == t0
    assert datetime.fromisoformat(s_alpha["periode_observee"]["fin"]) == dernier
    assert s_bravo == {
        "embarcation_id": muette["id"],
        "nom": muette["nom"],
        "immatriculation": muette["immatriculation"],
        "dernier_releve": None,
        "periode_observee": None,
        "nb_releves": 0,
        "releves_par_source": {},
    }
    # Aucune position, aucune coordonnée personnelle dans la fiche
    for interdit in ("coordinates", "position", p["email"], "telephone", "8.02"):
        assert interdit not in resp.text, interdit

    # La consultation par un tiers est inscrite au journal des accès
    traces = await _journal(engine, compte_id)
    assert [t.action for t in traces] == ["consultation"]
    assert p["id"] in (traces[0].detail or "")


@pytest.mark.asyncio
async def test_l2_g_cloisonnement_par_role(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    org = await creer_organisation(client, agent_headers, tag="L2G")
    membre = await creer_pecheur(client, agent_headers, tag="L2G", organisation_id=org["id"])
    await creer_embarcation(client, agent_headers, membre["id"], tag="L2G")
    autre = await creer_pecheur(client, agent_headers, tag="L2G")
    fiche_membre = f"/api/v1/identite/pecheurs/{membre['id']}"
    fiche_autre = f"/api/v1/identite/pecheurs/{autre['id']}"
    inconnue = f"/api/v1/identite/pecheurs/{uuid.uuid4()}"

    for chemin in (fiche_membre, "/api/v1/identite/moi"):
        assert (await client.get(chemin)).status_code == 401

    # Le pêcheur lit sa fiche, par les deux chemins ; celle d'un autre n'existe pas pour lui
    h_membre = await connexion(client, membre["email"])
    moi = await client.get("/api/v1/identite/moi", headers=h_membre)
    assert moi.status_code == 200 and moi.json()["pecheur_id"] == membre["id"]
    la_sienne = await client.get(fiche_membre, headers=h_membre)
    assert la_sienne.status_code == 200
    assert la_sienne.json()["registre"] == moi.json()["registre"]
    for chemin in (fiche_autre, inconnue):
        refus = await client.get(chemin, headers=h_membre)
        assert refus.status_code == 404 and refus.json()["code"] == "PECHEUR_NOT_FOUND"

    # L'organisation lit la fiche de ses membres seulement ; la lecture est journalisée
    org_id, h_org = await creer_compte(
        engine, RoleUtilisateur.organisation, organisation_id=org["id"]
    )
    assert (await client.get(fiche_membre, headers=h_org)).status_code == 200
    assert (await client.get(fiche_autre, headers=h_org)).status_code == 404
    assert [t.action for t in await _journal(engine, org_id)] == ["consultation"]
    # Compte d'organisation sans rattachement : rien, jamais « tout voir »
    _, h_orphelin = await creer_compte(engine, RoleUtilisateur.organisation)
    assert (await client.get(fiche_membre, headers=h_orphelin)).status_code == 404

    # Rôles de contrôle : toute la flotte ; un pêcheur inexistant répond 404
    for role in (RoleUtilisateur.autorite, RoleUtilisateur.admin):
        _, h = await creer_compte(engine, role)
        assert (await client.get(fiche_membre, headers=h)).status_code == 200
        assert (await client.get(fiche_autre, headers=h)).status_code == 200
    assert (await client.get(inconnue, headers=agent_headers)).status_code == 404

    # Le chercheur n'a pas accès au registre nominatif ; « ma fiche » est réservée au pêcheur
    _, h_chercheur = await creer_compte(engine, RoleUtilisateur.chercheur)
    assert (await client.get(fiche_membre, headers=h_chercheur)).status_code == 403
    for headers in (agent_headers, h_org, h_chercheur):
        assert (await client.get("/api/v1/identite/moi", headers=headers)).status_code == 403

    # Le pêcheur qui lit sa propre fiche ne laisse pas de ligne au journal
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        siennes = (
            await session.execute(
                select(LogAcces).where(
                    LogAcces.utilisateur_id == uuid.UUID(membre["utilisateur_id"]),
                    LogAcces.ressource == "fiche_identite",
                )
            )
        ).all()
    assert siennes == []

    # Lecture seule : aucune écriture n'est proposée sur ces chemins
    for methode in ("post", "patch", "delete"):
        resp = await getattr(client, methode)(fiche_membre, headers=agent_headers)
        assert resp.status_code == 405

    # Organisation désactivée : son compte ne lit plus la fiche de ses membres
    desactivee = await client.patch(
        f"/api/v1/organisations/{org['id']}", headers=agent_headers, json={"actif": False}
    )
    assert desactivee.status_code == 200, desactivee.text
    refus = await client.get(fiche_membre, headers=h_org)
    assert refus.status_code == 404 and refus.json()["code"] == "PECHEUR_NOT_FOUND"
    assert len(await _journal(engine, org_id)) == 1  # aucune lecture de plus au journal
    # Le membre et les rôles de contrôle gardent leur accès
    assert (await client.get(fiche_membre, headers=h_membre)).status_code == 200
    assert (await client.get(fiche_membre, headers=agent_headers)).status_code == 200
    await client.patch(
        f"/api/v1/organisations/{org['id']}", headers=agent_headers, json={"actif": True}
    )
    assert (await client.get(fiche_membre, headers=h_org)).status_code == 200
