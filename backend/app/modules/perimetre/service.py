"""Services lot 8 — périmètre de suivi multi-zones."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found
from app.db.models import PerimetreZone
from app.modules.zones.geo import geojson_text_to_polygon
from app.modules.perimetre import filtre
from app.modules.perimetre.schemas import PerimetreFiltreRead, PerimetreZonePatch, PerimetreZoneRead


def _to_read(zone: PerimetreZone, emprise_geojson: str | None) -> PerimetreZoneRead:
    poly = geojson_text_to_polygon(emprise_geojson) if emprise_geojson else None
    return PerimetreZoneRead(
        id=zone.id,
        code=zone.code,
        libelle=zone.libelle,
        type_zone=zone.type_zone,
        actif=zone.actif,
        emprise=poly,
        date_creation=zone.date_creation,
        date_mise_a_jour=zone.date_mise_a_jour,
    )


async def list_zones(db: AsyncSession) -> list[PerimetreZoneRead]:
    result = await db.execute(
        select(PerimetreZone, ST_AsGeoJSON(PerimetreZone.emprise).label("emprise_geojson")).order_by(
            PerimetreZone.code
        )
    )
    return [_to_read(zone, geo) for zone, geo in result.all()]


async def patch_zone(db: AsyncSession, zone_id: UUID, data: PerimetreZonePatch) -> PerimetreZoneRead:
    zone = await db.get(PerimetreZone, zone_id)
    if zone is None:
        raise not_found("Zone de périmètre introuvable", "PERIMETRE_NOT_FOUND")
    zone.actif = data.actif
    zone.date_mise_a_jour = datetime.now(UTC)
    await db.flush()
    geo = (
        await db.execute(select(ST_AsGeoJSON(PerimetreZone.emprise)).where(PerimetreZone.id == zone_id))
    ).scalar_one()
    await db.commit()
    await db.refresh(zone)
    return _to_read(zone, geo)


async def lire_filtre(db: AsyncSession) -> PerimetreFiltreRead:
    codes = await filtre.codes_zones_actives(db)
    emprise = await filtre.emprise_active_geojson(db)
    return PerimetreFiltreRead(
        codes_actifs=codes,
        nombre_actifs=len(codes),
        emprise_geojson=emprise,
    )


async def zone_par_code(db: AsyncSession, code: str) -> PerimetreZone | None:
    result = await db.execute(select(PerimetreZone).where(PerimetreZone.code == code))
    return result.scalar_one_or_none()


async def assurer_seed_defaut(db: AsyncSession) -> None:
    """Complète le seed si la table est vide (base créée par `create_all` sans migration)."""
    n = await db.scalar(select(func.count(PerimetreZone.id)))
    if int(n or 0) > 0:
        return
    from geoalchemy2 import WKTElement

    defs = [
        ("gabon", "Gabon", "pays", "POLYGON((8.0 -4.0, 14.5 -4.0, 14.5 2.5, 8.0 2.5, 8.0 -4.0))"),
        ("estuaire", "Estuaire", "cote", "POLYGON((9.0 0.0, 9.8 0.0, 9.8 0.9, 9.0 0.9, 9.0 0.0))"),
        (
            "libreville",
            "Libreville",
            "ville",
            "POLYGON((9.35 0.35, 9.55 0.35, 9.55 0.55, 9.35 0.55, 9.35 0.35))",
        ),
        ("owendo", "Owendo", "ville", "POLYGON((9.45 0.25, 9.55 0.25, 9.55 0.40, 9.45 0.40, 9.45 0.25))"),
        ("akanda", "Akanda", "ville", "POLYGON((9.40 0.55, 9.60 0.55, 9.60 0.75, 9.40 0.75, 9.40 0.55))"),
        (
            "cap_esterias",
            "Cap Estérias",
            "cote",
            "POLYGON((9.25 0.55, 9.40 0.55, 9.40 0.70, 9.25 0.70, 9.25 0.55))",
        ),
    ]
    from app.db.enums import TypePerimetre

    for code, libelle, type_s, wkt in defs:
        db.add(
            PerimetreZone(
                code=code,
                libelle=libelle,
                type_zone=TypePerimetre(type_s),
                actif=True,
                emprise=WKTElement(wkt, srid=4326),
            )
        )
    await db.commit()