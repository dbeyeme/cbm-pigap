"""Filtre géographique lecture (lot 8 + vue agent §7)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON, ST_Intersects
from sqlalchemy import ColumnElement, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.enums import RoleUtilisateur
from app.db.models import AgentZone, Alerte, PerimetreZone, Position, Utilisateur


def _sous_requete_union_active() -> Any:
    return (
        select(func.ST_Union(PerimetreZone.emprise))
        .where(PerimetreZone.actif.is_(True))
        .scalar_subquery()
    )


def _sous_requete_union_agent(agent_id: UUID) -> Any:
    """Union des zones actives affectées à l'agent (vide → aucune lecture)."""
    return (
        select(func.ST_Union(PerimetreZone.emprise))
        .select_from(PerimetreZone)
        .join(AgentZone, AgentZone.zone_id == PerimetreZone.id)
        .where(
            PerimetreZone.actif.is_(True),
            AgentZone.utilisateur_id == agent_id,
        )
        .scalar_subquery()
    )


def agent_id_pour_filtre(user: Utilisateur | None) -> UUID | None:
    """Identifiant agent si le filtre « sa zone » s'applique ; sinon None (vue large)."""
    if user is None:
        return None
    if user.role == RoleUtilisateur.agent_controle:
        return user.id
    return None


def clause_point_dans_emprise_active(
    position_col: Any, *, agent_id: UUID | None = None
) -> ColumnElement[bool] | None:
    """Clause SQL `ST_Intersects` sur l'emprise de lecture, ou `None` si filtre désactivé."""
    if not settings.perimetre_filtre_actif:
        return None
    union = (
        _sous_requete_union_agent(agent_id)
        if agent_id is not None
        else _sous_requete_union_active()
    )
    return ST_Intersects(position_col, union)


async def emprise_active_wkt(db: AsyncSession) -> Any | None:
    """Union des emprises actives (géométrie PostGIS) ; `None` si aucune zone active."""
    result = await db.execute(
        select(func.ST_Union(PerimetreZone.emprise)).where(PerimetreZone.actif.is_(True))
    )
    return result.scalar_one_or_none()


async def emprise_active_geojson(db: AsyncSession) -> dict | None:
    """GeoJSON de l'union des emprises actives."""
    union = await emprise_active_wkt(db)
    if union is None:
        return None
    result = await db.execute(select(ST_AsGeoJSON(union)))
    raw = result.scalar_one_or_none()
    if raw is None:
        return None
    import json

    return json.loads(raw)


async def codes_zones_actives(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(PerimetreZone.code).where(PerimetreZone.actif.is_(True)).order_by(PerimetreZone.code)
    )
    return list(result.scalars().all())


async def au_moins_une_zone_active(db: AsyncSession) -> bool:
    if not settings.perimetre_filtre_actif:
        return True
    n = await db.scalar(select(func.count(PerimetreZone.id)).where(PerimetreZone.actif.is_(True)))
    return int(n or 0) > 0


async def agent_a_au_moins_une_zone(db: AsyncSession, agent_id: UUID) -> bool:
    n = await db.scalar(
        select(func.count(AgentZone.id)).where(AgentZone.utilisateur_id == agent_id)
    )
    return int(n or 0) > 0


def clause_alerte_visible(*, agent_id: UUID | None = None) -> ColumnElement[bool] | None:
    """Alerte visible si sans embarcation, sans position, ou position dans l'emprise de lecture."""
    if not settings.perimetre_filtre_actif:
        return None
    union = (
        _sous_requete_union_agent(agent_id)
        if agent_id is not None
        else _sous_requete_union_active()
    )
    return or_(
        Alerte.embarcation_id.is_(None),
        ~exists(select(Position.id).where(Position.embarcation_id == Alerte.embarcation_id)),
        exists(
            select(Position.id).where(
                Position.embarcation_id == Alerte.embarcation_id,
                ST_Intersects(Position.position, union),
            )
        ),
    )
