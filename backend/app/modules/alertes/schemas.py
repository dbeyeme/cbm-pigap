"""Contrats API M7, alertes (§5.7), et traitement des alertes (lot 9)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.texte import texte_simple
from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte
from app.schemas.common import OrmModel


class AlerteCreate(BaseModel):
    """Création manuelle rare ; la plupart sont générées par règles."""

    type: TypeAlerte
    niveau_gravite: NiveauGravite
    embarcation_id: UUID | None = None
    declencheur: dict[str, Any] = Field(..., min_length=1)
    horodatage: datetime | None = None
    statut: StatutAlerte = StatutAlerte.nouvelle


def _commentaire(value: str | None) -> str | None:
    return texte_simple(value, lignes=True) if value is not None else None


class AlerteUpdateStatut(BaseModel):
    """Ancien point d'accès : statut historique ; le commentaire y est facultatif."""

    statut: StatutAlerte
    commentaire: str | None = Field(None, max_length=20000)

    _texte = field_validator("commentaire")(_commentaire)


class AlerteTraitement(BaseModel):
    """Changement d'état de traitement (lot 9) : commentaire obligatoire."""

    etat: str = Field(..., min_length=1, max_length=32)
    commentaire: str = Field(..., max_length=20000)

    _texte = field_validator("commentaire")(_commentaire)


class DonneeAlerte(BaseModel):
    libelle: str
    valeur: str


class RegleAlerteRead(BaseModel):
    code: str | None = None
    libelle: str


class EmbarcationAlerteRead(BaseModel):
    id: UUID
    nom: str
    immatriculation: str


class DescriptionAlerte(BaseModel):
    """Ce qui s'est passé, quand, où, au titre de quelle règle et avec quelles données."""

    titre: str
    resume: str
    quand: str | None = Field(None, description="Date et heure locales, en clair")
    ou: str | None = Field(None, description="Zone, secteur ou coordonnées, en clair")
    regle: RegleAlerteRead
    embarcation: EmbarcationAlerteRead | None = None
    donnees: list[DonneeAlerte]


class AlerteRead(OrmModel):
    id: UUID
    type: TypeAlerte
    niveau_gravite: NiveauGravite
    embarcation_id: UUID | None
    declencheur: dict[str, Any]
    horodatage: datetime
    statut: StatutAlerte
    # Lot 9 ; facultatifs pour les autres modules qui relisent une alerte telle quelle
    etat_traitement: str | None = None
    etat_libelle: str | None = None
    ouverte: bool | None = None
    description: DescriptionAlerte | None = None


class EtatPossible(BaseModel):
    code: str
    libelle: str


class JournalRead(BaseModel):
    id: UUID
    horodatage: datetime
    etat_avant: str
    etat_avant_libelle: str
    etat_apres: str
    etat_apres_libelle: str
    commentaire: str
    auteur_nom: str
    auteur_role: str
    origine: str = Field(..., description="traitement ou ancien_ecran")


class AlerteDetailRead(AlerteRead):
    journal: list[JournalRead]
    transitions_possibles: list[EtatPossible]


class EtatRead(EtatPossible):
    ouvert: bool
    statut_historique: StatutAlerte
    transitions: list[EtatPossible]


class EtatsRead(BaseModel):
    etats: list[EtatRead]
    etat_initial: str
    commentaire_min_caracteres: int
    commentaire_max_caracteres: int
    statut_regles: str


class AlerteFilter(BaseModel):
    type: TypeAlerte | None = None
    statut: StatutAlerte | None = None
    embarcation_id: UUID | None = None
