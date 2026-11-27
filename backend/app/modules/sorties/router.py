"""Routes `/sorties` : déclaration de sortie et de retour, lieu de pêche proposé (lot 11)."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.sorties import service
from app.modules.sorties.schemas import (
    LieuDePecheRead,
    SortieCreate,
    SortieRead,
    SortieRetour,
    StatutSortie,
)

router = APIRouter(prefix="/sorties", tags=["sorties"])

# Le pêcheur déclare pour ses embarcations ; l'administrateur pour toutes.
Declarant = Annotated[
    Utilisateur, Depends(require_role(RoleUtilisateur.pecheur, RoleUtilisateur.admin))
]
# Le retour peut aussi être constaté au port par un agent de contrôle.
ConstatRetour = Annotated[
    Utilisateur,
    Depends(
        require_role(RoleUtilisateur.pecheur, RoleUtilisateur.agent_controle, RoleUtilisateur.admin)
    ),
]
# Lecture selon le périmètre : l'organisation voit les sorties de ses membres.
Lecteur = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.organisation,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.autorite,
            RoleUtilisateur.admin,
        )
    ),
]
# Le lieu proposé lit des positions : mêmes rôles que les heures d'activité (lot 5).
LecteurTrace = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.autorite,
            RoleUtilisateur.admin,
        )
    ),
]


@router.post(
    "",
    response_model=SortieRead,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"description": "Déclaration déjà reçue, complétée le cas échéant"}},
)
async def declarer_sortie(
    data: SortieCreate, db: DbSession, user: Declarant, response: Response
) -> SortieRead:
    """Déclaration idempotente : un renvoi du même `client_id` complète la même sortie."""
    sortie, creee = await service.declarer(db, user, data)
    if not creee:
        response.status_code = status.HTTP_200_OK
    return sortie


@router.get("", response_model=list[SortieRead])
async def lister_sorties(
    db: DbSession,
    user: Lecteur,
    statut: StatutSortie | None = None,
    embarcation_id: UUID | None = None,
    depuis: Annotated[datetime | None, Query(description="Départ à partir de")] = None,
    jusqu_a: Annotated[datetime | None, Query(description="Départ avant")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[SortieRead]:
    return await service.lister(
        db,
        user,
        statut=statut,
        embarcation_id=embarcation_id,
        depuis=depuis,
        jusqu_a=jusqu_a,
        limit=limit,
    )


@router.get("/lieu-de-peche", response_model=LieuDePecheRead)
async def lieu_de_peche(
    db: DbSession,
    user: LecteurTrace,
    embarcation_id: UUID,
    avant: Annotated[datetime, Query(description="Heure de la capture")],
) -> LieuDePecheRead:
    """Point proposé depuis la trace de la sortie ; jamais inscrit d'office sur une capture."""
    return await service.lieu_de_peche(db, user, embarcation_id, avant)


@router.get("/{sortie_id}", response_model=SortieRead)
async def lire_sortie(sortie_id: UUID, db: DbSession, user: Lecteur) -> SortieRead:
    return await service.lire(db, user, sortie_id)


@router.post("/{sortie_id}/retour", response_model=SortieRead)
async def declarer_retour(
    sortie_id: UUID, data: SortieRetour, db: DbSession, user: ConstatRetour
) -> SortieRead:
    return await service.declarer_retour(db, user, sortie_id, data)
