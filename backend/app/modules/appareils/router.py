"""Routes des appareils d'un pêcheur (ADR-012), pour les agents et les administrateurs.

Le rattachement lui-même se fait à la connexion (`/auth/login`) et se vérifie à
l'envoi des positions (`/positions`), par l'en-tête `X-Appareil-Id`.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.appareils import service
from app.modules.appareils.schemas import AppareilsPecheurRead, MotifAppareil

router = APIRouter(prefix="/pecheurs/{pecheur_id}/appareils", tags=["appareils"])

# Libération et autorisation : agents de contrôle et administrateurs seulement (R4)
GestionAppareils = Annotated[
    Utilisateur,
    Depends(require_role(RoleUtilisateur.agent_controle, RoleUtilisateur.admin)),
]


@router.get("", response_model=AppareilsPecheurRead)
async def lister_appareils(
    pecheur_id: UUID, db: DbSession, _: GestionAppareils
) -> AppareilsPecheurRead:
    """Appareils rattachés à un pêcheur : empreinte abrégée, dates, état, libérations."""
    return await service.lister(db, pecheur_id)


@router.post("/autorisation", response_model=AppareilsPecheurRead)
async def autoriser_appareil_supplementaire(
    pecheur_id: UUID, payload: MotifAppareil, db: DbSession, acteur: GestionAppareils
) -> AppareilsPecheurRead:
    """Autorise un appareil de plus pour ce pêcheur, avec un motif conservé au journal."""
    return await service.autoriser_supplementaire(db, acteur, pecheur_id, payload.motif)


@router.post("/{appareil_id}/liberation", response_model=AppareilsPecheurRead)
async def liberer_appareil(
    pecheur_id: UUID,
    appareil_id: UUID,
    payload: MotifAppareil,
    db: DbSession,
    acteur: GestionAppareils,
) -> AppareilsPecheurRead:
    """Libère un appareil (perte, panne, remplacement) : motif, auteur et date conservés."""
    return await service.liberer(db, acteur, pecheur_id, appareil_id, payload.motif)
