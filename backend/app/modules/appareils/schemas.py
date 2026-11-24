"""Contrats API : appareils rattachés à un compte pêcheur (ADR-012)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AppareilRead(BaseModel):
    id: UUID
    empreinte_abregee: str = Field(
        ..., description="Début de l'empreinte ; l'identifiant de l'appareil n'est jamais conservé"
    )
    origine: str | None = Field(None, description="android (appareil) ou install (installation)")
    etat: str = Field(..., description="actif ou libere")
    premiere_utilisation: datetime
    derniere_utilisation: datetime
    libere_le: datetime | None = None
    libere_par_id: UUID | None = None
    libere_par: str | None = Field(None, description="Nom de l'agent qui a libéré l'appareil")
    motif_liberation: str | None = None


class AppareilsPecheurRead(BaseModel):
    pecheur_id: UUID
    appareils_autorises: int
    appareils_actifs: int
    appareils: list[AppareilRead]


class MotifAppareil(BaseModel):
    """Motif obligatoire d'une libération ou d'une autorisation, conservé avec son auteur."""

    motif: str = Field(..., min_length=5, max_length=500)

    @field_validator("motif")
    @classmethod
    def motif_reel(cls, value: str) -> str:
        texte = value.strip()
        if len(texte) < 5:
            raise ValueError("indiquez le motif en quelques mots")
        return texte
