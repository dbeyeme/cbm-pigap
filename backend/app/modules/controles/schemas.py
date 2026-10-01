"""Contrats API — missions de surveillance, contrôles, vérification de licence."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.enums import StatutMission
from app.schemas.common import OrmModel, PointGeoJSON


class MissionCreate(BaseModel):
    type: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="patrouille, inspection_port, controle_conjoint…",
    )
    date_debut: date
    date_fin: date | None = None
    zone_id: UUID | None = None
    zone_libelle: str | None = Field(None, max_length=255)
    responsable_id: UUID | None = None
    description: str | None = Field(None, max_length=2000)


class MissionUpdate(BaseModel):
    statut: StatutMission | None = None
    date_fin: date | None = None
    description: str | None = Field(None, max_length=2000)


class MissionRead(OrmModel):
    id: UUID
    code: str
    type: str
    zone_id: UUID | None
    zone_libelle: str | None
    date_debut: date
    date_fin: date | None
    responsable_id: UUID | None
    description: str | None
    statut: StatutMission
    date_creation: datetime
    nb_controles: int = 0
    nb_infractions: int = 0


class ControleCreate(BaseModel):
    mission_id: UUID | None = None
    embarcation_id: UUID | None = None
    pecheur_id: UUID | None = None
    numero_licence: str | None = Field(None, max_length=64, description="Saisi ou lu par QR code")
    date_controle: datetime | None = None
    position: PointGeoJSON | None = None
    lieu: str | None = Field(None, max_length=255)
    nationalite_proprietaire: str | None = Field(None, max_length=64)
    pecheurs_a_bord: int | None = Field(None, ge=0, le=100)
    engin_declare: str | None = Field(None, max_length=128)
    engin_trouve: str | None = Field(None, max_length=128)
    infraction: bool = False
    categorie_infraction: str | None = Field(None, max_length=128)
    saisies: str | None = Field(None, max_length=2000)
    sanction: str | None = Field(None, max_length=2000)
    observations: str | None = Field(None, max_length=4000)


class ControleRead(OrmModel):
    id: UUID
    mission_id: UUID | None
    embarcation_id: UUID | None
    pecheur_id: UUID | None
    numero_licence_saisi: str | None
    date_controle: datetime
    position: PointGeoJSON | None = None
    lieu: str | None
    nationalite_proprietaire: str | None
    pecheurs_a_bord: int | None
    engin_declare: str | None
    engin_trouve: str | None
    infraction: bool
    categorie_infraction: str | None
    saisies: str | None
    sanction: str | None
    observations: str | None
    licence_valide: bool | None
    agent_id: UUID | None
    date_creation: datetime
    embarcation_nom: str | None = None
    immatriculation: str | None = None
    pecheur_nom: str | None = None
    numero_licence: str | None = None


class EmbarcationVerifRead(BaseModel):
    id: UUID
    nom: str
    immatriculation: str
    type: str | None = None


class VerificationLicenceRead(BaseModel):
    """Vérification complète réservée aux agents (données personnelles)."""

    numero_licence: str
    trouvee: bool
    statut_licence: str
    date_delivrance: date | None = None
    date_expiration: date | None = None
    pecheur_id: UUID | None = None
    pecheur_nom: str | None = None
    nationalite: str | None = None
    organisation: str | None = None
    embarcations: list[EmbarcationVerifRead] = []
    taxes_dues_fcfa: float = 0.0
    alertes_nouvelles: int = 0
    controles_12_mois: int = 0
    infractions_12_mois: int = 0
    engins_autorises: list[str] = []


class VerifPubliqueRead(BaseModel):
    """Vérification publique minimale (QR code) : aucune donnée personnelle."""

    numero: str
    type: str
    valide: bool
    statut: str
    date_expiration: date | None = None
    nb_embarcations: int = 0
    montant_fcfa: int | None = None
