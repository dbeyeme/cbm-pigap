"""abonnements_mobile_money

Tables abonnements + paiements_mobile_money (enums associés).

Revision ID: f6d0e5b13455
Revises: e5c9d4a02344
Create Date: 2026-09-15 06:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6d0e5b13455"
down_revision: str | None = "e5c9d4a02344"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

canal_abonnement = sa.Enum(
    "b2c",
    "b2b_autorite",
    "b2b_flotte",
    name="canal_abonnement",
)
code_offre_abonnement = sa.Enum(
    "b2c_mensuel",
    "b2c_annuel",
    "b2b_autorite_mensuel",
    "b2b_autorite_annuel",
    "b2b_flotte_mensuel",
    "b2b_flotte_annuel",
    name="code_offre_abonnement",
)
periode_abonnement = sa.Enum("mensuel", "annuel", name="periode_abonnement")
statut_abonnement = sa.Enum(
    "brouillon",
    "en_attente_paiement",
    "actif",
    "expire",
    "annule",
    name="statut_abonnement",
)
statut_paiement = sa.Enum(
    "initie",
    "en_attente",
    "reussi",
    "echoue",
    "expire",
    name="statut_paiement",
)
operateur_mobile_money = sa.Enum(
    "airtel_money",
    "moov_money",
    "demo",
    name="operateur_mobile_money",
)


def upgrade() -> None:
    canal_abonnement.create(op.get_bind(), checkfirst=True)
    code_offre_abonnement.create(op.get_bind(), checkfirst=True)
    periode_abonnement.create(op.get_bind(), checkfirst=True)
    statut_abonnement.create(op.get_bind(), checkfirst=True)
    statut_paiement.create(op.get_bind(), checkfirst=True)
    operateur_mobile_money.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "abonnements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("canal", canal_abonnement, nullable=False),
        sa.Column("code_offre", code_offre_abonnement, nullable=False),
        sa.Column("periode", periode_abonnement, nullable=False),
        sa.Column("montant_fcfa", sa.Integer(), nullable=False),
        sa.Column("statut", statut_abonnement, nullable=False),
        sa.Column("pecheur_id", sa.UUID(), nullable=True),
        sa.Column("organisation_id", sa.UUID(), nullable=True),
        sa.Column("embarcations_incluses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("date_debut", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_renouvellement", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("date_creation", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("date_mise_a_jour", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pecheur_id"], ["pecheurs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_abonnements_canal", "abonnements", ["canal"])
    op.create_index("ix_abonnements_statut", "abonnements", ["statut"])
    op.create_index("ix_abonnements_pecheur_id", "abonnements", ["pecheur_id"])
    op.create_index("ix_abonnements_organisation_id", "abonnements", ["organisation_id"])
    op.create_index("ix_abonnements_date_fin", "abonnements", ["date_fin"])

    op.create_table(
        "paiements_mobile_money",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("abonnement_id", sa.UUID(), nullable=False),
        sa.Column("montant_fcfa", sa.Integer(), nullable=False),
        sa.Column("operateur", operateur_mobile_money, nullable=False),
        sa.Column("msisdn", sa.String(length=32), nullable=True),
        sa.Column("statut", statut_paiement, nullable=False),
        sa.Column("reference_interne", sa.String(length=64), nullable=False),
        sa.Column("reference_operateur", sa.String(length=128), nullable=True),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("date_creation", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("date_confirmation", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["abonnement_id"], ["abonnements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference_interne"),
    )
    op.create_index("ix_paiements_mobile_money_abonnement_id", "paiements_mobile_money", ["abonnement_id"])
    op.create_index("ix_paiements_mobile_money_statut", "paiements_mobile_money", ["statut"])


def downgrade() -> None:
    op.drop_index("ix_paiements_mobile_money_statut", table_name="paiements_mobile_money")
    op.drop_index("ix_paiements_mobile_money_abonnement_id", table_name="paiements_mobile_money")
    op.drop_table("paiements_mobile_money")
    op.drop_index("ix_abonnements_date_fin", table_name="abonnements")
    op.drop_index("ix_abonnements_organisation_id", table_name="abonnements")
    op.drop_index("ix_abonnements_pecheur_id", table_name="abonnements")
    op.drop_index("ix_abonnements_statut", table_name="abonnements")
    op.drop_index("ix_abonnements_canal", table_name="abonnements")
    op.drop_table("abonnements")
    operateur_mobile_money.drop(op.get_bind(), checkfirst=True)
    statut_paiement.drop(op.get_bind(), checkfirst=True)
    statut_abonnement.drop(op.get_bind(), checkfirst=True)
    periode_abonnement.drop(op.get_bind(), checkfirst=True)
    code_offre_abonnement.drop(op.get_bind(), checkfirst=True)
    canal_abonnement.drop(op.get_bind(), checkfirst=True)
