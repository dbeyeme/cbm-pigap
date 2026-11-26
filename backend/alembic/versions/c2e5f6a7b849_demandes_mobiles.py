"""demandes_mobiles

Demandes du lot mobile au serveur (docs/lot-3-mobile-socle.md, section 2.6) :

- S1 : table `jetons_renouvellement` (session longue de l'application) ;
- S2 : `positions.identifiant_client`, unique par embarcation, pour reconnaître
  un relevé renvoyé après une coupure de réseau ;
- S7 : `captures.origine_lieu` (« gps » ou « saisie ») ;
- lot 4 : index des alertes par empreinte (anti-doublon).

Migration additive, rejouable sur une base créée par les tests.

Revision ID: c2e5f6a7b849
Revises: b1d4e5f6a738
Create Date: 2026-11-24 19:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c2e5f6a7b849"
down_revision: str | None = "b1d4e5f6a738"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _hors_ligne() -> bool:
    return bool(op.get_context().as_sql)


def _table_existe(table: str) -> bool:
    return not _hors_ligne() and sa.inspect(op.get_bind()).has_table(table)


def _colonnes(table: str) -> set[str]:
    if not _table_existe(table):
        return set()
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _index(table: str) -> set[str]:
    if not _table_existe(table):
        return set()
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    if not _table_existe("jetons_renouvellement"):
        op.create_table(
            "jetons_renouvellement",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "utilisateur_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("utilisateurs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("famille", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("empreinte", sa.String(length=64), nullable=False, unique=True),
            sa.Column("appareil_empreinte", sa.String(length=64), nullable=True),
            sa.Column(
                "cree_a", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
            sa.Column("expire_a", sa.DateTime(timezone=True), nullable=False),
            sa.Column("utilise_a", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoque_a", sa.DateTime(timezone=True), nullable=True),
        )
    for nom, colonne in (
        ("ix_jetons_renouvellement_utilisateur_id", "utilisateur_id"),
        ("ix_jetons_renouvellement_famille", "famille"),
    ):
        if nom not in _index("jetons_renouvellement"):
            op.create_index(nom, "jetons_renouvellement", [colonne])

    if "identifiant_client" not in _colonnes("positions"):
        op.add_column("positions", sa.Column("identifiant_client", sa.String(length=64)))
    if "uq_positions_embarcation_identifiant_client" not in _index("positions"):
        op.create_index(
            "uq_positions_embarcation_identifiant_client",
            "positions",
            ["embarcation_id", "identifiant_client"],
            unique=True,
            postgresql_where=sa.text("identifiant_client IS NOT NULL"),
        )

    if "origine_lieu" not in _colonnes("captures"):
        op.add_column("captures", sa.Column("origine_lieu", sa.String(length=16)))

    # Recherche des alertes par empreinte (anti-doublon des règles, alertes AIS du lot 4)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_alertes_empreinte ON alertes ((declencheur ->> 'fingerprint'))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_alertes_empreinte")
    op.drop_column("captures", "origine_lieu")
    op.drop_index("uq_positions_embarcation_identifiant_client", table_name="positions")
    op.drop_column("positions", "identifiant_client")
    op.drop_table("jetons_renouvellement")
