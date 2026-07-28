"""Services M3 — zones réglementées & détection PostGIS ST_Intersects."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON, ST_Intersects
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, not_found
from app.db.enums import TypeZone
from app.db.models import ZoneReglementee
from app.modules.geolocalisation.geo import point_to_wkt
from app.modules.zones.geo import geojson_text_to_polygon, polygon_to_wkt
from app.modules.zones.schemas import (
    IntersectionCheckRequest,
    IntersectionCheckResponse,
    ZoneCreate,
    ZoneGeoJSONImport,
    ZoneImportResult,
    ZoneRead,
    ZoneUpdate,
)
from app.schemas.common import PolygonGeoJSON


def _to_read(zone: ZoneReglementee, geojson_raw: str | None) -> ZoneRead:
    geom = geojson_text_to_polygon(geojson_raw)
    if geom is None:
        geom = PolygonGeoJSON(coordinates=[[(0.0, 0.0), (0.0, 0.0), (0.0, 0.0), (0.0, 0.0)]])
    return ZoneRead(
        id=zone.id,
        nom=zone.nom,
        type=zone.type,
        geometrie=geom,
        periode_debut=zone.periode_debut,
        periode_fin=zone.periode_fin,
        actif=zone.actif,
    )


async def _fetch_read(db: AsyncSession, zone_id: UUID) -> ZoneRead:
    result = await db.execute(
        select(ZoneReglementee, ST_AsGeoJSON(ZoneReglementee.geometrie).label("geom_geojson")).where(
            ZoneReglementee.id == zone_id
        )
    )
    row = result.one_or_none()
    if row is None:
        raise not_found("Zone réglementée introuvable", "ZONE_NOT_FOUND")
    zone, geo = row
    return _to_read(zone, geo)


def _validate_periode(debut: date | None, fin: date | None) -> None:
    if debut is not None and fin is not None and fin < debut:
        raise bad_request(
            "periode_fin doit être postérieure ou égale à periode_debut",
            "PERIODE_INVALIDE",
        )


def _parse_type(raw: Any) -> TypeZone:
    if isinstance(raw, TypeZone):
        return raw
    try:
        return TypeZone(str(raw).lower())
    except ValueError as exc:
        raise bad_request(
            f"type de zone invalide: {raw!r} (attendu: interdite|protegee|sensible)",
            "TYPE_ZONE_INVALIDE",
        ) from exc


def _feature_to_create(feature: dict[str, Any], index: int) -> ZoneCreate:
    if feature.get("type") != "Feature":
        raise bad_request(
            f"Feature #{index}: type attendu 'Feature'",
            "GEOJSON_FEATURE_INVALIDE",
        )
    geometry = feature.get("geometry") or {}
    if geometry.get("type") != "Polygon":
        raise bad_request(
            f"Feature #{index}: seule la géométrie Polygon est acceptée (MVP)",
            "GEOJSON_GEOMETRY_INVALIDE",
        )
    props = feature.get("properties") or {}
    nom = props.get("nom") or props.get("name") or f"Zone importée #{index + 1}"
    type_raw = props.get("type") or props.get("type_zone") or TypeZone.sensible.value
    coords = geometry.get("coordinates")
    if not coords:
        raise bad_request(f"Feature #{index}: coordinates manquantes", "GEOJSON_COORDS_MISSING")
    try:
        polygon = PolygonGeoJSON(coordinates=coords)
    except Exception as exc:
        raise bad_request(
            f"Feature #{index}: polygone GeoJSON invalide",
            "GEOJSON_POLYGON_INVALIDE",
        ) from exc

    periode_debut = props.get("periode_debut")
    periode_fin = props.get("periode_fin")
    actif = props.get("actif", True)
    if isinstance(actif, str):
        actif = actif.lower() in ("1", "true", "oui", "yes")

    return ZoneCreate(
        nom=str(nom),
        type=_parse_type(type_raw),
        geometrie=polygon,
        periode_debut=date.fromisoformat(periode_debut) if periode_debut else None,
        periode_fin=date.fromisoformat(periode_fin) if periode_fin else None,
        actif=bool(actif),
    )


async def create_zone(db: AsyncSession, data: ZoneCreate) -> ZoneRead:
    _validate_periode(data.periode_debut, data.periode_fin)
    try:
        wkt = polygon_to_wkt(data.geometrie)
    except ValueError as exc:
        raise bad_request(str(exc), "POLYGON_INVALIDE") from exc
    row = ZoneReglementee(
        nom=data.nom,
        type=data.type,
        geometrie=wkt,
        periode_debut=data.periode_debut,
        periode_fin=data.periode_fin,
        actif=data.actif,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _fetch_read(db, row.id)


async def list_zones(
    db: AsyncSession,
    *,
    actif: bool | None = None,
    type_zone: TypeZone | None = None,
) -> list[ZoneRead]:
    stmt = select(ZoneReglementee, ST_AsGeoJSON(ZoneReglementee.geometrie).label("geom_geojson")).order_by(
        ZoneReglementee.nom
    )
    if actif is not None:
        stmt = stmt.where(ZoneReglementee.actif.is_(actif))
    if type_zone is not None:
        stmt = stmt.where(ZoneReglementee.type == type_zone)
    result = await db.execute(stmt)
    return [_to_read(zone, geo) for zone, geo in result.all()]


async def get_zone(db: AsyncSession, zone_id: UUID) -> ZoneRead:
    return await _fetch_read(db, zone_id)


async def update_zone(db: AsyncSession, zone_id: UUID, data: ZoneUpdate) -> ZoneRead:
    zone = await db.get(ZoneReglementee, zone_id)
    if zone is None:
        raise not_found("Zone réglementée introuvable", "ZONE_NOT_FOUND")
    payload = data.model_dump(exclude_unset=True)
    if "geometrie" in payload and payload["geometrie"] is not None:
        try:
            payload["geometrie"] = polygon_to_wkt(data.geometrie)  # type: ignore[arg-type]
        except ValueError as exc:
            raise bad_request(str(exc), "POLYGON_INVALIDE") from exc
    debut = payload.get("periode_debut", zone.periode_debut)
    fin = payload.get("periode_fin", zone.periode_fin)
    _validate_periode(debut, fin)
    for key, value in payload.items():
        setattr(zone, key, value)
    await db.commit()
    await db.refresh(zone)
    return await _fetch_read(db, zone.id)


async def delete_zone(db: AsyncSession, zone_id: UUID) -> None:
    zone = await db.get(ZoneReglementee, zone_id)
    if zone is None:
        raise not_found("Zone réglementée introuvable", "ZONE_NOT_FOUND")
    await db.delete(zone)
    await db.commit()


async def import_geojson(db: AsyncSession, payload: ZoneGeoJSONImport) -> ZoneImportResult:
    if payload.type != "FeatureCollection":
        raise bad_request(
            "Import attendu: GeoJSON FeatureCollection",
            "GEOJSON_TYPE_INVALIDE",
        )
    if not payload.features:
        raise bad_request("Aucune feature à importer", "GEOJSON_EMPTY")

    created: list[ZoneRead] = []
    for i, feature in enumerate(payload.features):
        if not isinstance(feature, dict):
            raise bad_request(f"Feature #{i}: objet JSON attendu", "GEOJSON_FEATURE_INVALIDE")
        data = _feature_to_create(feature, i)
        created.append(await create_zone(db, data))
    return ZoneImportResult(imported=len(created), zones=created)


def _periode_active(zone: ZoneReglementee, a_la_date: date) -> bool:
    if zone.periode_debut is not None and a_la_date < zone.periode_debut:
        return False
    if zone.periode_fin is not None and a_la_date > zone.periode_fin:
        return False
    return True


async def check_intersection(
    db: AsyncSession, data: IntersectionCheckRequest
) -> IntersectionCheckResponse:
    """Détection d'intersection position ↔ zones via PostGIS ST_Intersects (pas en Python)."""
    a_la_date = data.a_la_date or date.today()
    point_geom = point_to_wkt(data.position)

    stmt = (
        select(ZoneReglementee, ST_AsGeoJSON(ZoneReglementee.geometrie).label("geom_geojson"))
        .where(ZoneReglementee.actif.is_(True))
        .where(ST_Intersects(ZoneReglementee.geometrie, point_geom))
    )
    if data.types:
        stmt = stmt.where(ZoneReglementee.type.in_(data.types))

    result = await db.execute(stmt)
    zones: list[ZoneRead] = []
    for zone, geo in result.all():
        if _periode_active(zone, a_la_date):
            zones.append(_to_read(zone, geo))

    return IntersectionCheckResponse(intersects=len(zones) > 0, zones=zones)
