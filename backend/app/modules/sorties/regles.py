"""Lecture typée du paramétrage `sorties.json` (statut Proposé, ADR-016).

Aucune valeur de repli dans le code : chaque clé doit figurer dans le fichier,
y compris celles qui sont volontairement vides (`null`).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.regles import charger_regles, entete_regle, regle_invalide
from app.db.enums import NiveauGravite

FICHIER = "sorties"


class RegleSorties(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tolerance_retard_minutes: float = Field(..., ge=0, le=1440)
    gravite_alerte: NiveauGravite
    duree_max_heures: float = Field(..., gt=0, le=720)
    avance_depart_max_minutes: float = Field(..., ge=0, le=1440)
    verification_minutes: float = Field(..., gt=0, le=1440)


class RegleLieu(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fenetre_heures: float = Field(..., gt=0, le=168)
    rayon_regroupement_km: float = Field(..., gt=0, le=50)
    intervalle_max_minutes: float = Field(..., gt=0, le=1440)
    # Vide : aucun filtre de vitesse (seuil à calibrer sur les traces du pilote)
    vitesse_max_noeuds: float | None = Field(..., gt=0, le=100)
    releves_min: int = Field(..., ge=1, le=1000)


def regle_sorties() -> tuple[RegleSorties, dict[str, Any]]:
    contenu = charger_regles(FICHIER)
    try:
        regle = RegleSorties.model_validate(contenu.get("sorties"))
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
    return regle, entete_regle(contenu)


def regle_lieu() -> tuple[RegleLieu, dict[str, Any]]:
    contenu = charger_regles(FICHIER)
    try:
        regle = RegleLieu.model_validate(contenu.get("lieu_de_peche"))
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
    return regle, entete_regle(contenu)
