"""Routes M6 — tableau de bord de pilotage (§5.6)."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.dashboard import service
from app.modules.dashboard.schemas import DashboardRead

router = APIRouter(prefix="/dashboard", tags=["m6-dashboard"])

DashboardReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.chercheur,
        )
    ),
]


@router.get("", response_model=DashboardRead)
async def read_dashboard(
    db: DbSession,
    _: DashboardReader,
    debut: Annotated[datetime | None, Query(description="Début période captures")] = None,
    fin: Annotated[datetime | None, Query(description="Fin période captures")] = None,
) -> DashboardRead:
    """Indicateurs exacts : pêcheurs actifs, volumes, espèces, alertes, zones actives."""
    return await service.get_dashboard(db, debut=debut, fin=fin)
