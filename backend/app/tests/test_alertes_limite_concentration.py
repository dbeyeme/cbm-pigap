"""Règles §5.3 / §5.7 : dépassement de limite géographique et concentration."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.config import settings

# Estuaire du Komo (bras de mer) : points acceptés par le masque d'eau
ESTUAIRE = [9.20, 0.42]
# Zone autorisée étroite autour de l'estuaire
RING_AUTORISEE = [
    [9.19, 0.41],
    [9.21, 0.41],
    [9.21, 0.43],
    [9.19, 0.43],
    [9.19, 0.41],
]
# Au large de Port-Gentil : en mer, hors de la zone autorisée
LARGE_PORT_GENTIL = [8.60, -0.75]


async def _boat(client: AsyncClient, headers: dict, tag: str) -> str:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": f"Limite-{tag}",
            "prenom": "Test",
            "numero_licence": f"LIC-LC-{suffix}",
            "email": f"lc.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": f"Pirogue {tag}",
            "immatriculation": f"GA-LC-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return emb.json()["id"]


async def _position(client: AsyncClient, headers: dict, emb: str, coords, when: datetime):
    r = await client.post(
        "/api/v1/positions",
        headers=headers,
        json={
            "embarcation_id": emb,
            "position": {"type": "Point", "coordinates": coords},
            "horodatage": when.isoformat(),
            "source": "mobile",
        },
    )
    assert r.status_code == 201, r.text


async def _alertes_regle(client: AsyncClient, headers: dict, regle: str, *, emb: str | None):
    params = {"type_alerte": "anomalie", "limit": 500}
    if emb:
        params["embarcation_id"] = emb
    r = await client.get("/api/v1/alertes", headers=headers, params=params)
    assert r.status_code == 200, r.text
    return [a for a in r.json() if (a.get("declencheur") or {}).get("regle") == regle]


def _unique_when(offset_days: int = 0) -> datetime:
    """Horodatage unique (futur) : indépendant des données résiduelles."""
    base = datetime(2062, 1, 1, 12, 0, tzinfo=UTC)
    return base + timedelta(days=(uuid.uuid4().int % 5000) + offset_days)


@pytest.mark.asyncio
async def test_sortie_limite_geographique_positif_et_negatif(
    client: AsyncClient, agent_headers: dict
) -> None:
    suffix = uuid.uuid4().hex[:6]
    zone = await client.post(
        "/api/v1/zones",
        headers=agent_headers,
        json={
            "nom": f"Zone autorisée estuaire {suffix}",
            "type": "autorisee",
            "geometrie": {"type": "Polygon", "coordinates": [RING_AUTORISEE]},
            "actif": True,
        },
    )
    assert zone.status_code == 201, zone.text
    when = _unique_when()

    # Dans la zone autorisée : aucune alerte de limite
    emb_in = await _boat(client, agent_headers, "in")
    await _position(client, agent_headers, emb_in, ESTUAIRE, when)
    assert (
        await _alertes_regle(client, agent_headers, "sortie_limite_geographique", emb=emb_in) == []
    )

    # Au large, hors de toute zone autorisée : alerte critique
    emb_out = await _boat(client, agent_headers, "out")
    await _position(client, agent_headers, emb_out, LARGE_PORT_GENTIL, when)
    found = await _alertes_regle(client, agent_headers, "sortie_limite_geographique", emb=emb_out)
    assert len(found) == 1, found
    assert found[0]["niveau_gravite"] == "critique"
    assert found[0]["declencheur"]["limite"] == "zones_autorisees"

    # Anti-doublon : une seconde position le même jour n'ajoute pas d'alerte
    await _position(client, agent_headers, emb_out, LARGE_PORT_GENTIL, when + timedelta(minutes=10))
    assert (
        len(await _alertes_regle(client, agent_headers, "sortie_limite_geographique", emb=emb_out))
        == 1
    )


@pytest.mark.asyncio
async def test_concentration_zone_positif_et_negatif(
    client: AsyncClient, agent_headers: dict, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "alerte_concentration_seuil", 3)
    when = _unique_when()

    boats = [await _boat(client, agent_headers, f"c{i}") for i in range(3)]
    # Deux embarcations : sous le seuil
    await _position(client, agent_headers, boats[0], ESTUAIRE, when)
    await _position(client, agent_headers, boats[1], [9.201, 0.421], when + timedelta(minutes=5))
    avant = await _alertes_regle(client, agent_headers, "concentration_zone", emb=None)
    assert not any(
        a["declencheur"]["horodatage"].startswith(when.date().isoformat()) for a in avant
    )

    # Troisième embarcation dans le rayon et la fenêtre : alerte d'attention
    await _position(client, agent_headers, boats[2], [9.202, 0.419], when + timedelta(minutes=8))
    apres = await _alertes_regle(client, agent_headers, "concentration_zone", emb=None)
    hits = [a for a in apres if a["declencheur"]["horodatage"].startswith(when.date().isoformat())]
    assert len(hits) == 1, hits
    assert hits[0]["niveau_gravite"] == "attention"
    assert hits[0]["embarcation_id"] is None
    assert hits[0]["declencheur"]["nb_embarcations"] >= 3
    assert hits[0]["declencheur"]["seuil"] == 3
