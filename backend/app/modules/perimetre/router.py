"""Routes lot 8 — périmètre de suivi (ADR-015)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.perimetre import service
from app.modules.perimetre.schemas import (
    AgentZonesRead,
    AgentZonesUpdate,
    PerimetreFiltreRead,
    PerimetreZonePatch,
    PerimetreZoneRead,
)

router = APIRouter(prefix="/perimetre", tags=["lot8-perimetre"])

LecteurPerimetre = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.admin,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.autorite,
        )
    ),
]

AdminPerimetre = Annotated[Utilisateur, Depends(require_role(RoleUtilisateur.admin))]
AgentConnecte = Annotated[Utilisateur, Depends(require_role(RoleUtilisateur.agent_controle))]


@router.get("", response_model=list[PerimetreZoneRead])
async def list_perimetre_zones(db: DbSession, _: LecteurPerimetre) -> list[PerimetreZoneRead]:
    await service.assurer_seed_defaut(db)
    return await service.list_zones(db)


@router.get("/filtre", response_model=PerimetreFiltreRead)
async def lire_filtre_perimetre(db: DbSession, _: LecteurPerimetre) -> PerimetreFiltreRead:
    await service.assurer_seed_defaut(db)
    return await service.lire_filtre(db)


@router.get("/moi/zones", response_model=AgentZonesRead)
async def mes_zones_agent(db: DbSession, user: AgentConnecte) -> AgentZonesRead:
    """Zones affectées à l'agent connecté (§7)."""
    await service.assurer_seed_defaut(db)
    return await service.lire_zones_agent(db, user.id)


@router.get("/agents/{utilisateur_id}/zones", response_model=AgentZonesRead)
async def zones_d_un_agent(
    utilisateur_id: UUID, db: DbSession, _: AdminPerimetre
) -> AgentZonesRead:
    await service.assurer_seed_defaut(db)
    return await service.lire_zones_agent(db, utilisateur_id)


@router.put("/agents/{utilisateur_id}/zones", response_model=AgentZonesRead)
async def definir_zones_agent(
    utilisateur_id: UUID,
    payload: AgentZonesUpdate,
    db: DbSession,
    _: AdminPerimetre,
) -> AgentZonesRead:
    """Remplace les zones de l'agent (admin)."""
    await service.assurer_seed_defaut(db)
    return await service.remplacer_zones_agent(db, utilisateur_id, payload)


@router.patch("/{zone_id}", response_model=PerimetreZoneRead)
async def patch_perimetre_zone(
    zone_id: UUID,
    payload: PerimetreZonePatch,
    db: DbSession,
    _: AdminPerimetre,
) -> PerimetreZoneRead:
    await service.assurer_seed_defaut(db)
    return await service.patch_zone(db, zone_id, payload)
