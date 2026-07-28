"""Tests d'acceptation M2 — §5.2 trajectoire 10 points chronologiques."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.modules.geolocalisation.gabon_routes import ESTUAIRE_LIBREVILLE


async def _create_embarcation(client: AsyncClient, headers: dict) -> str:
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=headers,
        json={
            "nom": "Nguema",
            "prenom": "Alice",
            "numero_licence": f"LIC-M2-{suffix}",
            "email": f"alice.m2.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201, pecheur.text
    emb = await client.post(
        "/api/v1/embarcations",
        headers=headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": "Pirogue M2",
            "immatriculation": f"GA-M2-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201, emb.text
    return emb.json()["id"]


@pytest.mark.asyncio
async def test_geoloc_config(client: AsyncClient, agent_headers: dict) -> None:
    response = await client.get("/api/v1/geoloc/config", headers=agent_headers)
    assert response.status_code == 200
    assert response.json()["gps_interval_minutes"] >= 1


@pytest.mark.asyncio
async def test_trajectory_10_points_chronological(client: AsyncClient, agent_headers: dict) -> None:
    """§5.2 : trajectoire simulée de 10 points GPS dans l'ordre chronologique."""
    emb_id = await _create_embarcation(client, agent_headers)
    base = datetime(2026, 7, 27, 8, 0, tzinfo=UTC)
    # Corridor maritime Estuaire / large Libreville (en mer, WGS84)
    path = list(ESTUAIRE_LIBREVILLE)
    assert len(path) == 10
    # Envoi volontairement dans le désordre pour vérifier le tri serveur
    payload = {
        "positions": [
            {
                "embarcation_id": emb_id,
                "position": {"type": "Point", "coordinates": path[i]},
                "horodatage": (base + timedelta(minutes=i)).isoformat(),
                "source": "mobile",
            }
            for i in [3, 0, 7, 1, 9, 2, 5, 8, 4, 6]
        ]
    }
    batch = await client.post(
        "/api/v1/positions/batch",
        headers=agent_headers,
        json=payload,
    )
    assert batch.status_code == 201, batch.text
    assert len(batch.json()) == 10

    traj = await client.get(
        "/api/v1/positions/trajectory",
        headers=agent_headers,
        params={"embarcation_id": emb_id},
    )
    assert traj.status_code == 200, traj.text
    points = traj.json()
    assert len(points) == 10

    horodatages = [p["horodatage"] for p in points]
    assert horodatages == sorted(horodatages)

    coords = [tuple(p["position"]["coordinates"]) for p in points]
    # PostGIS / JSON peuvent arrondir légèrement les flottants
    for got, expected in zip(coords, path, strict=True):
        assert got[0] == pytest.approx(expected[0], abs=1e-6)
        assert got[1] == pytest.approx(expected[1], abs=1e-6)


@pytest.mark.asyncio
async def test_trajectory_period_filter(client: AsyncClient, agent_headers: dict) -> None:
    emb_id = await _create_embarcation(client, agent_headers)
    base = datetime(2026, 7, 27, 10, 0, tzinfo=UTC)
    for i in range(5):
        resp = await client.post(
            "/api/v1/positions",
            headers=agent_headers,
            json={
                "embarcation_id": emb_id,
                "position": {"type": "Point", "coordinates": [9.22 - i * 0.01, 0.41 - i * 0.02]},
                "horodatage": (base + timedelta(minutes=i * 10)).isoformat(),
                "source": "mobile",
            },
        )
        assert resp.status_code == 201, resp.text

    filtered = await client.get(
        "/api/v1/positions/trajectory",
        headers=agent_headers,
        params={
            "embarcation_id": emb_id,
            "debut": (base + timedelta(minutes=15)).isoformat(),
            "fin": (base + timedelta(minutes=35)).isoformat(),
        },
    )
    assert filtered.status_code == 200
    assert len(filtered.json()) == 2


