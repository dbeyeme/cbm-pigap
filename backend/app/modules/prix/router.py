"""Routes du lot 6 : courbes de prix et carnet des déclarations."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.prix import service
from app.modules.prix.schemas import CarnetRead, CourbesPrixRead, GrainPrix

router = APIRouter(prefix="/prix", tags=["lot6-prix"])

CourbesReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
            RoleUtilisateur.organisation,
        )
    ),
]

CarnetReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
            RoleUtilisateur.organisation,
        )
    ),
]


@router.get("/courbes", response_model=CourbesPrixRead)
async def lire_courbes(
    db: DbSession,
    _: CourbesReader,
    debut: datetime | None = None,
    fin: datetime | None = None,
    grain: Annotated[GrainPrix, Query(description="Grain d'agrégation")] = "semaine",
    espece: Annotated[str | None, Query(max_length=128)] = None,
) -> CourbesPrixRead:
    """Moyennes de prix déclarés, masquées sous les seuils d'anonymat (Proposé)."""
    code = espece.strip().lower() if espece and espece.strip() else None
    return await service.courbes(db, debut=debut, fin=fin, grain=grain, espece=code)


@router.get("/carnet", response_model=CarnetRead)
async def lire_carnet(
    db: DbSession,
    user: CarnetReader,
    pecheur_id: UUID | None = None,
    debut: datetime | None = None,
    fin: datetime | None = None,
) -> CarnetRead:
    """Déclarations regroupées par embarcation et par jour civil (Libreville)."""
    return await service.carnet(db, user, pecheur_id=pecheur_id, debut=debut, fin=fin)
