"""Journal d'accès aux données sensibles — cahier §7."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import LogAcces


async def enregistrer(
    db: AsyncSession,
    *,
    utilisateur_id: UUID | None,
    ressource: str,
    action: str,
    detail: str | None = None,
    commit: bool = False,
) -> None:
    """Ajoute une ligne `LogAcces`. `commit=True` si l'appelant ne commit pas ensuite."""
    db.add(
        LogAcces(
            utilisateur_id=utilisateur_id,
            ressource=ressource[:128],
            action=action[:64],
            detail=detail,
        )
    )
    if commit:
        await db.commit()
