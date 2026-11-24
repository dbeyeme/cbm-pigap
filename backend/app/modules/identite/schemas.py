"""Contrats API : fiche d'identité d'un pêcheur et de ses embarcations (lot 2).

Deux volets : ce que dit le registre d'un côté, ce que les embarcations émettent
de l'autre. Le volet « suivi » ne donne aucune position, seulement la source et
l'âge du dernier relevé, la période observée et le nombre de relevés.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class IdentiteRegistre(BaseModel):
    nom: str
    prenom: str
    nationalite: str | None = None
    statut: str = Field(..., description="actif ou suspendu")


class LicenceRegistre(BaseModel):
    numero: str
    date_delivrance: date | None = None
    date_expiration: date | None = None
    statut: str = Field(..., description="valide, expiree, suspendue ou sans_date")
    validite_jours: int


class OrganisationRegistre(BaseModel):
    id: UUID
    nom: str
    type: str | None = None


class EmbarcationRegistre(BaseModel):
    id: UUID
    nom: str
    immatriculation: str
    type: str | None = None
    longueur_m: float | None = None
    filiere: str | None = None
    type_pirogue: str | None = None
    materiau: str | None = None
    puissance_moteur_cv: float | None = None
    site_attache: str | None = None
    strate: str | None = None
    equipements: dict[str, Any] | None = None
    balise: bool = Field(..., description="Une balise satellitaire est rattachée")
    # Informations d'inscription complémentaires (facultatives, statut Proposé)
    mmsi: str | None = None
    numero_omi: str | None = None
    indicatif_radio: str | None = None
    jauge_brute: float | None = None
    annee_construction: int | None = None
    proprietaire: str | None = None
    exploitant: str | None = None


class VoletRegistre(BaseModel):
    identite: IdentiteRegistre
    licence: LicenceRegistre
    organisation: OrganisationRegistre | None = None
    embarcations: list[EmbarcationRegistre]


class DernierReleve(BaseModel):
    source: str = Field(..., description="mobile ou balise")
    horodatage: datetime
    age_secondes: int


class PeriodeObservee(BaseModel):
    debut: datetime
    fin: datetime


class EmbarcationSuivi(BaseModel):
    embarcation_id: UUID
    nom: str
    immatriculation: str
    dernier_releve: DernierReleve | None = None
    periode_observee: PeriodeObservee | None = None
    nb_releves: int = 0
    releves_par_source: dict[str, int] = Field(default_factory=dict)


class VoletSuivi(BaseModel):
    embarcations: list[EmbarcationSuivi]
    nb_releves: int
    genere_a: datetime


class FicheIdentiteRead(BaseModel):
    pecheur_id: UUID
    registre: VoletRegistre
    suivi: VoletSuivi
