"""Routes prédictions consultatives (ADR-006)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.predictions import service
from app.modules.predictions.schemas import PredictionsRead

router = APIRouter(prefix="/predictions", tags=["predictions"])

PredictionsReader = Annotated[
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


@router.get("", response_model=PredictionsRead)
async def read_predictions(
    db: DbSession,
    _: PredictionsReader,
    horizon_jours: Annotated[int, Query(ge=7, le=30)] = 30,
) -> PredictionsRead:
    """Prévisions pêches, pénuries, intrusions et zones — sans alerte M7."""
    return await service.get_predictions(db, horizon_jours=horizon_jours)
