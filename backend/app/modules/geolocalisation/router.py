"""Routes M2 — géolocalisation & trajectoires (§5.2)."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.geolocalisation import service
from app.modules.geolocalisation.schemas import (
    EmbarcationTrackRead,
    FicheEmbarcationRead,
    LicenceDossierRead,
    LiveVesselRead,
    PortPresenceResponse,
    PositionBatchCreate,
    PositionCreate,
    PositionRead,
    TrajectorySegmentRead,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/positions", tags=["m2-geolocalisation"])

GeolocUser = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.pecheur,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
        )
    ),
]

# Purge trajectoire : pas le chercheur ni le pêcheur (historique réglementaire).
TrajectoryAdmin = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
        )
    ),
]


class GeolocConfig(BaseModel):
    gps_interval_minutes: int = Field(..., description="Intervalle d'envoi GPS (§5.2)")


@router.get("/config", response_model=GeolocConfig)
async def get_geoloc_config(_: GeolocUser) -> GeolocConfig:
    return GeolocConfig(gps_interval_minutes=settings.gps_interval_minutes)


@router.post("", response_model=PositionRead, status_code=201)
async def post_position(
    payload: PositionCreate,
    db: DbSession,
    user: GeolocUser,
) -> PositionRead:
    return await service.create_position(db, user, payload)


@router.post("/batch", response_model=list[PositionRead], status_code=201)
async def post_positions_batch(
    payload: PositionBatchCreate,
    db: DbSession,
    user: GeolocUser,
) -> list[PositionRead]:
    return await service.create_positions_batch(db, user, payload)


@router.get("/trajectory", response_model=list[PositionRead])
async def get_trajectory(
    db: DbSession,
    user: GeolocUser,
    embarcation_id: Annotated[UUID, Query()],
    debut: datetime | None = None,
    fin: datetime | None = None,
) -> list[PositionRead]:
    return await service.get_trajectory(
        db, user, embarcation_id=embarcation_id, debut=debut, fin=fin
    )


@router.get("/trajectories", response_model=list[TrajectorySegmentRead])
async def list_trajectories(
    db: DbSession,
    user: GeolocUser,
    embarcation_id: UUID | None = None,
    gap_hours: Annotated[float, Query(ge=0.5, le=48)] = 2.0,
) -> list[TrajectorySegmentRead]:
    """Liste toutes les sorties (plusieurs trajectoires possibles par embarcation)."""
    return await service.list_trajectory_segments(
        db, user, gap_hours=gap_hours, embarcation_id=embarcation_id
    )


@router.get("/live", response_model=list[LiveVesselRead])
async def list_live_fleet(
    db: DbSession,
    user: GeolocUser,
    since_minutes: Annotated[int, Query(ge=5, le=24 * 60)] = 360,
) -> list[LiveVesselRead]:
    """Circulation near-live : dernière position par embarcation (côte + fleuves).

    Rafraîchir côté client toutes les 15–30 s. Source = GPS mobile / démo (pas AIS).
    """
    return await service.list_live_vessels(db, user, since_minutes=since_minutes)


@router.get("/presence-ports", response_model=PortPresenceResponse)
async def presence_ports(
    db: DbSession,
    user: GeolocUser,
    fenetre_heures: Annotated[int, Query(ge=1, le=7 * 24)] = 24,
) -> PortPresenceResponse:
    """Présence au port de la flotte PIGAP, calculée depuis les positions GPS.

    À quai, en manœuvre, en mer ou sans signal par embarcation ; arrivées,
    départs et cohérence des déclarations de débarquement sur la fenêtre.
    Aucun matériel requis : même référentiel de ports que la couche AIS.
    """
    from app.modules.geolocalisation.presence import compute_port_presence

    return await compute_port_presence(db, user, fenetre_heures=fenetre_heures)


@router.get("/embarcations/{embarcation_id}/fiche", response_model=FicheEmbarcationRead)
async def fiche_embarcation(
    embarcation_id: UUID,
    db: DbSession,
    user: GeolocUser,
) -> FicheEmbarcationRead:
    """Fiche d'une embarcation PIGAP au clic sur la carte : titulaire, licence,
    couverture d'abonnement, dernière position, statut au port, trajectoire 24 h,
    zones réglementées, alertes récentes, captures déclarées, verdict de régularité."""
    from app.modules.geolocalisation.fiche import fiche_embarcation as build

    return await build(db, user, embarcation_id)


@router.get("/dossier", response_model=LicenceDossierRead)
async def dossier_by_licence(
    db: DbSession,
    user: GeolocUser,
    licence: Annotated[str, Query(min_length=1, description="Numéro de licence")],
) -> LicenceDossierRead:
    """Recherche par licence : pêcheur, embarcations et trajectoires associées."""
    return await service.get_dossier_by_licence(db, user, licence=licence)


@router.get("/embarcations", response_model=list[EmbarcationTrackRead])
async def list_tracked_embarcations(
    db: DbSession,
    user: GeolocUser,
) -> list[EmbarcationTrackRead]:
    items = await service.list_embarcations_tracked(db, user)
    return [
        EmbarcationTrackRead(
            id=emb.id,
            pecheur_id=emb.pecheur_id,
            nom=emb.nom,
            immatriculation=emb.immatriculation,
            type=emb.type,
            positions_count=count,
            derniere_position_a=last,
        )
        for emb, count, last in items
    ]


@router.delete(
    "/embarcation/{embarcation_id}",
    response_model=MessageResponse,
)
async def clear_embarcation_trajectory(
    embarcation_id: UUID,
    db: DbSession,
    user: TrajectoryAdmin,
) -> MessageResponse:
    deleted = await service.clear_positions_for_embarcation(db, user, embarcation_id)
    return MessageResponse(detail=f"{deleted} position(s) supprimée(s)")


# Alias config hors préfixe positions pour lisibilité OpenAPI
config_router = APIRouter(prefix="/geoloc", tags=["m2-geolocalisation"])


@config_router.get("/config", response_model=GeolocConfig)
async def geoloc_config(_: CurrentUser) -> GeolocConfig:
    return GeolocConfig(gps_interval_minutes=settings.gps_interval_minutes)
