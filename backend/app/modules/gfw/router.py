"""Routes `/gfw` : essai Global Fishing Watch (ADR-011), à l'arrêt par défaut.

Réservées aux rôles d'autorité, d'agent de contrôle et d'administrateur. Tant
que `GFW_ENABLED` est faux ou que le jeton manque, les routes de données
répondent 503 sans appeler l'éditeur ; `/gfw/etat` dit à l'écran s'il doit
s'afficher. Aucune de ces routes n'écrit en base ni ne déclenche d'alerte.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.core.deps import require_role_puis_liberer
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.gfw import service
from app.modules.gfw.schemas import (
    DetectionsRadarRead,
    EtatGfw,
    EvenementsPecheRead,
    IdentiteNavireRead,
    NaviresObservesRead,
    PecheApparenteRead,
)

router = APIRouter(prefix="/gfw", tags=["gfw-essai"])

# Le rôle est vérifié, puis la connexion de base est rendue : ces routes attendent
# l'éditeur, parfois longtemps, et ne lisent rien en base.
LecteurGfw = Annotated[
    Utilisateur,
    Depends(
        require_role_puis_liberer(
            RoleUtilisateur.autorite,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
        )
    ),
]

Debut = Annotated[date | None, Query(description="Premier jour de la période (AAAA-MM-JJ)")]
Fin = Annotated[
    date | None,
    Query(
        description="Fin de la période (AAAA-MM-JJ), transmise telle quelle à l'éditeur ; "
        "ce jour est exclu d'après les essais du 2026-11-24"
    ),
]


@router.get("/etat", response_model=EtatGfw)
async def etat(_: LecteurGfw) -> EtatGfw:
    """Essai activé ou non, sans appel à l'éditeur."""
    return service.etat()


@router.get("/peche-apparente", response_model=PecheApparenteRead)
async def peche_apparente(
    _: LecteurGfw, debut: Debut = None, fin: Fin = None
) -> PecheApparenteRead:
    """Heures de pêche apparente dans la ZEE du Gabon, par mois et par pavillon."""
    return await service.peche_apparente(debut, fin)


@router.get("/navires", response_model=NaviresObservesRead)
async def navires_observes(
    _: LecteurGfw, debut: Debut = None, fin: Fin = None
) -> NaviresObservesRead:
    """Navires observés en pêche apparente : nom, pavillon, MMSI, numéro OMI, indicatif,
    engin et heures par navire."""
    return await service.navires_observes(debut, fin)


@router.get("/detections-radar", response_model=DetectionsRadarRead)
async def detections_radar(
    _: LecteurGfw, debut: Debut = None, fin: Fin = None
) -> DetectionsRadarRead:
    """Détections radar par satellite dans la ZEE du Gabon, par mois et par pavillon."""
    return await service.detections_radar(debut, fin)


@router.get("/evenements-peche", response_model=EvenementsPecheRead)
async def evenements_peche(
    _: LecteurGfw, debut: Debut = None, fin: Fin = None
) -> EvenementsPecheRead:
    """Épisodes de pêche apparente dans la ZEE du Gabon, avec un lieu par point."""
    return await service.evenements_peche(debut, fin)


@router.get("/navires/{vessel_id}", response_model=IdentiteNavireRead)
async def identite_navire(
    _: LecteurGfw,
    vessel_id: Annotated[
        str,
        Path(
            min_length=8,
            max_length=80,
            pattern=r"^[A-Za-z0-9-]+$",
            description="Identifiant du navire chez l'éditeur (liste des navires observés)",
        ),
    ],
) -> IdentiteNavireRead:
    """Fiche d'identité d'un navire : registres publics d'un côté, identité émise de l'autre."""
    return await service.identite_navire(vessel_id)
