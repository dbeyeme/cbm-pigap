"""redevances_controles_referentiels

Taxe à la production sur les captures, quittances de redevances, missions et
contrôles de surveillance, nationalité du pêcheur, caractéristiques du registre
de la flotte, montant d'autorisation sur les demandes de licence.

Revision ID: d0f3c8b57899
Revises: c9e2b7a46788
Create Date: 2026-10-01 14:00:00.000000

"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d0f3c8b57899"
down_revision: str | None = "c9e2b7a46788"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_enum(name: str, *values: str) -> None:
    vals = ", ".join(f"'{v}'" for v in values)
    op.execute(
        sa.text(
            f"""
            DO $$ BEGIN
                CREATE TYPE {name} AS ENUM ({vals});
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )


def upgrade() -> None:
    _create_enum("taxe_statut", "due", "payee", "exoneree", "sans_bareme")
    _create_enum("statut_quittance", "en_attente", "payee", "annulee")
    _create_enum("statut_mission", "planifiee", "en_cours", "cloturee")
    taxe_statut = postgresql.ENUM(name="taxe_statut", create_type=False)
    statut_quittance = postgresql.ENUM(name="statut_quittance", create_type=False)
    statut_mission = postgresql.ENUM(name="statut_mission", create_type=False)

    op.create_table(
        "quittances",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("numero", sa.String(length=32), nullable=False),
        sa.Column("pecheur_id", sa.UUID(), nullable=True),
        sa.Column("organisation_id", sa.UUID(), nullable=True),
        sa.Column("montant_fcfa", sa.Integer(), nullable=False),
        sa.Column("nb_captures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("periode_debut", sa.DateTime(timezone=True), nullable=True),
        sa.Column("periode_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("statut", statut_quittance, nullable=False),
        sa.Column(
            "date_creation",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("date_paiement", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cree_par_id", sa.UUID(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["pecheur_id"], ["pecheurs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cree_par_id"], ["utilisateurs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("numero", name="uq_quittances_numero"),
    )
    op.create_index("ix_quittances_pecheur_id", "quittances", ["pecheur_id"])
    op.create_index("ix_quittances_organisation_id", "quittances", ["organisation_id"])

    # Captures : taxe à la production
    op.add_column("captures", sa.Column("taxe_fcfa", sa.Float(), nullable=True))
    op.add_column("captures", sa.Column("taxe_taux_kg", sa.Float(), nullable=True))
    op.add_column(
        "captures",
        sa.Column("taxe_statut", taxe_statut, nullable=False, server_default="due"),
    )
    op.add_column("captures", sa.Column("quittance_id", sa.UUID(), nullable=True))
    op.create_index("ix_captures_quittance_id", "captures", ["quittance_id"])
    op.create_foreign_key(
        "fk_captures_quittance_id",
        "captures",
        "quittances",
        ["quittance_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Paiements : abonnement facultatif, quittance possible
    op.alter_column(
        "paiements_mobile_money", "abonnement_id", existing_type=sa.UUID(), nullable=True
    )
    op.add_column("paiements_mobile_money", sa.Column("quittance_id", sa.UUID(), nullable=True))
    op.create_index(
        "ix_paiements_mobile_money_quittance_id", "paiements_mobile_money", ["quittance_id"]
    )
    op.create_foreign_key(
        "fk_paiements_quittance_id",
        "paiements_mobile_money",
        "quittances",
        ["quittance_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Pêcheurs, demandes, embarcations
    op.add_column("pecheurs", sa.Column("nationalite", sa.String(length=64), nullable=True))
    op.add_column("demandes_licence", sa.Column("nationalite", sa.String(length=64), nullable=True))
    op.add_column(
        "demandes_licence", sa.Column("montant_autorisation_fcfa", sa.Integer(), nullable=True)
    )
    op.add_column("embarcations", sa.Column("filiere", sa.String(length=32), nullable=True))
    op.add_column("embarcations", sa.Column("type_pirogue", sa.String(length=64), nullable=True))
    op.add_column("embarcations", sa.Column("materiau", sa.String(length=32), nullable=True))
    op.add_column("embarcations", sa.Column("puissance_moteur_cv", sa.Float(), nullable=True))
    op.add_column("embarcations", sa.Column("site_attache", sa.String(length=128), nullable=True))
    op.add_column("embarcations", sa.Column("strate", sa.String(length=64), nullable=True))

    # Missions et contrôles
    op.create_table(
        "missions_controle",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("zone_id", sa.UUID(), nullable=True),
        sa.Column("zone_libelle", sa.String(length=255), nullable=True),
        sa.Column("date_debut", sa.Date(), nullable=False),
        sa.Column("date_fin", sa.Date(), nullable=True),
        sa.Column("responsable_id", sa.UUID(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("statut", statut_mission, nullable=False),
        sa.Column(
            "date_creation",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["zone_id"], ["zones_reglementees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["responsable_id"], ["utilisateurs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_missions_controle_code"),
    )
    op.create_table(
        "controles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("mission_id", sa.UUID(), nullable=True),
        sa.Column("embarcation_id", sa.UUID(), nullable=True),
        sa.Column("pecheur_id", sa.UUID(), nullable=True),
        sa.Column("numero_licence_saisi", sa.String(length=64), nullable=True),
        sa.Column("date_controle", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "position",
            geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("lieu", sa.String(length=255), nullable=True),
        sa.Column("nationalite_proprietaire", sa.String(length=64), nullable=True),
        sa.Column("pecheurs_a_bord", sa.Integer(), nullable=True),
        sa.Column("engin_declare", sa.String(length=128), nullable=True),
        sa.Column("engin_trouve", sa.String(length=128), nullable=True),
        sa.Column("infraction", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("categorie_infraction", sa.String(length=128), nullable=True),
        sa.Column("saisies", sa.Text(), nullable=True),
        sa.Column("sanction", sa.Text(), nullable=True),
        sa.Column("observations", sa.Text(), nullable=True),
        sa.Column("licence_valide", sa.Boolean(), nullable=True),
        sa.Column("agent_id", sa.UUID(), nullable=True),
        sa.Column(
            "date_creation",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["mission_id"], ["missions_controle.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["embarcation_id"], ["embarcations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pecheur_id"], ["pecheurs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["agent_id"], ["utilisateurs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_controles_mission_id", "controles", ["mission_id"])
    op.create_index("ix_controles_embarcation_id", "controles", ["embarcation_id"])
    op.create_index("ix_controles_pecheur_id", "controles", ["pecheur_id"])
    op.create_index("ix_controles_date_controle", "controles", ["date_controle"])


def downgrade() -> None:
    op.drop_table("controles")
    op.drop_table("missions_controle")
    for col in (
        "strate",
        "site_attache",
        "puissance_moteur_cv",
        "materiau",
        "type_pirogue",
        "filiere",
    ):
        op.drop_column("embarcations", col)
    op.drop_column("demandes_licence", "montant_autorisation_fcfa")
    op.drop_column("demandes_licence", "nationalite")
    op.drop_column("pecheurs", "nationalite")
    op.drop_constraint("fk_paiements_quittance_id", "paiements_mobile_money", type_="foreignkey")
    op.drop_index("ix_paiements_mobile_money_quittance_id", table_name="paiements_mobile_money")
    op.drop_column("paiements_mobile_money", "quittance_id")
    op.alter_column(
        "paiements_mobile_money", "abonnement_id", existing_type=sa.UUID(), nullable=False
    )
    op.drop_constraint("fk_captures_quittance_id", "captures", type_="foreignkey")
    op.drop_index("ix_captures_quittance_id", table_name="captures")
    for col in ("quittance_id", "taxe_statut", "taxe_taux_kg", "taxe_fcfa"):
        op.drop_column("captures", col)
    op.drop_table("quittances")
    # Les types enum PostgreSQL ne sont pas retirés (irréversible proprement).
