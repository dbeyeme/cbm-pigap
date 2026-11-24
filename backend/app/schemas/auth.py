"""Contrats auth / utilisateurs (transversal §4 Utilisateur, §6 / §7)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.db.enums import RoleUtilisateur
from app.schemas.common import OrmModel


class UtilisateurCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=255)
    role: RoleUtilisateur
    telephone: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    mot_de_passe: str = Field(..., min_length=8, max_length=128)


class UtilisateurRead(OrmModel):
    id: UUID
    nom: str
    role: RoleUtilisateur
    telephone: str | None
    email: str | None
    organisation_id: UUID | None = None
    date_creation: datetime


class TelephoneUpdate(BaseModel):
    """Nouveau numéro Mobile Money du compte connecté (format gabonais)."""

    telephone: str = Field(..., min_length=8, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr | None = None
    telephone: str | None = None
    mot_de_passe: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # ADR-012 : vrai quand le serveur a rattaché ou reconnu l'appareil de ce compte
    # pêcheur à cette connexion ; l'application aligne alors sa garde locale (par
    # exemple après une libération faite par un agent). Faux sans en-tête d'appareil
    # et pour les autres rôles.
    appareil_rattache: bool = False
