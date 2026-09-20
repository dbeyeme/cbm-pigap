"""Schémas demandes de licence (FO public + BO)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.db.enums import StatutDemandeLicence, TypeDemandeLicence
from app.schemas.common import OrmModel


class DemandeLicenceCreate(BaseModel):
    type_demande: TypeDemandeLicence = TypeDemandeLicence.personne_physique
    # Physique
    nom: str | None = Field(None, max_length=255)
    prenom: str | None = Field(None, max_length=255)
    telephone: str | None = Field(None, max_length=32)
    email: EmailStr | None = None
    # Morale
    org_nom: str | None = Field(None, max_length=255)
    org_type: str | None = Field(None, max_length=64)
    numero_registre: str | None = Field(None, max_length=128)
    org_email: EmailStr | None = None
    org_telephone: str | None = Field(None, max_length=32)
    org_ville: str | None = Field(None, max_length=128)
    org_adresse: str | None = Field(None, max_length=255)
    # Commun
    zone_activite: str | None = Field(None, max_length=255)
    embarcation_nom: str | None = Field(None, max_length=255)
    embarcation_immatriculation: str | None = Field(None, max_length=64)
    embarcation_type: str | None = Field(None, max_length=64)
    message: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def validate_by_type(self) -> DemandeLicenceCreate:
        if self.type_demande == TypeDemandeLicence.personne_physique:
            if not (self.nom and self.nom.strip()):
                raise ValueError("Le nom est obligatoire")
            if not (self.prenom and self.prenom.strip()):
                raise ValueError("Le prénom est obligatoire")
            if not self.telephone and not self.email:
                raise ValueError("Indiquez un téléphone ou un e-mail")
        else:
            if not (self.org_nom and self.org_nom.strip()):
                raise ValueError("Le nom de l'organisation est obligatoire")
            if not self.org_telephone and not self.org_email:
                raise ValueError("Indiquez un téléphone ou un e-mail de l'organisation")
        return self


class DemandeLicenceUpdate(BaseModel):
    """Correction BO avant traitement."""

    nom: str | None = None
    prenom: str | None = None
    telephone: str | None = None
    email: EmailStr | None = None
    org_nom: str | None = None
    org_type: str | None = None
    numero_registre: str | None = None
    org_email: EmailStr | None = None
    org_telephone: str | None = None
    org_ville: str | None = None
    org_adresse: str | None = None
    zone_activite: str | None = None
    embarcation_nom: str | None = None
    embarcation_immatriculation: str | None = None
    embarcation_type: str | None = None
    message: str | None = None


class DemandeLicenceApprove(BaseModel):
    """Approbation définitive : les identifiants sont attribués automatiquement.

    `numero_licence` / `immatriculation` restent acceptés pour reprendre un
    numéro déjà délivré sur support papier (migration de l'existant).
    """

    numero_licence: str | None = Field(None, max_length=64)
    immatriculation: str | None = Field(None, max_length=64)
    mot_de_passe: str = Field(..., min_length=8, max_length=128)
    creer_embarcation: bool = True

    @field_validator("numero_licence", "immatriculation", mode="before")
    @classmethod
    def blank_means_auto(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


class DemandeLicenceRefuse(BaseModel):
    motif_refus: str = Field(..., min_length=3, max_length=2000)


class PieceJointeRead(BaseModel):
    id: str
    type_piece: str
    nom_original: str
    content_type: str
    taille: int


class DemandeLicenceRead(OrmModel):
    id: UUID
    type_demande: TypeDemandeLicence
    statut: StatutDemandeLicence
    nom: str | None
    prenom: str | None
    telephone: str | None
    email: str | None
    org_nom: str | None
    org_type: str | None
    numero_registre: str | None
    org_email: str | None
    org_telephone: str | None
    org_ville: str | None
    org_adresse: str | None
    zone_activite: str | None
    embarcation_nom: str | None
    embarcation_immatriculation: str | None
    embarcation_type: str | None
    message: str | None
    pieces_jointes: list[PieceJointeRead] = Field(default_factory=list)
    motif_refus: str | None
    pecheur_id: UUID | None
    organisation_id: UUID | None
    traite_par_id: UUID | None
    date_creation: datetime
    date_traitement: datetime | None
    numero_licence_attribue: str | None = None
    immatriculation_attribuee: str | None = None

    @field_validator("pieces_jointes", mode="before")
    @classmethod
    def strip_piece_paths(cls, value: object) -> list:
        """Ne jamais exposer le chemin disque au client."""
        if not value:
            return []
        out: list[dict] = []
        for p in value:  # type: ignore[union-attr]
            if not isinstance(p, dict):
                continue
            out.append(
                {
                    "id": p.get("id"),
                    "type_piece": p.get("type_piece"),
                    "nom_original": p.get("nom_original"),
                    "content_type": p.get("content_type"),
                    "taille": p.get("taille"),
                }
            )
        return out
