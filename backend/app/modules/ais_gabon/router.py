"""Routes AIS open data — ZEE Gabon uniquement (ADR-005)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.ais_gabon import service
from app.modules.ais_gabon.schemas import AisLiveResponse

router = APIRouter(prefix="/ais", tags=["ais-zee-gabon"])

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
    refresh: Annotated[bool, Query(description="Forcer un nouvel appel fournisseur")] = False,
) -> AisLiveResponse:
    """Navires AIS dans la ZEE gabonaise (open data, filtre Marine Regions).

    Distinct des positions GPS PIGAP (`/positions/live`). Pas de pirogues fluviales.
    """
    return await service.list_ais_live(force=refresh)
