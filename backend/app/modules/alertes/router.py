"""Routes M7, alertes intelligentes (§5.7), et traitement des alertes (lot 9)."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import DbSession, require_role
from app.db.enums import NiveauGravite, RoleUtilisateur, StatutAlerte, TypeAlerte
from app.db.models import Utilisateur
from app.modules.alertes import service
from app.modules.alertes.schemas import (
    AlerteDetailRead,
    AlerteRead,
    AlerteTraitement,
    AlerteUpdateStatut,
    EtatsRead,
)

router = APIRouter(prefix="/alertes", tags=["m7-alertes"])

AlertesReader = Annotated[
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

AlertesAdmin = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
        )
    ),
]


# Journal de traçabilité : noms des agents ; le chercheur n'y a pas accès (Proposé)
AlertesTraitement = AlertesAdmin


@router.get("/etats", response_model=EtatsRead)
async def etats_de_traitement(_: AlertesReader) -> EtatsRead:
    """États de traitement, leurs libellés et les passages permis depuis chacun."""
    return service.etats()


@router.get("", response_model=list[AlerteRead])
async def list_alertes(
    response: Response,
    db: DbSession,
    user: AlertesReader,
    type_alerte: Annotated[TypeAlerte | None, Query(alias="type")] = None,
    statut: StatutAlerte | None = None,
    embarcation_id: UUID | None = None,
    etat: Annotated[list[str] | None, Query(description="État de traitement, répétable")] = None,
    gravite: Annotated[list[NiveauGravite] | None, Query(description="Répétable")] = None,
    regle: Annotated[str | None, Query(max_length=64)] = None,
    depuis: datetime | None = None,
    jusqu_a: datetime | None = None,
    limit: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AlerteRead]:
    """Alertes de la plus récente à la plus ancienne. Le total avant pagination est
    renvoyé dans l'en-tête `X-Total-Count`."""
    alertes, total = await service.list_alertes(
        db,
        user,
        type_alerte=type_alerte,
        statut=statut,
        embarcation_id=embarcation_id,
        limit=limit,
        offset=offset,
        etats=etat,
        gravites=gravite,
        regle_code=regle,
        depuis=depuis,
        jusqu_a=jusqu_a,
    )
    response.headers["X-Total-Count"] = str(total)
    return alertes


@router.get("/{alerte_id}", response_model=AlerteDetailRead)
async def detail_alerte(alerte_id: UUID, db: DbSession, _: AlertesTraitement) -> AlerteDetailRead:
    """Description détaillée, journal de traitement et passages possibles."""
    return await service.detail_alerte(db, alerte_id)


@router.post("/{alerte_id}/traitements", response_model=AlerteDetailRead)
async def traiter_alerte(
    alerte_id: UUID, payload: AlerteTraitement, db: DbSession, user: AlertesTraitement
) -> AlerteDetailRead:
    """Change l'état de traitement ; commentaire obligatoire, inscrit au journal."""
    return await service.traiter(db, alerte_id, payload, user)


@router.patch("/{alerte_id}", response_model=AlerteRead)
async def patch_alerte_statut(
    alerte_id: UUID,
    payload: AlerteUpdateStatut,
    db: DbSession,
    user: AlertesAdmin,
) -> AlerteRead:
    """Ancien point d'accès (statut historique), conservé pour le portail existant ;
    le changement est inscrit au journal."""
    return await service.update_statut(db, alerte_id, payload, user)
