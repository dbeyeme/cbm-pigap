"""Routes de la page de profil d'un acteur (lot 2).

- `/profils/moi` : l'acteur (pêcheur ou organisation) lit et règle sa page ;
- `/profils/pecheurs/{id}`, `/profils/organisations/{id}` : tout compte connecté ;
- `/public/profils/{jeton}` : sans connexion, seulement si l'acteur a ouvert sa
  page au public, et sans aucune coordonnée personnelle.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path
from fastapi.responses import Response

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.profils import service
from app.modules.profils.schemas import (
    MonProfilRead,
    MonProfilUpdate,
    ProfilPublicRead,
    ProfilRead,
)

router = APIRouter(prefix="/profils", tags=["profils"])
public_router = APIRouter(prefix="/public/profils", tags=["public"])

# L'acteur règle sa propre page
ActeurConnecte = Annotated[
    Utilisateur,
    Depends(require_role(RoleUtilisateur.pecheur, RoleUtilisateur.organisation)),
]

# Décision du porteur : la page est visible de toute personne connectée
CompteConnecte = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.organisation,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
            RoleUtilisateur.admin,
        )
    ),
]


@router.get("/moi", response_model=MonProfilRead)
async def lire_mon_profil(db: DbSession, user: ActeurConnecte) -> MonProfilRead:
    """Ma page, avec mes réglages : espèces masquées, tarifs, ouverture au public."""
    return await service.mon_profil(db, user)


@router.patch("/moi", response_model=MonProfilRead)
async def modifier_mon_profil(
    payload: MonProfilUpdate, db: DbSession, user: ActeurConnecte
) -> MonProfilRead:
    """Modifie ma page ; seuls les champs envoyés changent."""
    return await service.modifier_mon_profil(db, user, payload)


@router.get("/moi/qr")
async def qr_de_mon_profil(db: DbSession, user: ActeurConnecte) -> Response:
    """QR code du lien public de ma page (image SVG), quand elle est ouverte au public."""
    return Response(
        content=await service.qr_de_mon_profil(db, user),
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/pecheurs/{pecheur_id}", response_model=ProfilRead)
async def profil_d_un_pecheur(pecheur_id: UUID, db: DbSession, _: CompteConnecte) -> ProfilRead:
    return await service.profil_pecheur(db, pecheur_id)


@router.get("/organisations/{organisation_id}", response_model=ProfilRead)
async def profil_d_une_organisation(
    organisation_id: UUID, db: DbSession, _: CompteConnecte
) -> ProfilRead:
    return await service.profil_organisation(db, organisation_id)


@public_router.get("/{jeton}", response_model=ProfilPublicRead)
async def profil_public(
    response: Response,
    db: DbSession,
    jeton: Annotated[str, Path(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")],
) -> ProfilPublicRead:
    """Vitrine publique d'un acteur, par le lien ou le QR code qu'il a choisi de partager."""
    # Jamais gardée en mémoire par un intermédiaire : une page refermée cesse d'être servie
    response.headers["Cache-Control"] = "no-store"
    return await service.profil_public(db, jeton)
