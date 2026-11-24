"""Contrats API M1 — pêcheurs, embarcations, organisations (§5.1 / ADR-003)."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.texte import texte_simple
from app.db.enums import StatutPecheur
from app.schemas.common import OrmModel


class OrganisationCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=255)
    nom_commercial: str | None = Field(None, max_length=255)
    type_organisation: str | None = Field(None, max_length=64)
    forme_juridique: str | None = Field(None, max_length=128)
    numero_registre: str | None = Field(None, max_length=128)
    numero_fiscal: str | None = Field(None, max_length=128)
    email: EmailStr | None = None
    telephone: str | None = Field(None, max_length=32)
    telephone_secondaire: str | None = Field(None, max_length=32)
    site_web: str | None = Field(None, max_length=512)
    adresse_ligne1: str | None = Field(None, max_length=255)
    adresse_ligne2: str | None = Field(None, max_length=255)
    ville: str | None = Field(None, max_length=128)
    province_region: str | None = Field(None, max_length=128)
    code_postal: str | None = Field(None, max_length=32)
    pays: str = Field(default="GA", min_length=2, max_length=2)
    zone_activite: str | None = Field(None, max_length=255)
    attributs: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    actif: bool = True


class OrganisationUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=255)
    nom_commercial: str | None = None
    type_organisation: str | None = None
    forme_juridique: str | None = None
    numero_registre: str | None = None
    numero_fiscal: str | None = None
    email: EmailStr | None = None
    telephone: str | None = None
    telephone_secondaire: str | None = None
    site_web: str | None = None
    adresse_ligne1: str | None = None
    adresse_ligne2: str | None = None
    ville: str | None = None
    province_region: str | None = None
    code_postal: str | None = None
    pays: str | None = Field(None, min_length=2, max_length=2)
    zone_activite: str | None = None
    attributs: dict[str, Any] | None = None
    notes: str | None = None
    actif: bool | None = None


class OrganisationRead(OrmModel):
    id: UUID
    nom: str
    nom_commercial: str | None
    type_organisation: str | None
    forme_juridique: str | None
    numero_registre: str | None
    numero_fiscal: str | None
    email: str | None
    telephone: str | None
    telephone_secondaire: str | None
    site_web: str | None
    adresse_ligne1: str | None
    adresse_ligne2: str | None
    ville: str | None
    province_region: str | None
    code_postal: str | None
    pays: str
    zone_activite: str | None
    attributs: dict[str, Any]
    notes: str | None
    actif: bool
    date_creation: datetime
    date_mise_a_jour: datetime


class PecheurCreate(BaseModel):
    """Création pêcheur avec compte utilisateur associé (flux agent)."""

    nom: str = Field(..., min_length=1, max_length=255)
    prenom: str = Field(..., min_length=1, max_length=255)
    # None = attribution automatique (voir app.core.numerotation)
    numero_licence: str | None = Field(None, min_length=1, max_length=64)
    date_delivrance_licence: date | None = None
    nationalite: str | None = Field(None, max_length=64)
    statut: StatutPecheur = StatutPecheur.actif
    organisation_id: UUID | None = None
    telephone: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    mot_de_passe: str = Field(..., min_length=8, max_length=128)

    @field_validator("numero_licence")
    @classmethod
    def licence_non_vide(cls, value: str | None) -> str | None:
        if value is None:
            return None  # attribution automatique
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "Numéro de licence vide : omettez le champ pour une attribution automatique"
            )
        return cleaned


class PecheurUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=255)
    prenom: str | None = Field(None, min_length=1, max_length=255)
    numero_licence: str | None = Field(None, min_length=1, max_length=64)
    date_delivrance_licence: date | None = None
    nationalite: str | None = Field(None, max_length=64)
    statut: StatutPecheur | None = None
    organisation_id: UUID | None = None


class PecheurRead(OrmModel):
    id: UUID
    utilisateur_id: UUID
    nom: str
    prenom: str
    numero_licence: str
    date_delivrance_licence: date | None
    nationalite: str | None = None
    statut: StatutPecheur
    organisation_id: UUID | None


_SEPARATEURS = re.compile(r"[\s.\-]")
_INDICATIF = re.compile(r"^[A-Z0-9]{3,10}$")


def _texte_ou_rien(value: object) -> object:
    """Une saisie vide vaut « non renseigné »."""
    if isinstance(value, str):
        return value.strip() or None
    return value


class ComplementsEmbarcation(BaseModel):
    """Informations d'inscription complémentaires d'une embarcation, toutes facultatives.

    Statut : Proposé (valideurs : Christian, DGPA). Seul le format des identifiants
    est contrôlé (neuf chiffres pour le MMSI, sept pour le numéro OMI) ; aucune de
    ces informations n'est exigée, quelle que soit la catégorie de l'embarcation.
    """

    mmsi: str | None = Field(None, description="Identité du service mobile maritime : 9 chiffres")
    numero_omi: str | None = Field(None, description="Numéro OMI du navire : 7 chiffres")
    indicatif_radio: str | None = Field(None, description="Indicatif d'appel radio")
    jauge_brute: float | None = Field(None, gt=0, le=500_000, description="Jauge brute")
    annee_construction: int | None = Field(None, ge=1900, le=2100)
    proprietaire: str | None = Field(
        None, max_length=255, description="Propriétaire, s'il diffère du titulaire de la licence"
    )
    exploitant: str | None = Field(
        None, max_length=255, description="Exploitant, s'il diffère du propriétaire"
    )

    @field_validator("mmsi", mode="before")
    @classmethod
    def mmsi_neuf_chiffres(cls, value: object) -> object:
        if value is None or value == "":
            return None
        chiffres = _SEPARATEURS.sub("", str(value))
        if not (chiffres.isascii() and chiffres.isdigit() and len(chiffres) == 9):
            raise ValueError("le MMSI compte 9 chiffres")
        return chiffres

    @field_validator("numero_omi", mode="before")
    @classmethod
    def omi_sept_chiffres(cls, value: object) -> object:
        if value is None or value == "":
            return None
        brut = _SEPARATEURS.sub("", str(value)).upper()
        for prefixe in ("IMO", "OMI"):
            if brut.startswith(prefixe):
                brut = brut[len(prefixe) :]
        if not (brut.isascii() and brut.isdigit() and len(brut) == 7):
            raise ValueError("le numéro OMI compte 7 chiffres")
        return brut

    @field_validator("indicatif_radio", mode="before")
    @classmethod
    def indicatif_lisible(cls, value: object) -> object:
        if value is None or value == "":
            return None
        indicatif = _SEPARATEURS.sub("", str(value)).upper()
        if not _INDICATIF.fullmatch(indicatif):
            raise ValueError("l'indicatif radio compte 3 à 10 lettres ou chiffres")
        return indicatif

    @field_validator("annee_construction")
    @classmethod
    def annee_passee(cls, value: int | None) -> int | None:
        if value is not None and value > datetime.now(UTC).year:
            raise ValueError("l'année de construction ne peut pas dépasser l'année en cours")
        return value

    @field_validator("proprietaire", "exploitant", mode="before")
    @classmethod
    def nom_ou_rien(cls, value: object) -> object:
        value = _texte_ou_rien(value)
        # Texte libre affiché sur la fiche d'identité : une seule ligne, sans caractère invisible
        return texte_simple(value) if isinstance(value, str) else value


class EmbarcationCreate(ComplementsEmbarcation):
    pecheur_id: UUID
    nom: str = Field(..., min_length=1, max_length=255)
    immatriculation: str = Field(..., min_length=1, max_length=64)
    type: str | None = Field(None, max_length=64)
    longueur: float | None = Field(None, gt=0)
    equipements: dict[str, Any] | None = None
    # Registre de la flotte (référentiels)
    filiere: str | None = Field(None, max_length=32)
    type_pirogue: str | None = Field(None, max_length=64)
    materiau: str | None = Field(None, max_length=32)
    puissance_moteur_cv: float | None = Field(None, ge=0, le=2000)
    site_attache: str | None = Field(None, max_length=128)
    strate: str | None = Field(None, max_length=64)
    balise_id: str | None = Field(
        None, max_length=64, description="Identifiant de la balise satellitaire (ADR-009)"
    )


class EmbarcationUpdate(ComplementsEmbarcation):
    nom: str | None = Field(None, min_length=1, max_length=255)
    immatriculation: str | None = Field(None, min_length=1, max_length=64)
    type: str | None = None
    longueur: float | None = Field(None, gt=0)
    equipements: dict[str, Any] | None = None
    # Registre de la flotte (référentiels)
    filiere: str | None = Field(None, max_length=32)
    type_pirogue: str | None = Field(None, max_length=64)
    materiau: str | None = Field(None, max_length=32)
    puissance_moteur_cv: float | None = Field(None, ge=0, le=2000)
    site_attache: str | None = Field(None, max_length=128)
    strate: str | None = Field(None, max_length=64)
    balise_id: str | None = Field(None, max_length=64)


class EmbarcationRead(OrmModel):
    id: UUID
    pecheur_id: UUID
    nom: str
    immatriculation: str
    type: str | None
    longueur: float | None
    equipements: dict[str, Any] | None
    filiere: str | None = None
    type_pirogue: str | None = None
    materiau: str | None = None
    puissance_moteur_cv: float | None = None
    site_attache: str | None = None
    strate: str | None = None
    balise_id: str | None = None
    # Informations d'inscription complémentaires (facultatives, statut Proposé)
    mmsi: str | None = None
    numero_omi: str | None = None
    indicatif_radio: str | None = None
    jauge_brute: float | None = None
    annee_construction: int | None = None
    proprietaire: str | None = None
    exploitant: str | None = None
