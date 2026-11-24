"""Routes `/activite` : heures par maille, captures par zone, rapport de zone (lot 5)."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur, SourcePosition
from app.db.models import Utilisateur
from app.modules.activite import service
from app.modules.activite.schemas import (
    CapturesZoneRead,
    MaillesActiviteRead,
    RapportZoneRead,
    SecteurRead,
)

router = APIRouter(prefix="/activite", tags=["activite-zones"])

# Lecture filtrée par périmètre : le pêcheur ne voit que ses embarcations, les rôles
# de pilotage toute la flotte. Le rôle organisation n'est pas admis : il n'a pas accès
# aux positions de ses membres ailleurs dans l'API (module M2), et l'ouvrir ici
# reviendrait à le lui donner. Décision à prendre par le porteur.
LecteurActivite = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.chercheur,
            RoleUtilisateur.pecheur,
        )
    ),
]

# Le rapport de zone nomme des embarcations et liste des alertes : rôles de pilotage seulement.
LecteurRapport = Annotated[
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

Debut = Annotated[
    datetime | None, Query(description="Début de la période, inclus (ISO 8601, UTC par défaut)")
]
Fin = Annotated[
    datetime | None, Query(description="Fin de la période, exclue (ISO 8601, UTC par défaut)")
]
ZoneId = Annotated[UUID | None, Query(description="Zone réglementée")]
Secteur = Annotated[
    str | None, Query(max_length=64, description="Identifiant d'un secteur de mer du référentiel")
]


@router.get("/secteurs", response_model=list[SecteurRead])
async def lister_secteurs(_: LecteurActivite) -> list[SecteurRead]:
    """Secteurs de mer utilisables comme filtre (référentiel partagé avec le bulletin)."""
    return service.secteurs()


@router.get("/mailles", response_model=MaillesActiviteRead)
async def heures_par_maille(
    db: DbSession,
    user: LecteurActivite,
    debut: Debut = None,
    fin: Fin = None,
    emprise: Annotated[
        str | None,
        Query(
            max_length=120,
            description="lon min,lat min,lon max,lat max en degrés décimaux",
        ),
    ] = None,
    secteur: Secteur = None,
    zone_id: ZoneId = None,
    embarcation_id: Annotated[UUID | None, Query()] = None,
    source: Annotated[SourcePosition | None, Query(description="mobile ou balise")] = None,
) -> MaillesActiviteRead:
    """Heures d'activité par maille, en GeoJSON, à partir des positions de la plateforme.

    Règle de calcul au statut « Proposé » (valideurs : Christian, expert halieutique),
    renvoyée avec la réponse.
    """
    return await service.mailles_activite(
        db,
        user,
        debut=debut,
        fin=fin,
        emprise=emprise,
        secteur=secteur,
        zone_id=zone_id,
        embarcation_id=embarcation_id,
        source=source,
    )


@router.get("/captures-par-zone", response_model=CapturesZoneRead)
async def captures_par_zone(
    db: DbSession,
    user: LecteurActivite,
    zone_id: ZoneId = None,
    secteur: Secteur = None,
    debut: Debut = None,
    fin: Fin = None,
) -> CapturesZoneRead:
    """Volumes déclarés par espèce dans une zone réglementée ou un secteur.

    Seules les captures dont le lieu de pêche est connu sont rattachées à la zone ;
    les captures sans position sont comptées à part.
    """
    return await service.captures_par_zone(
        db, user, zone_id=zone_id, secteur=secteur, debut=debut, fin=fin
    )


@router.get("/rapport-zone", response_model=RapportZoneRead)
async def rapport_zone(
    db: DbSession,
    user: LecteurRapport,
    zone_id: ZoneId = None,
    secteur: Secteur = None,
    debut: Debut = None,
    fin: Fin = None,
) -> RapportZoneRead:
    """Rapport de zone à la demande : activité, embarcations présentes, captures, alertes.

    La version PDF se trouve sous `/documents/rapport-zone`.
    """
    return await service.rapport_zone(
        db, user, zone_id=zone_id, secteur=secteur, debut=debut, fin=fin
    )
