"""Modèles SQLAlchemy — entités §4 (+ Organisation minimale, LogAcces §7)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
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
    CanalAbonnement,
    CodeOffreAbonnement,
    EtatAppareil,
    NiveauGravite,
    OperateurMobileMoney,
    PeriodeAbonnement,
    RoleUtilisateur,
    SourcePosition,
    StatutAbonnement,
    StatutAlerte,
    StatutCommande,
    TypePerimetre,
    StatutDemandeLicence,
    StatutMission,
    StatutPaiement,
    StatutPecheur,
    StatutQuittance,
    TaxeStatut,
    TypeAlerte,
    TypeDemandeLicence,
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
    abonnements: Mapped[list[Abonnement]] = relationship(back_populates="organisation")


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
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    pecheur: Mapped[Pecheur | None] = relationship(back_populates="utilisateur", uselist=False)
    organisation_compte: Mapped[Organisation | None] = relationship(
        foreign_keys=[organisation_id],
    )


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
    # Nationalité du propriétaire (barème d'autorisation national / étranger)
    nationalite: Mapped[str | None] = mapped_column(String(64), nullable=True)
    statut: Mapped[StatutPecheur] = mapped_column(
        Enum(StatutPecheur, name="statut_pecheur", native_enum=True),
        nullable=False,
        default=StatutPecheur.actif,
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True
    )
    # Nombre d'appareils que ce pêcheur peut rattacher (ADR-012, règle R2).
    # Vide : valeur par défaut du paramétrage `appareils.json`.
    appareils_autorises: Mapped[int | None] = mapped_column(Integer, nullable=True)

    utilisateur: Mapped[Utilisateur] = relationship(back_populates="pecheur")
    organisation: Mapped[Organisation | None] = relationship(back_populates="pecheurs")
    embarcations: Mapped[list[Embarcation]] = relationship(back_populates="pecheur")
    captures: Mapped[list[Capture]] = relationship(back_populates="pecheur")
    abonnements: Mapped[list[Abonnement]] = relationship(back_populates="pecheur")


class Embarcation(Base):
    __tablename__ = "embarcations"
    __table_args__ = (
        UniqueConstraint("immatriculation", name="uq_embarcations_immatriculation"),
        UniqueConstraint("balise_id", name="uq_embarcations_balise_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pecheur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pecheurs.id", ondelete="CASCADE"), nullable=False
    )
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    immatriculation: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    longueur: Mapped[float | None] = mapped_column(Float, nullable=True)
    equipements: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Registre de la flotte (référentiels : filières, types de pirogue, matériaux, strates)
    filiere: Mapped[str | None] = mapped_column(String(32), nullable=True)
    type_pirogue: Mapped[str | None] = mapped_column(String(64), nullable=True)
    materiau: Mapped[str | None] = mapped_column(String(32), nullable=True)
    puissance_moteur_cv: Mapped[float | None] = mapped_column(Float, nullable=True)
    site_attache: Mapped[str | None] = mapped_column(String(128), nullable=True)
    strate: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Identifiant de la balise satellitaire embarquée (ADR-009, source=balise) :
    # numéro de série du dispositif, rapproché à l'ingestion POST /positions/balises/ingest
    balise_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Informations d'inscription complémentaires, toutes facultatives.
    # Statut : Proposé (valideurs : Christian, DGPA), lot 2 du chantier de novembre 2026.
    mmsi: Mapped[str | None] = mapped_column(String(9), nullable=True, index=True)
    numero_omi: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)
    indicatif_radio: Mapped[str | None] = mapped_column(String(16), nullable=True)
    jauge_brute: Mapped[float | None] = mapped_column(Float, nullable=True)
    annee_construction: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Propriétaire et exploitant, quand ils diffèrent du titulaire de la licence
    proprietaire: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exploitant: Mapped[str | None] = mapped_column(String(255), nullable=True)

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
    # Appareil qui a envoyé le relevé (ADR-012) ; vide pour une balise, un agent
    # ou l'ancienne application
    appareil_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appareils.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Identifiant donné par le téléphone à ce relevé (demande S2) : un renvoi après une
    # coupure de réseau est reconnu au lieu d'être enregistré deux fois
    identifiant_client: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index(
            "uq_positions_embarcation_identifiant_client",
            "embarcation_id",
            "identifiant_client",
            unique=True,
            postgresql_where=text("identifiant_client IS NOT NULL"),
        ),
    )

    embarcation: Mapped[Embarcation] = relationship(back_populates="positions")


class Appareil(Base):
    """Appareil rattaché à un compte pêcheur (ADR-012).

    Seule l'empreinte de l'identifiant est conservée, calculée avec un secret du
    serveur : la valeur envoyée par le téléphone n'est jamais stockée. Un appareil
    n'a qu'un rattachement actif à la fois ; une libération garde son auteur, sa
    date et son motif.
    """

    __tablename__ = "appareils"
    __table_args__ = (
        Index(
            "uq_appareils_empreinte_actif",
            "empreinte",
            unique=True,
            postgresql_where=text("etat = 'actif'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empreinte: Mapped[str] = mapped_column(String(64), nullable=False)
    # Nature de l'identifiant reçu : `android` (appareil) ou `install` (installation)
    origine: Mapped[str | None] = mapped_column(String(16), nullable=True)
    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    etat: Mapped[EtatAppareil] = mapped_column(
        Enum(EtatAppareil, name="etat_appareil", native_enum=True),
        nullable=False,
        default=EtatAppareil.actif,
        server_default="actif",
    )
    premiere_utilisation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    derniere_utilisation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    libere_par_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    libere_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motif_liberation: Mapped[str | None] = mapped_column(Text, nullable=True)


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
    # Origine du lieu de pêche (demande S7) : « gps » (relevé du téléphone) ou « saisie »
    # (point choisi par le pêcheur) ; vide pour les déclarations plus anciennes
    origine_lieu: Mapped[str | None] = mapped_column(String(16), nullable=True)
    point_debarquement: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Prix de vente déclaré au kilo, facultatif (lot 6, Proposé)
    prix_fcfa_kg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_capture: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    synchronise_a: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Taxe à la production (barème référentiel) : calculée une fois à l'insertion,
    # figée dès que la capture est rattachée à une quittance
    taxe_fcfa: Mapped[float | None] = mapped_column(Float, nullable=True)
    taxe_taux_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    taxe_statut: Mapped[TaxeStatut] = mapped_column(
        Enum(TaxeStatut, name="taxe_statut", native_enum=True),
        nullable=False,
        default=TaxeStatut.due,
        server_default="due",
    )
    quittance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quittances.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

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
    # Lot 9 : état de traitement (codes du paramétrage `alertes_traitement.json`). Le
    # statut historique ci-dessus en est déduit, pour les écrans et compteurs existants.
    # Posé à la création depuis le paramétrage (`alertes/traitement.py`) ; la valeur
    # par défaut de la base ne sert que si le paramétrage est illisible.
    etat_traitement: Mapped[str | None] = mapped_column(
        String(32), nullable=False, server_default=text("'a_traiter'"), index=True
    )

    embarcation: Mapped[Embarcation | None] = relationship(back_populates="alertes")


class JetonRenouvellement(Base):
    """Jeton de renouvellement de session de l'application mobile (demande S1).

    Seule l'empreinte du jeton est conservée, jamais sa valeur. Une famille réunit
    les jetons successifs d'une même connexion : la réutilisation d'un jeton déjà
    employé ferme toute la famille.
    """

    __tablename__ = "jetons_renouvellement"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    famille: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    empreinte: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # Pour un pêcheur : empreinte du téléphone rattaché à la connexion
    appareil_empreinte: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cree_a: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expire_a: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    utilise_a: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoque_a: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AlerteJournal(Base):
    """Journal de traçabilité du traitement d'une alerte (lot 9).

    Une ligne par changement d'état : auteur, date, état avant et après,
    commentaire. Jamais modifiée ni supprimée : la base refuse toute mise à jour
    et toute suppression de cette table (déclencheur posé par la migration).
    """

    __tablename__ = "alertes_journal"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alerte_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("alertes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    etat_avant: Mapped[str] = mapped_column(String(32), nullable=False)
    etat_apres: Mapped[str] = mapped_column(String(32), nullable=False)
    commentaire: Mapped[str] = mapped_column(Text, nullable=False)
    # Auteur : référence du compte et, figés au moment de l'action, son nom et son rôle
    auteur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    auteur_nom: Mapped[str] = mapped_column(String(255), nullable=False)
    auteur_role: Mapped[str] = mapped_column(String(32), nullable=False)
    # « traitement » (nouveau point d'accès) ou « ancien_ecran » (PATCH /alertes/{id})
    origine: Mapped[str] = mapped_column(String(32), nullable=False)
    horodatage: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class DemandeLicence(Base):
    """Demande d'inscription / licence depuis le front office public."""

    __tablename__ = "demandes_licence"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type_demande: Mapped[TypeDemandeLicence] = mapped_column(
        Enum(TypeDemandeLicence, name="type_demande_licence", native_enum=True),
        nullable=False,
    )
    statut: Mapped[StatutDemandeLicence] = mapped_column(
        Enum(StatutDemandeLicence, name="statut_demande_licence", native_enum=True),
        nullable=False,
        default=StatutDemandeLicence.en_attente,
        index=True,
    )
    # Personne physique (pêcheur)
    nom: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prenom: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telephone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # Personne morale (organisation)
    org_nom: Mapped[str | None] = mapped_column(String(255), nullable=True)
    org_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    numero_registre: Mapped[str | None] = mapped_column(String(128), nullable=True)
    org_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    org_telephone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    org_ville: Mapped[str | None] = mapped_column(String(128), nullable=True)
    org_adresse: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Commun
    zone_activite: Mapped[str | None] = mapped_column(String(255), nullable=True)
    embarcation_nom: Mapped[str | None] = mapped_column(String(255), nullable=True)
    embarcation_immatriculation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    embarcation_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    embarcation_longueur: Mapped[float | None] = mapped_column(Float, nullable=True)
    embarcation_equipements: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Informations d'inscription complémentaires de l'embarcation (MMSI, numéro OMI,
    # indicatif, jauge, année, propriétaire, exploitant), reportées à l'approbation
    embarcation_complements: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    nationalite: Mapped[str | None] = mapped_column(String(64), nullable=True)
    montant_autorisation_fcfa: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Justificatifs FO — [{id, type_piece, nom_original, chemin, content_type, taille}]
    pieces_jointes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    # Traitement back-office
    motif_refus: Mapped[str | None] = mapped_column(Text, nullable=True)
    pecheur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pecheurs.id", ondelete="SET NULL"), nullable=True
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True
    )
    traite_par_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    date_traitement: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Identifiants attribués automatiquement à l'approbation définitive
    numero_licence_attribue: Mapped[str | None] = mapped_column(String(64), nullable=True)
    immatriculation_attribuee: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ProfilActeur(Base):
    """Page de profil d'un acteur, pêcheur ou organisation (lot 2).

    Visible des personnes connectées ; l'acteur peut en plus l'ouvrir au public
    par un lien, option désactivée au départ. Les espèces affichées viennent des
    captures déclarées ; seules celles que l'acteur masque sont conservées ici.
    """

    __tablename__ = "profils_acteur"
    __table_args__ = (
        CheckConstraint(
            "(pecheur_id IS NOT NULL) <> (organisation_id IS NOT NULL)",
            name="ck_profils_acteur_un_seul_acteur",
        ),
        UniqueConstraint("pecheur_id", name="uq_profils_acteur_pecheur"),
        UniqueConstraint("organisation_id", name="uq_profils_acteur_organisation"),
        UniqueConstraint("jeton_public", name="uq_profils_acteur_jeton_public"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pecheur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pecheurs.id", ondelete="CASCADE"), nullable=True
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=True
    )
    presentation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Codes d'espèces que l'acteur ne souhaite pas afficher
    especes_masquees: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    # Tarifs facultatifs : [{espece, unite, prix_fcfa}], en francs CFA entiers
    tarifs: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    tarifs_visibles: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    ouvert_au_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Jeton du lien public, créé à la première ouverture ; jamais déduit d'un identifiant
    jeton_public: Mapped[str | None] = mapped_column(String(64), nullable=True)
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    date_mise_a_jour: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Compteur(Base):
    """Compteurs de numérotation (licences, immatriculations) — incrément atomique."""

    __tablename__ = "compteurs"

    cle: Mapped[str] = mapped_column(String(64), primary_key=True)
    valeur: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Abonnement(Base):
    """Abonnement B2C / B2B — docs/modele-economique.md (Phase 4 / V2)."""

    __tablename__ = "abonnements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canal: Mapped[CanalAbonnement] = mapped_column(
        Enum(CanalAbonnement, name="canal_abonnement", native_enum=True),
        nullable=False,
        index=True,
    )
    code_offre: Mapped[CodeOffreAbonnement] = mapped_column(
        Enum(CodeOffreAbonnement, name="code_offre_abonnement", native_enum=True),
        nullable=False,
    )
    periode: Mapped[PeriodeAbonnement] = mapped_column(
        Enum(PeriodeAbonnement, name="periode_abonnement", native_enum=True),
        nullable=False,
    )
    montant_fcfa: Mapped[int] = mapped_column(Integer, nullable=False)
    statut: Mapped[StatutAbonnement] = mapped_column(
        Enum(StatutAbonnement, name="statut_abonnement", native_enum=True),
        nullable=False,
        default=StatutAbonnement.brouillon,
        index=True,
    )
    pecheur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pecheurs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Flotte : embarcations couvertes au-delà du pack base (10)
    embarcations_incluses: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    date_debut: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    date_fin: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    auto_renouvellement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    date_mise_a_jour: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    pecheur: Mapped[Pecheur | None] = relationship(back_populates="abonnements")
    organisation: Mapped[Organisation | None] = relationship(back_populates="abonnements")
    paiements: Mapped[list[PaiementMobileMoney]] = relationship(back_populates="abonnement")


