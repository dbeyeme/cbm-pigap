"""Lecture typée des paramètres de la page de profil (fichier `profil_acteur.json`).

Visibilité et tarifs : décidés par le porteur le 2026-11-24. Espèces tirées des
captures, vitrine publique, espèces protégées : Proposé (valideurs : Christian,
DGPA). Aucun paramètre n'a de valeur de repli dans le code.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.regles import charger_regles, entete_regle, regle_invalide

FICHIER = "profil_acteur"


class RegleProfil(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Fenêtre des captures d'où viennent les espèces affichées, et leur nombre maximal
    especes_periode_jours: int = Field(..., ge=1, le=36600)
    especes_max: int = Field(..., ge=1, le=100)
    presentation_max_caracteres: int = Field(..., ge=1, le=5000)
    # Coordonnées refusées dans le texte de présentation (Proposé) : adresse électronique,
    # adresse de site, et suite de chiffres plus longue que le seuil
    presentation_sans_coordonnees: bool
    presentation_chiffres_max: int = Field(..., ge=1, le=50)
    tarifs_max: int = Field(..., ge=1, le=200)
    prix_max_fcfa: int = Field(..., ge=1)
    # Au kilo ou à l'unité (décision du porteur)
    unites_tarif: list[str] = Field(..., min_length=1)

    @field_validator("unites_tarif")
    @classmethod
    def unites_sans_casse(cls, value: list[str]) -> list[str]:
        """« Kg » et « kg » désignent la même unité : la casse du fichier ne compte pas."""
        unites = [unite.strip().lower() for unite in value]
        if any(not unite for unite in unites) or len(set(unites)) != len(unites):
            raise ValueError("unités vides ou en double")
        return unites


def regle_profil() -> tuple[RegleProfil, dict[str, Any]]:
    contenu = charger_regles(FICHIER)
    try:
        regle = RegleProfil.model_validate(contenu.get("profil"))
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
    return regle, entete_regle(contenu)
