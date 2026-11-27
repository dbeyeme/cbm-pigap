"""Routes commandes client → pêcheur (lot 7, ADR-014)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.commandes import service
from app.modules.commandes.schemas import (
    ClientInscription,
    ClientInscriptionRead,
    CommandeCreate,
    CommandeRead,
    PecheurVitrineRead,
)

router = APIRouter(prefix="/commandes", tags=["lot7-commandes"])

ClientConnecte = Annotated[Utilisateur, Depends(require_role(RoleUtilisateur.client))]

LecteurCommande = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.client,
            RoleUtilisateur.pecheur,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
        )
    ),
]

PecheurConnecte = Annotated[Utilisateur, Depends(require_role(RoleUtilisateur.pecheur))]

AnnuleurCommande = Annotated[
    Utilisateur,
    Depends(require_role(RoleUtilisateur.client, RoleUtilisateur.pecheur)),
]


@router.post(
    "/inscription",
    response_model=ClientInscriptionRead,
    status_code=status.HTTP_201_CREATED,
)
async def inscrire_client(db: DbSession, payload: ClientInscription) -> ClientInscriptionRead:
    """Inscription publique d'un compte client (réservation sans paiement en ligne)."""
    return await service.inscrire_client(db, payload)


@router.post("", response_model=CommandeRead, status_code=status.HTTP_201_CREATED)
async def creer_commande(
    payload: CommandeCreate, db: DbSession, user: ClientConnecte
) -> CommandeRead:
    """Réserve une commande auprès d'un pêcheur (statut initial : reservee)."""
    return await service.creer_commande(db, user, payload)


@router.get("/pecheurs", response_model=list[PecheurVitrineRead])
async def lister_pecheurs_vitrine(
    db: DbSession, _: ClientConnecte
) -> list[PecheurVitrineRead]:
    """Pêcheurs actifs pour le formulaire de réservation client."""
    return await service.lister_pecheurs_vitrine(db)


@router.get("", response_model=list[CommandeRead])
async def lister_commandes(db: DbSession, user: LecteurCommande) -> list[CommandeRead]:
    """Liste les commandes visibles dans le périmètre du compte."""
    return await service.lister_commandes(db, user)


@router.get("/{commande_id}", response_model=CommandeRead)
async def lire_commande(
    commande_id: UUID, db: DbSession, user: LecteurCommande
) -> CommandeRead:
    return await service.lire_commande(db, user, commande_id)


@router.post("/{commande_id}/accepter", response_model=CommandeRead)
async def accepter_commande(
    commande_id: UUID, db: DbSession, user: PecheurConnecte
) -> CommandeRead:
    return await service.accepter_commande(db, user, commande_id)


@router.post("/{commande_id}/confirmer-vendeur", response_model=CommandeRead)
async def confirmer_vendeur(
    commande_id: UUID, db: DbSession, user: PecheurConnecte
) -> CommandeRead:
    return await service.confirmer_vendeur(db, user, commande_id)


@router.post("/{commande_id}/confirmer-client", response_model=CommandeRead)
async def confirmer_client(
    commande_id: UUID, db: DbSession, user: ClientConnecte
) -> CommandeRead:
    return await service.confirmer_client(db, user, commande_id)


@router.post("/{commande_id}/annuler", response_model=CommandeRead)
async def annuler_commande(
    commande_id: UUID, db: DbSession, user: AnnuleurCommande
) -> CommandeRead:
    return await service.annuler_commande(db, user, commande_id)