"""Contrats API : page de profil d'un acteur (lot 2).

Trois vues d'une même page : publique (aucun champ ne porte de coordonnée
personnelle), connectée (pour tout compte de la plateforme), et celle de
l'acteur lui-même, qui porte en plus ses réglages.

Le texte de présentation est du texte brut : l'interface l'affiche tel quel,
jamais comme du code de page.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.texte import texte_simple


class EspeceProfil(BaseModel):
    espece: str = Field(..., description="Code du référentiel")
    nom: str


class Tarif(BaseModel):
    """Tarif saisi par l'acteur, en francs CFA entiers."""

    espece: str = Field(..., min_length=1, max_length=128, description="Code du référentiel")
    unite: str = Field(..., min_length=1, max_length=16, description="kg ou unite")
    prix_fcfa: int = Field(..., gt=0)


class TarifRead(Tarif):
    nom: str = Field(..., description="Nom de l'espèce")


class ProfilPublicRead(BaseModel):
    """Vitrine publique : aucune coordonnée personnelle, aucun identifiant."""

    genre: Literal["pecheur", "organisation"]
    nom: str
    localite: str | None = None
    presentation: str | None = None
    especes: list[EspeceProfil]
    tarifs_affiches: bool = Field(..., description="L'acteur a choisi d'afficher ses tarifs")
    tarifs: list[TarifRead] = Field(..., description="Vide tant que l'acteur ne les affiche pas")
    mise_a_jour: datetime | None = None


class ProfilRead(ProfilPublicRead):
    """Page vue par un compte connecté."""

    acteur_id: UUID
    organisation: str | None = Field(None, description="Organisation du pêcheur, s'il en a une")
    nb_embarcations: int = 0


class LimitesProfil(BaseModel):
    presentation_max_caracteres: int
    tarifs_max: int
    prix_max_fcfa: int
    unites_tarif: list[str]


class MonProfilRead(ProfilRead):
    """Page vue par l'acteur lui-même, avec ses réglages."""

    especes_declarees: list[EspeceProfil] = Field(
        ..., description="Espèces tirées de ses captures déclarées, avant masquage"
    )
    especes_masquees: list[str]
    tarifs_visibles: bool
    mes_tarifs: list[TarifRead] = Field(..., description="Tarifs saisis, affichés ou non")
    ouvert_au_public: bool
    lien_public: str | None = Field(None, description="Lien à partager, quand la page est ouverte")
    limites: LimitesProfil
    statut_regles: str = Field(..., description="Statut du paramétrage : Proposé ou Validé")


class MonProfilUpdate(BaseModel):
    """Modification partielle : seuls les champs envoyés changent."""

    presentation: str | None = Field(None, max_length=5000)
    especes_masquees: list[str] | None = Field(None, max_length=200)
    tarifs: list[Tarif] | None = Field(None, max_length=200)
    tarifs_visibles: bool | None = None
    ouvert_au_public: bool | None = None

    @field_validator("presentation")
    @classmethod
    def presentation_en_texte_simple(cls, value: str | None) -> str | None:
        """Texte brut de plusieurs lignes : ni caractère invisible, ni marque de direction."""
        return texte_simple(value, lignes=True) if value is not None else None
