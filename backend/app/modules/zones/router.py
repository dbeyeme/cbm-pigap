"""Routes M3 — zones réglementées (§5.3)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur, TypeZone
from app.db.models import Utilisateur
from app.modules.zones import service
from app.modules.zones.schemas import (
    IntersectionCheckRequest,
    IntersectionCheckResponse,
    ZoneCreate,
    ZoneGeoJSONImport,
    ZoneImportResult,
    ZoneRead,
    ZoneUpdate,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/zones", tags=["m3-zones"])

# CRUD admin : autorité / agent / admin (portail)
AdminZones = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
        )
    ),
]

# Lecture + détection : rôles opérationnels
ZonesReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.chercheur,
            RoleUtilisateur.pecheur,
        )
    ),
]


@router.post("", response_model=ZoneRead, status_code=201)
async def create_zone(
    payload: ZoneCreate,
    db: DbSession,
    _: AdminZones,
) -> ZoneRead:
    return await service.create_zone(db, payload)


@router.get("", response_model=list[ZoneRead])
async def list_zones(
    db: DbSession,
    _: ZonesReader,
    actif: bool | None = None,
    type_zone: Annotated[TypeZone | None, Query(alias="type")] = None,
) -> list[ZoneRead]:
    return await service.list_zones(db, actif=actif, type_zone=type_zone)


@router.post("/import/geojson", response_model=ZoneImportResult, status_code=201)
async def import_zones_geojson(
    payload: ZoneGeoJSONImport,
    db: DbSession,
    _: AdminZones,
) -> ZoneImportResult:
    """Import GeoJSON FeatureCollection (MVP §5.3 — pas d'éditeur graphique)."""
    return await service.import_geojson(db, payload)


@router.post("/detect/intersection", response_model=IntersectionCheckResponse)
async def detect_intersection(
    payload: IntersectionCheckRequest,
    db: DbSession,
    _: ZonesReader,
) -> IntersectionCheckResponse:
    """Intersection position/zone via PostGIS ST_Intersects (extension M7 : alertes)."""
    return await service.check_intersection(db, payload)


@router.get("/{zone_id}", response_model=ZoneRead)
async def get_zone(
    zone_id: UUID,
    db: DbSession,
    _: ZonesReader,
) -> ZoneRead:
    return await service.get_zone(db, zone_id)


@router.patch("/{zone_id}", response_model=ZoneRead)
async def update_zone(
    zone_id: UUID,
    payload: ZoneUpdate,
    db: DbSession,
    _: AdminZones,
) -> ZoneRead:
    return await service.update_zone(db, zone_id, payload)


@router.delete("/{zone_id}", response_model=MessageResponse)
async def delete_zone(
    zone_id: UUID,
    db: DbSession,
    _: AdminZones,
) -> MessageResponse:
    await service.delete_zone(db, zone_id)
    return MessageResponse(detail="Zone réglementée supprimée")
