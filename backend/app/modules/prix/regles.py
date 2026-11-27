"""Lecture typée du paramétrage des prix (`prix_marche.json`, lot 6).

Statut « Proposé ». Aucun paramètre n'a de valeur de repli dans le code.
"""

from __future__ import annotations

from typing import Any

from fastapi import status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.errors import ApiError
from app.core.regles import charger_regles, entete_regle, regle_indisponible, regle_invalide

FICHIER = "prix_marche"


class SaisiePrix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prix_facultatif: bool
    prix_max_fcfa_kg: int = Field(..., ge=1)
    unite: str


class DiffusionPrix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    anonymat_min_declarations: int = Field(..., ge=1)
    anonymat_min_pecheurs: int = Field(..., ge=1)


class CarnetPrix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fuseau: str


class ReglesPrix(BaseModel):
    saisie: SaisiePrix
    diffusion: DiffusionPrix
    carnet: CarnetPrix
    entete: dict[str, Any]


def regles_prix() -> ReglesPrix:
    contenu = charger_regles(FICHIER)
    try:
        saisie = SaisiePrix.model_validate(contenu.get("saisie"))
        diffusion = DiffusionPrix.model_validate(contenu.get("diffusion"))
        carnet = CarnetPrix.model_validate(contenu.get("carnet"))
        if saisie.unite != "kg":
            raise ValueError("unité de prix autre que le kilo")
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
    except ValueError as exc:
        raise regle_indisponible(FICHIER) from exc
    return ReglesPrix(
        saisie=saisie,
        diffusion=diffusion,
        carnet=carnet,
        entete=entete_regle(contenu),
    )


def valider_prix_fcfa_kg(valeur: int | None) -> int | None:
    """None si non saisi ; sinon entier dans les bornes du paramétrage."""
    if valeur is None:
        regles = regles_prix()
        if not regles.saisie.prix_facultatif:
            raise ApiError(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Indiquez le prix de vente au kilo, en francs CFA.",
                "PRIX_REQUIS",
            )
        return None
    if valeur < 1:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Le prix de vente au kilo doit être un entier positif, en francs CFA.",
            "PRIX_INVALIDE",
        )
    plafond = regles_prix().saisie.prix_max_fcfa_kg
    if valeur > plafond:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Le prix de vente au kilo ne peut pas dépasser {plafond} FCFA.",
            "PRIX_TROP_ELEVE",
        )
    return valeur
