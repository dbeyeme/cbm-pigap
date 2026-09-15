"""Calendrier d'affichage saisonnier — labels seulement (ADR-006).

À valider avec un expert halieutique : ce n'est pas une saison biologique.
Grain d'analyse : semaine / mois.
"""

from __future__ import annotations

from datetime import date, datetime

SAISON_SECHE = "saison_seche"
SAISON_PLUIES = "saison_pluies"


def saison_calendaire(value: datetime | date) -> str:
    """juin–septembre = saison sèche ; octobre–mai = saison des pluies."""
    month = value.month
    if 6 <= month <= 9:
        return SAISON_SECHE
    return SAISON_PLUIES
