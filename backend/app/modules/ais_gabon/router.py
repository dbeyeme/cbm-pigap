"""Routes AIS — eaux gabonaises (ADR-005)."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.config import settings
from app.core.deps import DbSession, require_role
from app.core.errors import not_found
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.ais_gabon import service
from app.modules.ais_gabon.schemas import (
    AisIngestPayload,
    AisIngestResult,
    AisLiveResponse,
    AisPortsResponse,
    AisStreamStatus,
    AisVesselDetail,
)

router = APIRouter(prefix="/ais", tags=["ais-eaux-gabon"])

AisUser = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
        )
    ),
]


@router.get("/live", response_model=AisLiveResponse)
async def ais_live_fleet(
    _: AisUser,
    refresh: Annotated[bool, Query(description="Forcer un recalcul immédiat")] = False,
) -> AisLiveResponse:
    """Navires AIS dans les eaux gabonaises (ZEE + marge côtière).

    État de flotte accumulé en continu (flux AISStream + récepteurs locaux),
    avec statut opérationnel (à quai, au mouillage, en route, en pêche) et
    port de rattachement. Distinct des positions GPS PIGAP (`/positions/live`).
    """
    return await service.list_ais_live(force=refresh)


@router.get("/ports", response_model=AisPortsResponse)
async def ais_ports(_: AisUser) -> AisPortsResponse:
    """Présence par port (Owendo, Port-Gentil, …) : effectifs et navires."""
    return await service.list_ais_ports()


@router.get("/vessels/{mmsi}", response_model=AisVesselDetail)
async def ais_vessel_detail(mmsi: str, db: DbSession, _: AisUser) -> AisVesselDetail:
    """Fiche navire : identification (pavillon, IMO, type), régularité (registre
    PIGAP, zones réglementées, statut), localisation (position, port, route récente,
    position estimée, entrée prévue)."""
    detail = await service.get_vessel_detail(db, mmsi)
    if detail is None:
        raise not_found("Navire AIS inconnu ou plus suivi", "AIS_VESSEL_NOT_FOUND")
    return detail


@router.get("/status", response_model=AisStreamStatus)
async def ais_status(_: AisUser) -> AisStreamStatus:
    """État de la connexion au flux AIS communautaire."""
    st = service.stream_status.model_copy()
    st.configured = bool((settings.aisstream_api_key or "").strip())
    return st


@router.post("/ingest", response_model=AisIngestResult)
async def ais_ingest(
    payload: AisIngestPayload,
    x_ais_ingest_key: Annotated[str | None, Header(alias="X-AIS-Ingest-Key")] = None,
) -> AisIngestResult:
    """Réception des messages d'un récepteur AIS local (AIS-catcher JSON ou NMEA).

    Authentification par clé partagée `X-AIS-Ingest-Key` (`AIS_INGEST_KEY`).
    """
    expected = (settings.ais_ingest_key or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingestion AIS locale non configurée (AIS_INGEST_KEY)",
        )
    if not x_ais_ingest_key or not hmac.compare_digest(x_ais_ingest_key.strip(), expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clé d'ingestion AIS invalide",
        )
    if not payload.messages and not payload.nmea:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Fournissez `messages` (JSON AIS-catcher) ou `nmea`",
        )
    return service.ingest_local(payload)
