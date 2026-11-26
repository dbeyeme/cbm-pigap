"""Lecture typée du paramétrage de la carte de suivi (`carte_suivi.json`, lot 4).

Statut « Proposé » (valideur : Christian). Aucun paramètre n'a de valeur de
repli dans le code : un fichier absent ou incohérent rend le service
indisponible (503 `REGLE_INDISPONIBLE`).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.regles import charger_regles, entete_regle, regle_invalide
from app.db.enums import NiveauGravite

FICHIER = "carte_suivi"
NIVEAUX = ("conforme", "a_verifier", "alerte")


class Carte(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ais_age_max_heures: float = Field(..., gt=0, le=24 * 30)
    positions_age_perimee_minutes: int = Field(..., ge=1)
    libelles_regularite: dict[str, str]

    def libelle(self, niveau: str) -> str:
        return self.libelles_regularite.get(niveau, niveau)


class AlerteSimple(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actif: bool
    gravite: NiveauGravite


class AlerteExtinction(AlerteSimple):
    silence_minutes: int = Field(..., ge=1)
    vitesse_min_noeuds: float = Field(..., ge=0)
    max_alertes_par_evaluation: int = Field(..., ge=1)


class AlertesAis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    navire_peche_non_enregistre: AlerteSimple
    presence_zone_interdite: AlerteSimple
    extinction_signal: AlerteExtinction


def regle_carte() -> tuple[Carte, AlertesAis, dict[str, Any]]:
    contenu = charger_regles(FICHIER)
    try:
        carte = Carte.model_validate(contenu.get("carte"))
        alertes = AlertesAis.model_validate(contenu.get("alertes_ais"))
        if set(carte.libelles_regularite) != set(NIVEAUX):
            raise ValueError("libellés de régularité incomplets")
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
    except ValueError as exc:
        from app.core.regles import regle_indisponible

        raise regle_indisponible(FICHIER) from exc
    return carte, alertes, entete_regle(contenu)


def age_libelle(secondes: int) -> str:
    """Âge en clair : « à l'instant », « il y a 12 min », « il y a 3 h », « il y a 2 j »."""
    if secondes < 60:
        return "à l'instant"
    if secondes < 3600:
        return f"il y a {secondes // 60} min"
    if secondes < 48 * 3600:
        return f"il y a {secondes // 3600} h"
    return f"il y a {secondes // 86400} j"
