"""Lot 4, partie serveur : carte des navires à contrôler. Données fictives.

Les navires AIS sont placés directement dans l'état de flotte en mémoire ; aucun
appel réseau, et le fichier d'instantané du dépôt n'est ni lu ni réécrit.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from geoalchemy2 import WKTElement
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.regles import charger_regles
from app.db.enums import TypeZone
from app.db.models import Alerte, ZoneReglementee
from app.modules.ais_gabon import service as ais
from app.modules.ais_gabon import surveillance
from app.modules.ais_gabon.schemas import AisVesselRead
from app.schemas.common import PointGeoJSON
from app.tests.aides import (
    copier_regles,
    creer_embarcation,
    creer_pecheur,
    inserer_alerte,
    inserer_positions,
)


def _point_libre() -> tuple[float, float]:
    """Point en mer, hors port, dans les eaux gabonaises ; propre à chaque essai."""
    n = uuid.uuid4().int % 1000
    return 8.30 + n * 0.0004, -2.60 - n * 0.0004


async def _zone_interdite(engine, lon: float, lat: float, nom: str) -> str:
    d = 0.01
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        zone = ZoneReglementee(
            nom=nom,
            type=TypeZone.interdite,
            geometrie=WKTElement(
                f"POLYGON(({lon - d} {lat - d}, {lon + d} {lat - d}, {lon + d} {lat + d}, "
                f"{lon - d} {lat + d}, {lon - d} {lat - d}))",
                srid=4326,
            ),
            actif=True,
        )
        session.add(zone)
        await session.commit()
        return str(zone.id)


@pytest.fixture
def flotte(monkeypatch):
    """Flotte AIS vide, sans instantané disque ni appel réseau."""
    ais.fleet.clear()
    surveillance.reinitialiser()
    monkeypatch.setattr(ais, "_snapshot_loaded", True)
    with (
        patch.object(ais, "fetch_openwaters_rest", new=AsyncMock(return_value=[])),
        patch.object(ais, "save_snapshot"),
    ):
        yield ais.fleet
    ais.fleet.clear()
    surveillance.reinitialiser()


def _placer(flotte, mmsi, lon, lat, *, nom, peche=True, il_y_a=timedelta(minutes=2), sog=6.0):
    flotte.upsert_position(
        mmsi=mmsi,
        lon=lon,
        lat=lat,
        horodatage=datetime.now(UTC) - il_y_a,
        sog_kn=sog,
        cog_deg=90.0,
        nom=nom,
        provider="aisstream",
        dans_eaux=True,
    )
    if peche:
        flotte.upsert_static(mmsi=mmsi, nom=nom, ship_type=30)


# --------------------------------------------------------------------------- #
# Flux des embarcations du registre
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l4_positions_live_regularite_et_age(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    """Chaque marqueur porte sa régularité, ses motifs et son âge : pas une fiche par navire."""
    lon, lat = _point_libre()
    conforme = await creer_embarcation(
        client,
        agent_headers,
        (await creer_pecheur(client, agent_headers, tag="L4"))["id"],
        tag="L4",
    )
    suspendu = await creer_pecheur(client, agent_headers, tag="L4")
    a_controler = await creer_embarcation(client, agent_headers, suspendu["id"], tag="L4")
    await client.patch(
        f"/api/v1/pecheurs/{suspendu['id']}", headers=agent_headers, json={"statut": "suspendu"}
    )
    a_verifier = await creer_embarcation(
        client,
        agent_headers,
        (await creer_pecheur(client, agent_headers, tag="L4"))["id"],
        tag="L4",
    )
    zone_bateau = await creer_embarcation(
        client,
        agent_headers,
        (await creer_pecheur(client, agent_headers, tag="L4"))["id"],
        tag="L4",
    )
    maintenant = datetime.now(UTC)
    await inserer_positions(engine, conforme["id"], [(maintenant - timedelta(minutes=3), lon, lat)])
    await inserer_positions(
        engine, a_controler["id"], [(maintenant - timedelta(minutes=4), lon + 0.05, lat)]
    )
    await inserer_positions(
        engine, a_verifier["id"], [(maintenant - timedelta(hours=7), lon + 0.1, lat)]
    )
    zlon, zlat = lon + 0.2, lat
    await _zone_interdite(engine, zlon, zlat, "Réserve fictive L4")
    await inserer_positions(
        engine, zone_bateau["id"], [(maintenant - timedelta(minutes=1), zlon, zlat)]
    )
    await inserer_alerte(
        engine,
        horodatage=maintenant,
        declencheur={"regle": "essai_l4"},
        embarcation_id=a_verifier["id"],
    )
    # Alerte encore ouverte : l'aide l'enregistre close, on la rouvre
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        row = (
            await session.execute(
                select(Alerte).where(Alerte.embarcation_id == uuid.UUID(a_verifier["id"]))
            )
        ).scalar_one()
        row.statut = "nouvelle"
        await session.commit()

    resp = await client.get(
        "/api/v1/positions/live", headers=agent_headers, params={"since_minutes": 600}
    )
    assert resp.status_code == 200, resp.text
    par_id = {v["embarcation_id"]: v for v in resp.json()}
    c, s, v, z = (par_id[b["id"]] for b in (conforme, a_controler, a_verifier, zone_bateau))
    assert (c["regularite"], c["regularite_libelle"], c["motifs"]) == ("conforme", "Conforme", [])
    assert c["perimee"] is False and c["age_libelle"] == "il y a 3 min"
    assert s["regularite"] == "alerte" and s["regularite_libelle"] == "Navire à contrôler"
    assert any("suspendu" in m for m in s["motifs"])
    assert v["regularite"] == "a_verifier" and "1 alerte à traiter" in v["motifs"]
    assert v["perimee"] is True and v["age_libelle"] == "il y a 7 h"
    assert z["regularite"] == "alerte"
    assert "Dernière position dans la zone interdite « Réserve fictive L4 »" in z["motifs"]
    for marqueur in par_id.values():
        for mot in ("pirate", "infraction"):
            assert mot not in json.dumps(marqueur, ensure_ascii=False).lower()


# --------------------------------------------------------------------------- #
# Flux AIS
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l4_ais_live_regularite_age_et_observations_perimees(
    client: AsyncClient, agent_headers: dict, flotte
) -> None:
    lon, lat = _point_libre()
    p = await creer_pecheur(client, agent_headers, tag="L4")
    mmsi_inscrit = "626" + f"{uuid.uuid4().int % 1_000_000:06d}"
    bateau = await creer_embarcation(client, agent_headers, p["id"], tag="L4", mmsi=mmsi_inscrit)
    _placer(flotte, mmsi_inscrit, lon, lat, nom="CHALUTIER INSCRIT")
    _placer(flotte, "657000222", lon + 0.05, lat, nom="CHALUTIER INCONNU")
    _placer(
        flotte, "657000333", lon + 0.1, lat, nom="VIEILLE OBSERVATION", il_y_a=timedelta(hours=30)
    )

    resp = await client.get("/api/v1/ais/live?refresh=true", headers=agent_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    par_mmsi = {v["mmsi"]: v for v in body["vessels"]}
    # L'observation de plus de 24 h est retirée de la carte, et la note le dit
    assert "657000333" not in par_mmsi
    assert "1 observation(s) de plus de 24 h retirée(s)" in body["note"]
    inscrit, inconnu = par_mmsi[mmsi_inscrit], par_mmsi["657000222"]
    assert inscrit["regularite"] == "conforme" and inscrit["embarcation_id"] == bateau["id"]
    assert inscrit["age_libelle"] == "il y a 2 min"
    assert inconnu["regularite"] == "a_verifier" and inconnu["regularite_libelle"] == "À vérifier"
    assert "Navire de pêche absent du registre PIGAP : licence à vérifier" in inconnu["motifs"]

    # La fiche dit la même chose que le flux
    fiche = await client.get("/api/v1/ais/vessels/657000222", headers=agent_headers)
    assert fiche.status_code == 200, fiche.text
    assert fiche.json()["regularite"] == inconnu["regularite"]
    assert fiche.json()["motifs"] == inconnu["motifs"]
    detail_inscrit = (
        await client.get(f"/api/v1/ais/vessels/{mmsi_inscrit}", headers=agent_headers)
    ).json()
    assert detail_inscrit["registre"]["methode"] == "mmsi"
    assert detail_inscrit["registre"]["embarcation_id"] == bateau["id"]


def test_l4_instantane_disque_sans_observation_perimee(tmp_path, monkeypatch) -> None:
    """Le navire montré à Owendo venait d'une observation du 2026-09-20 rechargée au
    démarrage : une observation trop ancienne n'est plus rechargée, ni gardée."""
    maintenant = datetime.now(UTC)
    fichier = tmp_path / "instantane.geojson"

    def element(mmsi: str, quand: datetime) -> dict:
        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [9.27, 0.29]},
            "properties": {"mmsi": mmsi, "name": f"NAVIRE {mmsi}", "timestamp": quand.isoformat()},
        }

    fichier.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    element("111111111", datetime(2026, 9, 20, 10, tzinfo=UTC)),
                    element("222222222", maintenant - timedelta(hours=2)),
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(ais, "_SNAPSHOT_PATH", fichier)
    assert [v.mmsi for v in ais.load_snapshot()] == ["222222222"]

    # Purge : l'âge d'une observation rechargée compte depuis l'observation elle-même
    ais.fleet.clear()
    try:
        ais.fleet.upsert_position(
            mmsi="333333333",
            lon=9.27,
            lat=0.29,
            horodatage=maintenant - timedelta(hours=30),
            provider="snapshot",
        )
        assert ais.fleet.purge(maintenant) == 1 and len(ais.fleet) == 0
    finally:
        ais.fleet.clear()


