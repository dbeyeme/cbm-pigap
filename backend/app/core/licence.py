"""Validité d'une autorisation de pêche artisanale (annuelle, barème observé)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.core.config import settings
from app.db.enums import StatutPecheur
from app.db.models import Pecheur


def date_expiration(pecheur: Pecheur) -> date | None:
    if pecheur.date_delivrance_licence is None:
        return None
    return pecheur.date_delivrance_licence + timedelta(days=int(settings.licence_validite_jours))


def statut_licence(pecheur: Pecheur, *, today: date | None = None) -> str:
    """`valide`, `expiree`, `suspendue` ou `sans_date` (délivrance inconnue)."""
    if pecheur.statut != StatutPecheur.actif:
        return "suspendue"
    exp = date_expiration(pecheur)
    if exp is None:
        return "sans_date"
    today = today or datetime.now(UTC).date()
    return "expiree" if today > exp else "valide"


def licence_valide(pecheur: Pecheur, *, today: date | None = None) -> bool:
    return statut_licence(pecheur, today=today) in ("valide", "sans_date")
