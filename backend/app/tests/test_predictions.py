"""Tests moteur de prédiction (ADR-006) — pénurie, ranking intrusion, rôles."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte
from app.db.models import Alerte
from app.modules.predictions.service import reset_cache

ZONE_A = [
    [8.55, -0.85],
    [8.72, -0.85],
    [8.72, -0.68],
    [8.55, -0.68],
    [8.55, -0.85],
]
ZONE_B = [
    [8.80, -1.10],
    [8.95, -1.10],
    [8.95, -0.95],
    [8.80, -0.95],
    [8.80, -1.10],
]


async def _boat(client: AsyncClient, headers: dict) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Pred",
            "prenom": "Test",
            "numero_licence": f"LIC-PR-{suffix}",
            "email": f"pred.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    pid = pecheur.json()["id"]
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pid,
            "nom": "Pirogue Pred",
            "immatriculation": f"GA-PR-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return pid, emb.json()["id"]


async def _capture(
    client: AsyncClient,
    headers: dict,
    *,
    pid: str,
    emb: str,
    espece: str,
    kg: float,
    day: date,
) -> None:
    res = await client.post(
        "/api/v1/captures",
        headers=headers,
        json={
            "pecheur_id": pid,
            "embarcation_id": emb,
            "espece": espece,
            "quantite_kg": kg,
            "methode": "filet",
            "point_debarquement": "Owendo",
            "date_capture": datetime(day.year, day.month, day.day, 10, 0, tzinfo=UTC).isoformat(),
        },
    )
    assert res.status_code == 201, res.text


async def _zone(client: AsyncClient, headers: dict, nom: str, ring: list) -> str:
    res = await client.post(
        "/api/v1/zones",
        headers=headers,
        json={
            "nom": nom,
            "type": "interdite",
            "geometrie": {"type": "Polygon", "coordinates": [ring]},
            "actif": True,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


@pytest.mark.asyncio
async def test_penurie_serie_decroissante(client: AsyncClient, agent_headers: dict) -> None:
    reset_cache()
    pid, emb = await _boat(client, agent_headers)
    origin = date(2180, 6, 5) + timedelta(weeks=uuid.uuid4().int % 20)
    high = [origin + timedelta(weeks=i) for i in range(7)]
    low = [origin + timedelta(weeks=7 + i) for i in range(8)]
    for day in high:
        await _capture(client, agent_headers, pid=pid, emb=emb, espece="sardine", kg=40.0, day=day)
        await _capture(
            client, agent_headers, pid=pid, emb=emb, espece="capitaine", kg=20.0, day=day
        )
    for day in low:
        await _capture(client, agent_headers, pid=pid, emb=emb, espece="sardine", kg=8.0, day=day)
        await _capture(
            client, agent_headers, pid=pid, emb=emb, espece="capitaine", kg=20.0, day=day
        )

    res = await client.get(
        "/api/v1/predictions",
        headers=agent_headers,
        params={"horizon_jours": 30},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] in ("ok", "insuffisant")
    by_esp = {p["espece"]: p for p in body["penuries"]}
    assert "sardine" in by_esp
    sardine = by_esp["sardine"]
    assert sardine["justification"].get("seuil_penurie") == 0.5
    assert sardine["justification"].get("observation_kg") is not None
    assert sardine["volume_4sem_kg"] < sardine["baseline_saison_kg"] * 0.5
    assert sardine["risque"] in ("moyen", "eleve")
    peche = {p["espece"]: p for p in body["peches"]}
    assert "sardine" in peche
    assert "justification" in peche["sardine"]
    assert peche["sardine"]["justification"].get("modele")


@pytest.mark.asyncio
async def test_intrusion_zone_la_plus_frequente_en_tete(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    reset_cache()
    pid, emb = await _boat(client, agent_headers)
    suffix = uuid.uuid4().hex[:6]
    zone_a = await _zone(client, agent_headers, f"Hot {suffix}", ZONE_A)
    zone_b = await _zone(client, agent_headers, f"Cold {suffix}", ZONE_B)

    for i in range(12):
        await _capture(
            client,
            agent_headers,
            pid=pid,
            emb=emb,
            espece="merou",
            kg=10.0,
            day=date(2026, 6, 1) + timedelta(weeks=i),
        )

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        for i in range(40):
            day = date(2026, 6, 1) + timedelta(days=i)
            session.add(
                Alerte(
                    type=TypeAlerte.zone_interdite,
                    niveau_gravite=NiveauGravite.critique,
                    embarcation_id=uuid.UUID(emb),
                    declencheur={
                        "regle": "intrusion_zone_interdite",
                        "fingerprint": f"test:{zone_a}:{i}",
                        "zone_id": zone_a,
                        "zone_nom": f"Hot {suffix}",
                    },
                    horodatage=datetime(day.year, day.month, day.day, 12, tzinfo=UTC),
                    statut=StatutAlerte.nouvelle,
                )
            )
        session.add(
            Alerte(
                type=TypeAlerte.zone_interdite,
                niveau_gravite=NiveauGravite.attention,
                embarcation_id=uuid.UUID(emb),
                declencheur={
                    "regle": "intrusion_zone_interdite",
                    "fingerprint": f"test:{zone_b}:once",
                    "zone_id": zone_b,
                    "zone_nom": f"Cold {suffix}",
                },
                horodatage=datetime(2026, 6, 8, 12, tzinfo=UTC),
                statut=StatutAlerte.nouvelle,
            )
        )
        await session.commit()

    res = await client.get("/api/v1/predictions", headers=agent_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    ours = [i for i in body["intrusions"] if i["zone_id"] in {zone_a, zone_b}]
    assert ours, body["intrusions"]
    hist = {i["zone_id"]: i["justification"]["count_hist"] for i in ours}
    assert hist[zone_a] > hist[zone_b]
    assert ours[0]["zone_id"] == zone_a
    assert ours[0]["justification"]
    ours_z = [z for z in body["zones_incidents"] if z["zone_id"] in {zone_a, zone_b}]
    assert ours_z, {
        "zone_a": zone_a,
        "top": [
            (z["zone_id"], z["count_intrusions_hist"], z["score"])
            for z in body["zones_incidents"][:8]
        ],
    }
    assert ours_z[0]["zone_id"] == zone_a


@pytest.mark.asyncio
async def test_predictions_refuse_pecheur(client: AsyncClient, agent_headers: dict) -> None:
    suffix = uuid.uuid4().hex[:8]
    email = f"pecheur.pr.{suffix}@example.com"
    created = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Test",
            "prenom": "Pecheur",
            "numero_licence": f"LIC-PP-{suffix}",
            "email": email,
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert created.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "mot_de_passe": "PecheurPass1!"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    denied = await client.get("/api/v1/predictions", headers=headers)
    assert denied.status_code in (401, 403)