@pytest.mark.asyncio
async def test_reject_position_hors_eau(client: AsyncClient, agent_headers: dict) -> None:
    """Refuse GPS hors eau : San Francisco + centre-ville Libreville."""
    emb_id = await _create_embarcation(client, agent_headers)
    sf = await client.post(
        "/api/v1/positions",
        headers=agent_headers,
        json={
            "embarcation_id": emb_id,
            "position": {"type": "Point", "coordinates": [-122.4064, 37.7858]},
            "horodatage": datetime(2026, 7, 27, 19, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    assert sf.status_code == 400
    assert sf.json()["code"] == "POSITION_HORS_EAU"

    city = await client.post(
        "/api/v1/positions",
        headers=agent_headers,
        json={
            "embarcation_id": emb_id,
            "position": {"type": "Point", "coordinates": [9.45, 0.39]},
            "horodatage": datetime(2026, 7, 27, 10, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    assert city.status_code == 400
    assert city.json()["code"] == "POSITION_HORS_EAU"


@pytest.mark.asyncio
async def test_trajectory_hides_inland_legacy(
    client: AsyncClient, agent_headers: dict, engine
) -> None:
    """Les anciens points à terre ne ressortent plus dans la trajectoire."""
    from datetime import UTC as _UTC

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.db.enums import SourcePosition
    from app.db.models import Position
    from app.modules.geolocalisation.geo import point_to_wkt
    from app.schemas.common import PointGeoJSON

    emb_id = await _create_embarcation(client, agent_headers)
    ok = await client.post(
        "/api/v1/positions",
        headers=agent_headers,
        json={
            "embarcation_id": emb_id,
            "position": {"type": "Point", "coordinates": [9.12, 0.38]},
            "horodatage": datetime(2026, 7, 27, 11, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    assert ok.status_code == 201, ok.text

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        session.add(
            Position(
                embarcation_id=uuid.UUID(emb_id),
                position=point_to_wkt(PointGeoJSON(coordinates=(9.45, 0.39))),
                horodatage=datetime(2026, 7, 27, 10, 0, tzinfo=_UTC),
                source=SourcePosition.mobile,
            )
        )
        await session.commit()

    traj = await client.get(
        "/api/v1/positions/trajectory",
        headers=agent_headers,
        params={"embarcation_id": emb_id},
    )
    assert traj.status_code == 200
    points = traj.json()
    assert len(points) == 1
    assert points[0]["position"]["coordinates"] == [9.12, 0.38]


@pytest.mark.asyncio
async def test_clear_trajectory(client: AsyncClient, agent_headers: dict) -> None:
    emb_id = await _create_embarcation(client, agent_headers)
    await client.post(
        "/api/v1/positions",
        headers=agent_headers,
        json={
            "embarcation_id": emb_id,
            "position": {"type": "Point", "coordinates": [9.2, 0.42]},
            "horodatage": datetime(2026, 7, 27, 12, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    cleared = await client.delete(
        f"/api/v1/positions/embarcation/{emb_id}",
        headers=agent_headers,
    )
    assert cleared.status_code == 200
    traj = await client.get(
        "/api/v1/positions/trajectory",
        headers=agent_headers,
        params={"embarcation_id": emb_id},
    )
    assert traj.json() == []


@pytest.mark.asyncio
async def test_tracked_embarcations_include_positions_count(
    client: AsyncClient, agent_headers: dict
) -> None:
    emb_id = await _create_embarcation(client, agent_headers)
    await client.post(
        "/api/v1/positions",
        headers=agent_headers,
        json={
            "embarcation_id": emb_id,
            "position": {"type": "Point", "coordinates": [9.22, 0.41]},
            "horodatage": datetime(2026, 7, 27, 12, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    response = await client.get("/api/v1/positions/embarcations", headers=agent_headers)
    assert response.status_code == 200
    match = next(b for b in response.json() if b["id"] == emb_id)
    assert match["positions_count"] == 1
    assert match["type"] == "pirogue"
    assert match["derniere_position_a"] is not None


@pytest.mark.asyncio
async def test_reject_land_crossing_batch(client: AsyncClient, agent_headers: dict) -> None:
    """Refuse un batch dont le segment traverse la terre."""
    emb_id = await _create_embarcation(client, agent_headers)
    base = datetime(2026, 7, 27, 8, 0, tzinfo=UTC)
    resp = await client.post(
        "/api/v1/positions/batch",
        headers=agent_headers,
        json={
            "positions": [
                {
                    "embarcation_id": emb_id,
                    "position": {"type": "Point", "coordinates": [9.18, 0.42]},
                    "horodatage": base.isoformat(),
                    "source": "mobile",
                },
                {
                    "embarcation_id": emb_id,
                    # saute vers Mayumba en traversant le continent
                    "position": {"type": "Point", "coordinates": [10.5, -3.4]},
                    "horodatage": (base + timedelta(minutes=30)).isoformat(),
                    "source": "mobile",
                },
            ]
        },
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "TRAJECTOIRE_PASSAGE_TERRESTRE"


@pytest.mark.asyncio
async def test_dossier_by_licence(client: AsyncClient, agent_headers: dict) -> None:
    emb_id = await _create_embarcation(client, agent_headers)
    # récupérer la licence via trajectoire setup — recreate with known licence
    suffix = uuid.uuid4().hex[:8]
    pecheur = await client.post(
        "/api/v1/pecheurs",
        headers=agent_headers,
        json={
            "nom": "Mba",
            "prenom": "Jean",
            "numero_licence": f"LIC-DOS-{suffix}",
            "email": f"jean.dos.{suffix}@example.com",
            "mot_de_passe": "PecheurPass1!",
        },
    )
    assert pecheur.status_code == 201
    emb = await client.post(
        "/api/v1/embarcations",
        headers=agent_headers,
        json={
            "pecheur_id": pecheur.json()["id"],
            "nom": "Pirogue Dossier",
            "immatriculation": f"GA-DOS-{suffix}",
            "type": "pirogue",
        },
    )
    assert emb.status_code == 201
    await client.post(
        "/api/v1/positions",
        headers=agent_headers,
        json={
            "embarcation_id": emb.json()["id"],
            "position": {"type": "Point", "coordinates": [9.18, 0.42]},
            "horodatage": datetime(2026, 7, 27, 9, 0, tzinfo=UTC).isoformat(),
            "source": "mobile",
        },
    )
    dossier = await client.get(
        "/api/v1/positions/dossier",
        headers=agent_headers,
        params={"licence": f"LIC-DOS-{suffix}"},
    )
    assert dossier.status_code == 200, dossier.text
    body = dossier.json()
    assert body["numero_licence"] == f"LIC-DOS-{suffix}"
    assert len(body["embarcations"]) >= 1
    assert len(body["trajectories"]) >= 1
    assert "M7" in body["note_infractions"]


@pytest.mark.asyncio
async def test_list_trajectories_multiple_per_boat(
    client: AsyncClient, agent_headers: dict
) -> None:
    """Plusieurs sorties pour une même embarcation (écart > 2 h)."""
    emb_id = await _create_embarcation(client, agent_headers)
    base = datetime(2026, 7, 27, 6, 0, tzinfo=UTC)
    # Sortie 1
    for i in range(3):
        resp = await client.post(
            "/api/v1/positions",
            headers=agent_headers,
            json={
                "embarcation_id": emb_id,
                "position": {
                    "type": "Point",
                    "coordinates": [9.18 - i * 0.02, 0.42 - i * 0.02],
                },
                "horodatage": (base + timedelta(minutes=i * 15)).isoformat(),
                "source": "mobile",
            },
        )
        assert resp.status_code == 201, resp.text
    # Sortie 2 (6 h plus tard)
    for i in range(3):
        resp = await client.post(
            "/api/v1/positions",
            headers=agent_headers,
            json={
                "embarcation_id": emb_id,
                "position": {
                    "type": "Point",
                    "coordinates": [8.5 + i * 0.02, -0.74 - i * 0.02],
                },
                "horodatage": (base + timedelta(hours=6, minutes=i * 15)).isoformat(),
                "source": "mobile",
            },
        )
        assert resp.status_code == 201, resp.text

    listed = await client.get(
        "/api/v1/positions/trajectories",
        headers=agent_headers,
        params={"embarcation_id": emb_id},
    )
    assert listed.status_code == 200
    mine = [t for t in listed.json() if t["embarcation_id"] == emb_id]
    assert len(mine) == 2
    assert {t["index"] for t in mine} == {1, 2}
    assert all(t["points_count"] == 3 for t in mine)


@pytest.mark.asyncio
async def test_positions_require_auth(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/positions/trajectory",
        params={"embarcation_id": str(uuid.uuid4())},
    )
    assert response.status_code == 401
