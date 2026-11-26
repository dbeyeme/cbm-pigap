"""Lecture typée des paramètres de l'essai (fichier `gfw_source.json`).

Aucune valeur de repli dans le code : zone interrogée, jeux de données, retards
de publication, mention d'attribution, bornes de période, cache et budget
viennent tous du fichier versionné. Seuls l'interrupteur et le jeton sont dans
l'environnement (`GFW_ENABLED`, `GFW_API_TOKEN`).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.regles import charger_regles, entete_regle, regle_invalide

FICHIER = "gfw_source"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ZoneSource(_Strict):
    identifiant: int
    jeu: str = Field(..., min_length=1)
    nom: str = Field(..., min_length=1)


class JeuxSource(_Strict):
    peche_apparente: str = Field(..., min_length=1)
    detections_radar: str = Field(..., min_length=1)
    identite_navires: str = Field(..., min_length=1)
    evenements_peche: str = Field(..., min_length=1)


class RetardsSource(_Strict):
    peche_apparente: int = Field(..., ge=0, le=24 * 60)
    detections_radar: int = Field(..., ge=0, le=24 * 60)


class AttributionSource(_Strict):
    mention: str = Field(..., min_length=1)
    lien: str = Field(..., min_length=1)


class ParametresGfw(_Strict):
    zone: ZoneSource
    jeux: JeuxSource
    retard_publication_heures: RetardsSource
    attribution: AttributionSource
    periode_defaut_jours: int = Field(..., ge=1, le=3660)
    periode_max_jours: int = Field(..., ge=1, le=3660)
    cache_heures: float = Field(..., gt=0, le=24 * 31)
    budget_requetes_jour: int = Field(..., ge=1, le=50_000)
    delai_reponse_secondes: float = Field(..., gt=0, le=600)


def parametres_gfw() -> ParametresGfw:
    contenu = charger_regles(FICHIER)
    try:
        return ParametresGfw.model_validate(contenu.get("source"))
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc


def entete_parametres() -> dict[str, Any]:
    return entete_regle(charger_regles(FICHIER))
