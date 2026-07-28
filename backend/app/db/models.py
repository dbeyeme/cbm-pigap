"""Modèles SQLAlchemy — entités §4 (+ Organisation minimale, LogAcces §7)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import (
    NiveauGravite,
    RoleUtilisateur,
    SourcePosition,
    StatutAlerte,
    StatutPecheur,
    TypeAlerte,
    TypeZone,
)


class Organisation(Base):
    """Organisation / société — colonnes stables + attributs JSONB (ADR-003)."""

    __tablename__ = "organisations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Identité
    nom: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    nom_commercial: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type_organisation: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="cooperative|societe|association|autre"
    )
    forme_juridique: Mapped[str | None] = mapped_column(String(128), nullable=True)
    numero_registre: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    numero_fiscal: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Contact
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telephone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    telephone_secondaire: Mapped[str | None] = mapped_column(String(32), nullable=True)
    site_web: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Adresse
    adresse_ligne1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    adresse_ligne2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ville: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    province_region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    code_postal: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pays: Mapped[str] = mapped_column(String(2), nullable=False, default="GA")
    # Activité
    zone_activite: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Extensibilité sans nouvelle migration (ADR-003)
    attributs: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cycle de vie
    actif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    date_mise_a_jour: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    pecheurs: Mapped[list[Pecheur]] = relationship(back_populates="organisation")


class Utilisateur(Base):
    __tablename__ = "utilisateurs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleUtilisateur] = mapped_column(
        Enum(RoleUtilisateur, name="role_utilisateur", native_enum=True),
        nullable=False,
    )
    telephone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    mot_de_passe_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    pecheur: Mapped[Pecheur | None] = relationship(back_populates="utilisateur", uselist=False)


class Pecheur(Base):
    __tablename__ = "pecheurs"
    __table_args__ = (UniqueConstraint("numero_licence", name="uq_pecheurs_numero_licence"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    prenom: Mapped[str] = mapped_column(String(255), nullable=False)
    numero_licence: Mapped[str] = mapped_column(String(64), nullable=False)
    date_delivrance_licence: Mapped[date | None] = mapped_column(Date, nullable=True)
    statut: Mapped[StatutPecheur] = mapped_column(
        Enum(StatutPecheur, name="statut_pecheur", native_enum=True),
        nullable=False,
        default=StatutPecheur.actif,
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True
    )

    utilisateur: Mapped[Utilisateur] = relationship(back_populates="pecheur")
    organisation: Mapped[Organisation | None] = relationship(back_populates="pecheurs")
    embarcations: Mapped[list[Embarcation]] = relationship(back_populates="pecheur")
    captures: Mapped[list[Capture]] = relationship(back_populates="pecheur")


class Embarcation(Base):
    __tablename__ = "embarcations"
    __table_args__ = (UniqueConstraint("immatriculation", name="uq_embarcations_immatriculation"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pecheur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pecheurs.id", ondelete="CASCADE"), nullable=False
    )
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    immatriculation: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    longueur: Mapped[float | None] = mapped_column(Float, nullable=True)
    equipements: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    pecheur: Mapped[Pecheur] = relationship(back_populates="embarcations")
    positions: Mapped[list[Position]] = relationship(back_populates="embarcation")
    captures: Mapped[list[Capture]] = relationship(back_populates="embarcation")
    alertes: Mapped[list[Alerte]] = relationship(back_populates="embarcation")


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    embarcation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("embarcations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    horodatage: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    source: Mapped[SourcePosition] = mapped_column(
        Enum(SourcePosition, name="source_position", native_enum=True),
        nullable=False,
        default=SourcePosition.mobile,
    )
    synchronise_a: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    embarcation: Mapped[Embarcation] = relationship(back_populates="positions")


class ZoneReglementee(Base):
    __tablename__ = "zones_reglementees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[TypeZone] = mapped_column(
        Enum(TypeZone, name="type_zone", native_enum=True),
        nullable=False,
    )
    geometrie = mapped_column(Geometry(geometry_type="POLYGON", srid=4326), nullable=False)
    periode_debut: Mapped[date | None] = mapped_column(Date, nullable=True)
    periode_fin: Mapped[date | None] = mapped_column(Date, nullable=True)
    actif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    quotas: Mapped[list[Quota]] = relationship(back_populates="zone")


class Capture(Base):
    __tablename__ = "captures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pecheur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pecheurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    embarcation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("embarcations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    espece: Mapped[str] = mapped_column(String(128), nullable=False)
    quantite_kg: Mapped[float] = mapped_column(Float, nullable=False)
    methode: Mapped[str | None] = mapped_column(String(128), nullable=True)
    position_capture = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    point_debarquement: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_capture: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    synchronise_a: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    pecheur: Mapped[Pecheur] = relationship(back_populates="captures")
    embarcation: Mapped[Embarcation] = relationship(back_populates="captures")


class Quota(Base):
    __tablename__ = "quotas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    espece: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones_reglementees.id", ondelete="SET NULL"), nullable=True
    )
    periode_debut: Mapped[date] = mapped_column(Date, nullable=False)
    periode_fin: Mapped[date] = mapped_column(Date, nullable=False)
    volume_autorise_kg: Mapped[float] = mapped_column(Float, nullable=False)
    # Mis à jour par la logique métier M5 (pas un trigger DB en MVP)
    volume_consomme_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    zone: Mapped[ZoneReglementee | None] = relationship(back_populates="quotas")


class Alerte(Base):
    __tablename__ = "alertes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[TypeAlerte] = mapped_column(
        Enum(TypeAlerte, name="type_alerte", native_enum=True),
        nullable=False,
    )
    niveau_gravite: Mapped[NiveauGravite] = mapped_column(
        Enum(NiveauGravite, name="niveau_gravite", native_enum=True),
        nullable=False,
    )
    embarcation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("embarcations.id", ondelete="SET NULL"), nullable=True
    )
    # Obligatoire §4 — traçabilité « pourquoi cette alerte ? »
    declencheur: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    horodatage: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    statut: Mapped[StatutAlerte] = mapped_column(
        Enum(StatutAlerte, name="statut_alerte", native_enum=True),
        nullable=False,
        default=StatutAlerte.nouvelle,
    )

    embarcation: Mapped[Embarcation | None] = relationship(back_populates="alertes")


class LogAcces(Base):
    """Journal d'accès aux données sensibles — cahier §7."""

    __tablename__ = "logs_acces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    utilisateur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    ressource: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    horodatage: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
