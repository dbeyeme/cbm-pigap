"""Présence au port calculée depuis le GPS PIGAP (sans matériel)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.modules.ais_gabon.ports import port_from_text
from app.modules.captures.schemas import ESPECES_MVP, METHODES_MVP
from app.modules.geolocalisation.gabon_routes import is_on_water

OWENDO = (9.505, 0.280)
LARGE_ESTUAIRE = (9.20, 0.30)  # au large, hors rayon portuaire
PORT_GENTIL = (8.782, -0.717)


async def _pecheur_et_embarcation(client: AsyncClient, headers: dict, nom: str) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": f"Presence-{suffix}",
            "prenom": "Test",
            "email": f"presence.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": nom,
            "immatriculation": f"GA-PR-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pecheur.json()["id"], emb.json()["id"]


async def _positions(
    client: AsyncClient,
    headers: dict,
    emb_id: str,
    points: list[tuple[datetime, tuple[float, float]]],
) -> None:
    # Envoi point par point : le test porte sur la présence au port, pas sur la
    # validation de continuité des trajectoires (couverte par test_m2_geoloc).
    for ts, (lon, lat) in points:
        resp = await client.post(
            "/api/v1/positions",
            headers=headers,
            json={
                "embarcation_id": emb_id,
                "position": {"type": "Point", "coordinates": [lon, lat]},
                "horodatage": ts.isoformat(),
                "source": "mobile",
            },
        )
        assert resp.status_code == 201, resp.text


def test_port_zones_are_water() -> None:
    """Les quais hors polygone ZEE (Port-Gentil) doivent accepter des positions GPS."""
    assert is_on_water(*PORT_GENTIL) is True
    assert is_on_water(*OWENDO) is True
    assert is_on_water(10.0, -0.7) is False


def test_port_from_text_matches_declared_landing_points() -> None:
    assert port_from_text("Débarcadère de Port-Gentil").id == "port-gentil"
    assert port_from_text("owendo").id == "owendo"
    assert port_from_text("plage sans nom") is None


@pytest.mark.asyncio
async def test_presence_a_quai_en_mer_et_declaration(
    client: AsyncClient, agent_headers: dict
) -> None:
    now = datetime.now(UTC)

    # Pirogue A : immobile à Owendo depuis 40 min → à quai
    pecheur_a, emb_a = await _pecheur_et_embarcation(client, agent_headers, "Pirogue Quai")
    await _positions(
        client,
        agent_headers,
        emb_a,
        [
            (now - timedelta(minutes=40), OWENDO),
            (now - timedelta(minutes=25), (OWENDO[0] + 0.0005, OWENDO[1])),
            (now - timedelta(minutes=10), OWENDO),
        ],
    )
    # Déclaration de débarquement à Owendo il y a 30 min → cohérente
    cap = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur_a,
            "embarcation_id": emb_a,
            "espece": ESPECES_MVP[0],
            "quantite_kg": 42.5,
            "methode": METHODES_MVP[0],
            "point_debarquement": "Port d'Owendo",
            "date_capture": (now - timedelta(minutes=30)).isoformat(),
        },
    )
    assert cap.status_code == 201, cap.text

    # Pirogue B : à Owendo il y a 3 h, puis au large → en mer, partie d'Owendo
    _, emb_b = await _pecheur_et_embarcation(client, agent_headers, "Pirogue Large")
    await _positions(
        client,
        agent_headers,
        emb_b,
        [
            (now - timedelta(hours=3), OWENDO),
            (now - timedelta(hours=2, minutes=40), OWENDO),
            (now - timedelta(hours=2), LARGE_ESTUAIRE),
            (now - timedelta(minutes=20), LARGE_ESTUAIRE),
        ],
    )

    # Pirogue C : arrivée à Owendo il y a 3 min → en manœuvre (< seuil)
    _, emb_c = await _pecheur_et_embarcation(client, agent_headers, "Pirogue Arrivee")
    await _positions(
        client,
        agent_headers,
        emb_c,
        [
            (now - timedelta(minutes=30), LARGE_ESTUAIRE),
            (now - timedelta(minutes=3), OWENDO),
        ],
    )

    resp = await client.get(
        "/api/v1/positions/presence-ports", headers=agent_headers, params={"fenetre_heures": 24}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["seuil_minutes"] >= 1
    ports = {p["id"]: p for p in body["ports"]}
    owendo = ports["owendo"]

    by_id = {e["embarcation_id"]: e for e in owendo["embarcations"]}
    a = by_id[emb_a]
    assert a["statut"] == "a_quai"
    assert a["port_id"] == "owendo"
    assert a["declaration"]["coherence"] == "coherente"
    assert a["declaration"]["port_id"] == "owendo"

    c = by_id[emb_c]
    assert c["statut"] == "en_manoeuvre"

    assert owendo["a_quai"] >= 1
    assert owendo["en_manoeuvre"] >= 1
    assert owendo["arrivees"] >= 1  # pirogue C
    assert owendo["departs"] >= 1  # pirogue B
    assert owendo["debarquements_declares"] >= 1

    en_mer = {e["embarcation_id"]: e for e in body["en_mer"]}
    b = en_mer[emb_b]
    assert b["statut"] == "en_mer"
    assert b["dernier_port_id"] == "owendo"
    assert b["dernier_depart"] is not None
    assert not body["incoherences"] or all(
        i["embarcation_id"] != emb_a for i in body["incoherences"]
    )


@pytest.mark.asyncio
async def test_declaration_sans_presence_gps_est_signalee(
    client: AsyncClient, agent_headers: dict
) -> None:
    now = datetime.now(UTC)
    pecheur, emb = await _pecheur_et_embarcation(client, agent_headers, "Pirogue Incoherente")
    # GPS uniquement au large ; déclaration de débarquement à Port-Gentil
    await _positions(
        client,
        agent_headers,
        emb,
        [(now - timedelta(hours=2), LARGE_ESTUAIRE), (now - timedelta(minutes=15), LARGE_ESTUAIRE)],
    )
    cap = await client.post(
        "/api/v1/captures",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur,
            "embarcation_id": emb,
            "espece": ESPECES_MVP[0],
            "quantite_kg": 12,
            "methode": METHODES_MVP[0],
            "point_debarquement": "Port-Gentil",
            "date_capture": (now - timedelta(minutes=30)).isoformat(),
        },
    )
    assert cap.status_code == 201, cap.text
    resp = await client.get("/api/v1/positions/presence-ports", headers=agent_headers)
    assert resp.status_code == 200, resp.text
    inc = [i for i in resp.json()["incoherences"] if i["embarcation_id"] == emb]
    assert len(inc) == 1
    assert inc[0]["port_id"] == "port-gentil"
    assert inc[0]["coherence"] == "incoherente"


@pytest.mark.asyncio
async def test_presence_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/positions/presence-ports")
    assert resp.status_code == 401