# --------------------------------------------------------------------------- #
# Alertes automatiques
# --------------------------------------------------------------------------- #


def _navire(mmsi, lon, lat, *, il_y_a=timedelta(minutes=5), peche=True, sog=7.0, **autres):
    quand = datetime.now(UTC) - il_y_a
    return AisVesselRead(
        mmsi=mmsi,
        nom=f"NAVIRE FICTIF {mmsi}",
        position=PointGeoJSON(coordinates=(lon, lat)),
        horodatage=quand,
        sog_kn=sog,
        type_label="Navire de pêche" if peche else "Cargo",
        statut_nav="en_route",
        age_s=int(il_y_a.total_seconds()),
        provider=autres.pop("provider", "aisstream"),
        dans_eaux_gabon=True,
        pavillon="Pavillon fictif",
        **autres,
    )


async def _alertes(engine, mmsi: str) -> list[Alerte]:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            select(Alerte).where(Alerte.declencheur["mmsi"].as_string() == mmsi)
        )
        return list(result.scalars().all())


@pytest.mark.asyncio
async def test_l4_alertes_ais_automatiques(
    client: AsyncClient, agent_headers: dict, engine, flotte
) -> None:
    lon, lat = _point_libre()
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    zlon, zlat = lon + 0.3, lat
    await _zone_interdite(engine, zlon, zlat, "Zone interdite fictive L4")
    suffixe = f"{uuid.uuid4().int % 100_000:05d}"
    hors_registre, en_zone, eteint = f"6570{suffixe}", f"6571{suffixe}", f"6572{suffixe}"
    demo, instantane = f"6573{suffixe}", f"6574{suffixe}"
    navires = [
        _navire(hors_registre, lon, lat),
        _navire(en_zone, zlon, zlat, peche=False),
        _navire(eteint, lon + 0.1, lat, peche=False, sog=9.0),
        _navire(demo, lon, lat, demo=True),
        _navire(instantane, lon, lat, provider="snapshot"),
    ]
    async with factory() as session:
        await surveillance.evaluer(session, navires)
        await session.commit()

    (a1,) = await _alertes(engine, hors_registre)
    assert a1.declencheur["regle"] == "navire_peche_non_enregistre"
    assert a1.niveau_gravite.value == "attention" and a1.etat_traitement == "a_traiter"
    (a2,) = await _alertes(engine, en_zone)
    assert a2.declencheur["regle"] == "navire_ais_zone_interdite"
    assert a2.niveau_gravite.value == "critique"
    assert await _alertes(engine, eteint) == []
    # Démonstration et instantané disque ne déclenchent jamais rien
    assert await _alertes(engine, demo) == [] and await _alertes(engine, instantane) == []

    # Deux heures plus tard, le navire qui faisait route ne s'est plus manifesté
    plus_tard = datetime.now(UTC) + timedelta(hours=2)
    for _ in range(2):  # une seule alerte, même si l'évaluation se répète
        async with factory() as session:
            await surveillance.evaluer(session, [], maintenant=plus_tard)
            await session.commit()
    (a3,) = await _alertes(engine, eteint)
    assert a3.declencheur["regle"] == "extinction_signal_ais"
    assert a3.declencheur["silence_minutes"] >= 120

    # Descriptions lisibles : « navire à contrôler », jamais « infraction » ni « pirate »
    for alerte in (a1, a2, a3):
        resp = await client.get(f"/api/v1/alertes/{alerte.id}", headers=agent_headers)
        assert resp.status_code == 200, resp.text
        resume = resp.json()["description"]["resume"]
        assert resume.endswith("navire à contrôler.") and "MMSI" in resume, resume
        texte = resp.text.lower()
        assert "pirate" not in texte and "infraction" not in texte

    # Pas de doublon le même jour
    async with factory() as session:
        await surveillance.evaluer(session, navires)
        await session.commit()
    regles = [a.declencheur["regle"] for a in await _alertes(engine, hors_registre)]
    assert regles.count("navire_peche_non_enregistre") == 1


