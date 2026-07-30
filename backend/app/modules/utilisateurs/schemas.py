"""Schémas CRUD staff (agents de contrôle & administrateurs)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.db.enums import RoleUtilisateur
from app.schemas.common import OrmModel

StaffRole = Literal["agent_controle", "admin"]


class StaffCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=255)
    role: StaffRole
    telephone: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    mot_de_passe: str = Field(..., min_length=8, max_length=128)

    @model_validator(mode="after")
    def require_login_identifier(self) -> StaffCreate:
        if not self.email and not self.telephone:
            raise ValueError("email ou telephone requis pour la connexion")
        return self


class StaffUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=255)
    role: StaffRole | None = None
    telephone: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    mot_de_passe: str | None = Field(None, min_length=8, max_length=128)


class StaffRead(OrmModel):
    id: UUID
    nom: str
    role: RoleUtilisateur
    telephone: str | None
    email: str | None
    date_creation: datetime
