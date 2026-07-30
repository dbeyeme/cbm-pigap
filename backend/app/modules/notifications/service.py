"""Agrégats notifications portail (demandes + alertes)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import StatutAlerte, StatutDemandeLicence, TypeDemandeLicence
from app.db.models import Alerte, DemandeLicence
from app.modules.notifications.schemas import NotificationItem, NotificationSummary


async def build_summary(db: AsyncSession) -> NotificationSummary:
    # Compteurs exacts (COUNT sur PK) — pas d’approximation ni de cache.
    demandes_count = int(
        await db.scalar(
            select(func.count(DemandeLicence.id)).where(
                DemandeLicence.statut == StatutDemandeLicence.en_attente
            )
        )
        or 0
    )
    alertes_count = int(
        await db.scalar(
            select(func.count(Alerte.id)).where(Alerte.statut == StatutAlerte.nouvelle)
        )
        or 0
    )

    recent_demandes = (
        await db.execute(
            select(DemandeLicence)
            .where(DemandeLicence.statut == StatutDemandeLicence.en_attente)
            .order_by(DemandeLicence.date_creation.desc())
            .limit(5)
        )
    ).scalars().all()

    recent_alertes = (
        await db.execute(
            select(Alerte)
            .where(Alerte.statut == StatutAlerte.nouvelle)
            .order_by(Alerte.horodatage.desc())
            .limit(5)
        )
    ).scalars().all()

    items: list[NotificationItem] = []
    for d in recent_demandes:
        if d.type_demande == TypeDemandeLicence.personne_morale:
            label = d.org_nom or "Organisation"
        else:
            label = f"{(d.prenom or '').strip()} {(d.nom or '').strip()}".strip() or "Pêcheur"
        items.append(
            NotificationItem(
                kind="demande",
                id=str(d.id),
                title="Demande de licence en attente",
                body=label,
                created_at=d.date_creation,
                page="demandes",
            )
        )
    for a in recent_alertes:
        items.append(
            NotificationItem(
                kind="alerte",
                id=str(a.id),
                title=f"Alerte {a.type.value}",
                body=a.niveau_gravite.value,
                created_at=a.horodatage,
                page="alertes",
            )
        )

    items.sort(key=lambda x: x.created_at, reverse=True)
    return NotificationSummary(
        demandes_en_attente=demandes_count,
        alertes_nouvelles=alertes_count,
        total=demandes_count + alertes_count,
        items=items[:8],
    )
