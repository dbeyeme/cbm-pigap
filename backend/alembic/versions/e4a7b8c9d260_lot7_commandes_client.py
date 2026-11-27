"""lot7_commandes_client

Lot 7 (ADR-014) : rôle client, enum statut_commande, table commandes.
Migration additive, rejouable sur une base créée par les tests (`create_all`).

Revision ID: e4a7b8c9d260
Revises: d3f6a8b9c150
Create Date: 2026-11-27 03:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e4a7b8c9d260"
down_revision: str | None = "d3f6a8b9c150"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUTS_COMMANDE = (
    "reservee",
    "acceptee",
    "confirmee_vendeur",
    "confirmee_client",
    "annulee",
)


def _hors_ligne() -> bool:
    return bool(op.get_context().as_sql)


def _table_existe(table: str) -> bool:
    return not _hors_ligne() and sa.inspect(op.get_bind()).has_table(table)


def _index(table: str) -> set[str]:
    if not _table_existe(table):
        return set()
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$ BEGIN
                ALTER TYPE role_utilisateur ADD VALUE IF NOT EXISTS 'client';
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )

    valeurs = ", ".join(f"'{v}'" for v in _STATUTS_COMMANDE)
    op.execute(
        sa.text(
            f"""
            DO $$ BEGIN
                CREATE TYPE statut_commande AS ENUM ({valeurs});
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )

    if not _table_existe("commandes"):
        statut = postgresql.ENUM(*_STATUTS_COMMANDE, name="statut_commande", create_type=False)
        op.create_table(
            "commandes",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "client_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("utilisateurs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "pecheur_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("pecheurs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "capture_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("captures.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("espece", sa.String(length=128), nullable=True),
            sa.Column("quantite_kg", sa.Float(), nullable=True),
            sa.Column("montant_prevu_fcfa", sa.Integer(), nullable=True),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column(
                "statut",
                statut,
                nullable=False,
                server_default="reservee",
            ),
            sa.Column(
                "date_creation",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "date_mise_a_jour",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("date_acceptee", sa.DateTime(timezone=True), nullable=True),
            sa.Column("date_confirmee_vendeur", sa.DateTime(timezone=True), nullable=True),
            sa.Column("date_confirmee_client", sa.DateTime(timezone=True), nullable=True),
            sa.Column("date_annulee", sa.DateTime(timezone=True), nullable=True),
        )

    for nom, colonne in (
        ("ix_commandes_client_id", "client_id"),
        ("ix_commandes_pecheur_id", "pecheur_id"),
        ("ix_commandes_capture_id", "capture_id"),
        ("ix_commandes_statut", "statut"),
    ):
        if nom not in _index("commandes"):
            op.create_index(nom, "commandes", [colonne])


def downgrade() -> None:
    if _table_existe("commandes"):
        for nom in (
            "ix_commandes_statut",
            "ix_commandes_capture_id",
            "ix_commandes_pecheur_id",
            "ix_commandes_client_id",
        ):
            if nom in _index("commandes"):
                op.drop_index(nom, table_name="commandes")
        op.drop_table("commandes")
    # Ne pas retirer les valeurs d'enum PostgreSQL (irréversible proprement).