class PaiementMobileMoney(Base):
    """Paiement Mobile Money (Airtel / Moov) — mode demo ou webhook agrégateur."""

    __tablename__ = "paiements_mobile_money"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    abonnement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("abonnements.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Paiement d'une quittance de redevances (taxe à la production)
    quittance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quittances.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    montant_fcfa: Mapped[int] = mapped_column(Integer, nullable=False)
    operateur: Mapped[OperateurMobileMoney] = mapped_column(
        Enum(OperateurMobileMoney, name="operateur_mobile_money", native_enum=True),
        nullable=False,
        default=OperateurMobileMoney.demo,
    )
    msisdn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    statut: Mapped[StatutPaiement] = mapped_column(
        Enum(StatutPaiement, name="statut_paiement", native_enum=True),
        nullable=False,
        default=StatutPaiement.initie,
        index=True,
    )
    reference_interne: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    reference_operateur: Mapped[str | None] = mapped_column(String(128), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    date_confirmation: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    abonnement: Mapped[Abonnement] = relationship(back_populates="paiements")


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


class Quittance(Base):
    """Quittance de redevances : regroupe les taxes dues d'un pêcheur ou d'une organisation."""

    __tablename__ = "quittances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    numero: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    pecheur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pecheurs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    montant_fcfa: Mapped[int] = mapped_column(Integer, nullable=False)
    nb_captures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    periode_debut: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    periode_fin: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    statut: Mapped[StatutQuittance] = mapped_column(
        Enum(StatutQuittance, name="statut_quittance", native_enum=True),
        nullable=False,
        default=StatutQuittance.en_attente,
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    date_paiement: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cree_par_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class MissionControle(Base):
    """Mission de surveillance : cadre d'une série de contrôles sur le terrain."""

    __tablename__ = "missions_controle"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones_reglementees.id", ondelete="SET NULL"), nullable=True
    )
    zone_libelle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_debut: Mapped[date] = mapped_column(Date, nullable=False)
    date_fin: Mapped[date | None] = mapped_column(Date, nullable=True)
    responsable_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    statut: Mapped[StatutMission] = mapped_column(
        Enum(StatutMission, name="statut_mission", native_enum=True),
        nullable=False,
        default=StatutMission.planifiee,
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Controle(Base):
    """Contrôle d'une embarcation : licence, engins, infraction, sanction."""

    __tablename__ = "controles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions_controle.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    embarcation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("embarcations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    pecheur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pecheurs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    numero_licence_saisi: Mapped[str | None] = mapped_column(String(64), nullable=True)
    date_controle: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    position = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    lieu: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nationalite_proprietaire: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pecheurs_a_bord: Mapped[int | None] = mapped_column(Integer, nullable=True)
    engin_declare: Mapped[str | None] = mapped_column(String(128), nullable=True)
    engin_trouve: Mapped[str | None] = mapped_column(String(128), nullable=True)
    infraction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    categorie_infraction: Mapped[str | None] = mapped_column(String(128), nullable=True)
    saisies: Mapped[str | None] = mapped_column(Text, nullable=True)
    sanction: Mapped[str | None] = mapped_column(Text, nullable=True)
    observations: Mapped[str | None] = mapped_column(Text, nullable=True)
    licence_valide: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Commande(Base):
    """Réservation client vers pêcheur (ADR-014, lot 7) ; aucun paiement sur la plateforme."""

    __tablename__ = "commandes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pecheur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pecheurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    capture_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("captures.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    espece: Mapped[str | None] = mapped_column(String(128), nullable=True)
    quantite_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    montant_prevu_fcfa: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    statut: Mapped[StatutCommande] = mapped_column(
        Enum(StatutCommande, name="statut_commande", native_enum=True),
        nullable=False,
        default=StatutCommande.reservee,
        server_default="reservee",
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    date_mise_a_jour: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    date_acceptee: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    date_confirmee_vendeur: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    date_confirmee_client: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    date_annulee: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client: Mapped[Utilisateur] = relationship(foreign_keys=[client_id])
    pecheur: Mapped[Pecheur] = relationship()
    capture: Mapped[Capture | None] = relationship()


class PerimetreZone(Base):
    """Zones activables de périmètre de suivi cartographique (lot 8, ADR-015).

    Emprises approximatives (fictif, à valider DGPA). La désactivation masque
    l'historique des positions et alertes dans l'emprise, sans suppression physique.
    """

    __tablename__ = "perimetre_zones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    libelle: Mapped[str] = mapped_column(String(255), nullable=False)
    type_zone: Mapped[TypePerimetre] = mapped_column(
        Enum(TypePerimetre, name="type_perimetre", native_enum=True),
        nullable=False,
    )
    actif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    emprise = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326),
        nullable=False,
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    date_mise_a_jour: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (Index("ix_perimetre_zones_emprise", "emprise", postgresql_using="gist"),)


class AgentZone(Base):
    """Affectation d'un agent de contrôle à une ou plusieurs zones de périmètre (§7)."""

    __tablename__ = "agent_zones"
    __table_args__ = (
        UniqueConstraint("utilisateur_id", "zone_id", name="uq_agent_zones_user_zone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("perimetre_zones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
