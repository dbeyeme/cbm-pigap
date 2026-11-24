"""Lecture typée de la règle « heures d'activité » (fichier `activite_zones.json`).

Statut : Proposé (valideurs : Christian, expert halieutique). Aucun paramètre n'a
de valeur de repli dans le code : chaque clé doit figurer dans le fichier, y
compris celles qui sont volontairement vides (`null`).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.regles import charger_regles, entete_regle, regle_invalide

FICHIER = "activite_zones"


class ExclusionPorts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actif: bool
    # Vide : rayon de chaque port dans le référentiel des ports (`ports.json`)
    rayon_km: float | None = Field(..., gt=0, le=200)


class RegleActivite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intervalle_max_minutes: float = Field(..., gt=0, le=1440)
    # Vide : aucun filtre de vitesse (seuil à calibrer sur les traces du pilote)
    vitesse_max_noeuds: float | None = Field(..., gt=0, le=100)
    taille_maille_deg: float = Field(..., gt=0, le=1)
    exclusion_ports: ExclusionPorts
    periode_defaut_jours: int = Field(..., ge=1, le=3660)
    periode_max_jours: int = Field(..., ge=1, le=3660)
    mailles_max: int = Field(..., ge=1, le=200_000)


def regle_activite() -> tuple[RegleActivite, dict[str, Any]]:
    """Règle en vigueur et son en-tête (version, statut, valideurs)."""
    contenu = charger_regles(FICHIER)
    try:
        regle = RegleActivite.model_validate(contenu.get("activite"))
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
    return regle, entete_regle(contenu)
