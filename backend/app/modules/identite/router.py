"""Routes de la fiche d'identité à deux volets (lot 2). Lecture seule."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.identite import service
from app.modules.identite.schemas import FicheIdentiteRead

router = APIRouter(prefix="/identite", tags=["identite"])

# Le chercheur n'a pas accès au registre nominatif (comme pour `/pecheurs`)
LecteurIdentite = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.pecheur,
            RoleUtilisateur.organisation,
        )
    ),
]

PecheurConnecte = Annotated[Utilisateur, Depends(require_role(RoleUtilisateur.pecheur))]


@router.get("/moi", response_model=FicheIdentiteRead)
async def ma_fiche_d_identite(db: DbSession, user: PecheurConnecte) -> FicheIdentiteRead:
    """Ma fiche : ce que dit le registre, et ce que mes embarcations émettent."""
    return await service.ma_fiche(db, user)


@router.get("/pecheurs/{pecheur_id}", response_model=FicheIdentiteRead)
async def fiche_d_identite(
    pecheur_id: UUID, db: DbSession, user: LecteurIdentite
) -> FicheIdentiteRead:
    """Fiche d'un pêcheur et de ses embarcations, dans le périmètre du compte."""
    return await service.fiche_identite(db, user, pecheur_id)