@pytest.mark.asyncio
async def test_l4_alertes_ais_reglees_par_le_parametrage(
    engine, flotte, tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("PIGAP_REGLES_DIR", str(tmp_path))
    copier_regles(
        tmp_path,
        "carte_suivi",
        {"alertes_ais": {"navire_peche_non_enregistre": {"actif": False}}},
    )
    lon, lat = _point_libre()
    mmsi = f"6575{uuid.uuid4().int % 100_000:05d}"
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        assert await surveillance.evaluer(session, [_navire(mmsi, lon, lat)]) == []
        await session.commit()
    assert await _alertes(engine, mmsi) == []

    # Seuil de silence porté à 6 h : rien après deux heures
    copier_regles(
        tmp_path, "carte_suivi", {"alertes_ais": {"extinction_signal": {"silence_minutes": 360}}}
    )
    eteint = f"6576{uuid.uuid4().int % 100_000:05d}"
    async with factory() as session:
        await surveillance.evaluer(session, [_navire(eteint, lon, lat, peche=False)])
        await surveillance.evaluer(session, [], maintenant=datetime.now(UTC) + timedelta(hours=2))
        await session.commit()
    assert await _alertes(engine, eteint) == []


def test_l4_parametrage_propose_et_vocabulaire() -> None:
    contenu = charger_regles("carte_suivi")
    assert contenu["statut"] == "Proposé" and contenu["valideurs"] == ["Christian"]
    assert set(contenu["explications"]) == set(contenu["carte"]) | set(contenu["alertes_ais"])
    assert contenu["carte"]["libelles_regularite"]["alerte"] == "Navire à contrôler"
    # La note du fichier cite les mots proscrits pour les écarter : seuls les textes
    # affichés sont contrôlés
    affiches = {k: v for k, v in contenu.items() if k != "note"}
    textes = (
        json.dumps(affiches, ensure_ascii=False).lower()
        + json.dumps(
            charger_regles("alertes_traitement")["regles_alerte"], ensure_ascii=False
        ).lower()
    )
    assert "pirate" not in textes
