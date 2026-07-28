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
    date_creation: datetime


class LoginRequest(BaseModel):
    email: EmailStr | None = None
    telephone: str | None = None
    mot_de_passe: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
