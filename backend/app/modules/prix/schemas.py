"""Contrats API du lot 6 : courbes de prix et carnet des déclarations."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

GrainPrix = Literal["jour", "semaine", "mois"]


class PointCourbePrix(BaseModel):
    periode: str
    espece: str | None = Field(None, description="Absent = toutes espèces, moyenne pondérée")
    prix_moyen_fcfa_kg: float | None = None
    masque: bool = Field(
        False,
        description="Vrai si les seuils d'anonymat ne sont pas atteints",
    )
    nb_declarations: int
    nb_pecheurs: int
    volume_kg: float
    prix_reference_2024_fcfa_kg: float | None = None


class CourbesPrixRead(BaseModel):
    grain: GrainPrix
    periode_debut: datetime | None = None
    periode_fin: datetime | None = None
    points: list[PointCourbePrix]
    anonymat_min_declarations: int
    anonymat_min_pecheurs: int
    statut_regles: str
    genere_a: datetime


class LigneCarnet(BaseModel):
    id: UUID
    espece: str
    espece_nom: str
    quantite_kg: float
    prix_fcfa_kg: int | None
    valeur_fcfa: float | None = Field(
        None, description="Quantité × prix saisi, ou estimation 2024 si le prix manque"
    )
    source_valeur: Literal["declare", "reference_2024", "indisponible"]


class JourneeCarnet(BaseModel):
    jour: date
    embarcation_id: UUID
    embarcation_nom: str
    immatriculation: str
    volume_kg: float
    valeur_declaree_fcfa: float
    valeur_estimee_fcfa: float
    rendement_kg: float = Field(..., description="Volume déclaré ce jour pour cette embarcation")
    charges_fcfa: float | None = Field(
        None, description="Non calculé : formule de rentabilité non validée"
    )
    lignes: list[LigneCarnet]


class CarnetRead(BaseModel):
    pecheur_id: UUID
    pecheur_nom: str
    jours: list[JourneeCarnet]
    volume_kg: float
    valeur_declaree_fcfa: float
    valeur_estimee_fcfa: float
    note_rentabilite: str
    statut_regles: str
    genere_a: datetime
