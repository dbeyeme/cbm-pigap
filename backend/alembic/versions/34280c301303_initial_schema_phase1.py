"""initial_schema_phase1

Revision ID: 34280c301303
Revises:
Create Date: 2026-07-27 17:56:54.928220

"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "34280c301303"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organisations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("nom", sa.String(length=255), nullable=False),
        sa.Column(
            "date_creation",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "utilisateurs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("nom", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "pecheur",
                "agent_controle",
                "autorite",
                "chercheur",
                "admin",
                name="role_utilisateur",
            ),
            nullable=False,
        ),
        sa.Column("telephone", sa.String(length=32), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("mot_de_passe_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "date_creation",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "zones_reglementees",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("nom", sa.String(length=255), nullable=False),
        sa.Column(
            "type",
            sa.Enum("interdite", "protegee", "sensible", name="type_zone"),
            nullable=False,
        ),
        sa.Column(
            "geometrie",
            geoalchemy2.types.Geometry(geometry_type="POLYGON", srid=4326),
            nullable=False,
        ),
        sa.Column("periode_debut", sa.Date(), nullable=True),
        sa.Column("periode_fin", sa.Date(), nullable=True),
        sa.Column("actif", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "logs_acces",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("utilisateur_id", sa.UUID(), nullable=True),
        sa.Column("ressource", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "horodatage",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["utilisateur_id"], ["utilisateurs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_logs_acces_horodatage"), "logs_acces", ["horodatage"], unique=False)
    op.create_table(
        "pecheurs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("utilisateur_id", sa.UUID(), nullable=False),
        sa.Column("nom", sa.String(length=255), nullable=False),
        sa.Column("prenom", sa.String(length=255), nullable=False),
        sa.Column("numero_licence", sa.String(length=64), nullable=False),
        sa.Column("date_delivrance_licence", sa.Date(), nullable=True),
        sa.Column(
            "statut",
            sa.Enum("actif", "suspendu", name="statut_pecheur"),
            nullable=False,
        ),
        sa.Column("organisation_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["utilisateur_id"], ["utilisateurs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("numero_licence", name="uq_pecheurs_numero_licence"),
        sa.UniqueConstraint("utilisateur_id"),
    )
    op.create_table(
        "quotas",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("espece", sa.String(length=128), nullable=False),
        sa.Column("zone_id", sa.UUID(), nullable=True),
        sa.Column("periode_debut", sa.Date(), nullable=False),
        sa.Column("periode_fin", sa.Date(), nullable=False),
        sa.Column("volume_autorise_kg", sa.Float(), nullable=False),
        sa.Column("volume_consomme_kg", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["zone_id"], ["zones_reglementees.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quotas_espece"), "quotas", ["espece"], unique=False)
    op.create_table(
        "embarcations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("pecheur_id", sa.UUID(), nullable=False),
        sa.Column("nom", sa.String(length=255), nullable=False),
        sa.Column("immatriculation", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=True),
        sa.Column("longueur", sa.Float(), nullable=True),
        sa.Column("equipements", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["pecheur_id"], ["pecheurs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("immatriculation", name="uq_embarcations_immatriculation"),
    )
    op.create_table(
        "alertes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "zone_interdite",
                "depassement_quota",
                "anomalie",
                name="type_alerte",
            ),
            nullable=False,
        ),
        sa.Column(
            "niveau_gravite",
            sa.Enum("info", "attention", "critique", name="niveau_gravite"),
            nullable=False,
        ),
        sa.Column("embarcation_id", sa.UUID(), nullable=True),
        sa.Column("declencheur", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "horodatage",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "statut",
            sa.Enum("nouvelle", "traitee", "ignoree", name="statut_alerte"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["embarcation_id"], ["embarcations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_alertes_horodatage"), "alertes", ["horodatage"], unique=False)
    op.create_table(
        "captures",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("pecheur_id", sa.UUID(), nullable=False),
        sa.Column("embarcation_id", sa.UUID(), nullable=False),
        sa.Column("espece", sa.String(length=128), nullable=False),
        sa.Column("quantite_kg", sa.Float(), nullable=False),
        sa.Column("methode", sa.String(length=128), nullable=True),
        sa.Column(
            "position_capture",
            geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326),
            nullable=True,
        ),
        sa.Column("point_debarquement", sa.String(length=255), nullable=True),
        sa.Column("date_capture", sa.DateTime(timezone=True), nullable=False),
        sa.Column("synchronise_a", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["embarcation_id"], ["embarcations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pecheur_id"], ["pecheurs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_captures_date_capture"), "captures", ["date_capture"], unique=False)
    op.create_index(
        op.f("ix_captures_embarcation_id"), "captures", ["embarcation_id"], unique=False
    )
    op.create_index(op.f("ix_captures_pecheur_id"), "captures", ["pecheur_id"], unique=False)
    op.create_table(
        "positions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("embarcation_id", sa.UUID(), nullable=False),
        sa.Column(
            "position",
            geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column("horodatage", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "source",
            sa.Enum("mobile", "balise", name="source_position"),
            nullable=False,
        ),
        sa.Column("synchronise_a", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["embarcation_id"], ["embarcations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_positions_embarcation_id"), "positions", ["embarcation_id"], unique=False
    )
    op.create_index(op.f("ix_positions_horodatage"), "positions", ["horodatage"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_positions_horodatage"), table_name="positions")
    op.drop_index(op.f("ix_positions_embarcation_id"), table_name="positions")
    op.drop_table("positions")
    op.drop_index(op.f("ix_captures_pecheur_id"), table_name="captures")
    op.drop_index(op.f("ix_captures_embarcation_id"), table_name="captures")
    op.drop_index(op.f("ix_captures_date_capture"), table_name="captures")
    op.drop_table("captures")
    op.drop_index(op.f("ix_alertes_horodatage"), table_name="alertes")
    op.drop_table("alertes")
    op.drop_table("embarcations")
    op.drop_index(op.f("ix_quotas_espece"), table_name="quotas")
    op.drop_table("quotas")
    op.drop_table("pecheurs")
    op.drop_index(op.f("ix_logs_acces_horodatage"), table_name="logs_acces")
    op.drop_table("logs_acces")
    op.drop_table("zones_reglementees")
    op.drop_table("utilisateurs")
    op.drop_table("organisations")

    for enum_name in (
        "role_utilisateur",
        "type_zone",
        "statut_pecheur",
        "type_alerte",
        "niveau_gravite",
        "statut_alerte",
        "source_position",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
