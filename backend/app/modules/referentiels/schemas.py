"""Contrats API — référentiels métier."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class EspeceRead(BaseModel):
    code: str
    nom: str
    groupe: str
    nom_scientifique: str | None = None
    taux_taxe_fcfa_kg: float | None = None
    bareme: str | None = None
    prix_moyen_fcfa_kg: float | None = None
    production_2024_t: float | None = None
    part_2024_pct: float | None = None
    alias: list[str] = []
    protegee: bool = False


class ItemRead(BaseModel):
    code: str
    nom: str
    extra: dict[str, Any] = {}


class BaremeAutorisationRead(BaseModel):
    code: str
    nom: str
    montant_fcfa: int


class BaremeTaxeRead(BaseModel):
    code: str
    espece: str | None = None
    groupe: str | None = None
    taux: float
    approximatif: bool = False


class BaremesRead(BaseModel):
    note: str | None = None
    reference_texte: str | None = None
    validite_debut: str | None = None
    validite_fin: str | None = None
    autorisation_annuelle: list[BaremeAutorisationRead]
    carte_pecheur_annuelle_fcfa: int | None = None
    taxe_production_fcfa_kg: list[BaremeTaxeRead]


class ReferentielsRead(BaseModel):
    version: str | None = None
    source: str | None = None
    a_valider_dgpa: bool = True
    groupes_especes: list[ItemRead]
    especes: list[EspeceRead]
    especes_protegees: list[ItemRead]
    engins: list[ItemRead]
    engins_generiques: list[str]
    types_pirogue: list[ItemRead]
    materiaux: list[ItemRead]
    filieres: list[ItemRead]
    strates: list[ItemRead]
    sites_debarquement: list[ItemRead]
    nationalites: list[ItemRead]
    categories_infraction: list[ItemRead]
    baremes: BaremesRead
    reperes_2024_grand_libreville: dict[str, Any] = {}
