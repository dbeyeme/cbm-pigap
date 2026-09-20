"""Routes météo-marine : bulletin, zones calculées, avis localisé."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.modules.meteo_marine import service
from app.modules.meteo_marine.schemas import (
    AvisMer,
    BulletinMeteoMarine,
    ZonesCalculeesResponse,
)

router = APIRouter(prefix="/meteo", tags=["meteo-marine"])


@router.get("/bulletin", response_model=BulletinMeteoMarine)
async def bulletin(
    db: DbSession,
    _: CurrentUser,
    refresh: Annotated[bool, Query(description="Forcer le recalcul")] = False,
) -> BulletinMeteoMarine:
    """Bulletin météo-marine par secteur (houle, vent, courant, marée, température)
    et stations fluviales (débit, tendance), croisé avec captures, quotas et zones.

    Accessible à tous les rôles authentifiés, pêcheurs compris.
    """
    return await service.build_bulletin(db, force=refresh)


@router.get("/zones", response_model=ZonesCalculeesResponse)
async def zones(db: DbSession, _: CurrentUser) -> ZonesCalculeesResponse:
    """Zones calculées à afficher sur la carte : danger, prudence, favorable, surexploitée."""
    return service.zones_calculees(await service.build_bulletin(db))


@router.get("/avis", response_model=AvisMer)
async def avis(
    db: DbSession,
    _: CurrentUser,
    lon: Annotated[float, Query(ge=-180, le=180)],
    lat: Annotated[float, Query(ge=-90, le=90)],
) -> AvisMer:
    """Avis en langage clair pour une position (secteur le plus proche + fleuve proche)."""
    return service.avis_pour_position(await service.build_bulletin(db), lon, lat)
