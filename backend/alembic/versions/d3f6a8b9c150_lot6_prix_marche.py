"""lot6_prix_marche

Lot 6 du chantier de novembre 2026 : prix de vente facultatif sur une
déclaration de capture (`captures.prix_fcfa_kg`), en francs CFA par kilo.

Migration additive. Une base dont les tables ont été créées par les tests
(`create_all`) se met à niveau sans erreur.

Revision ID: d3f6a8b9c150
Revises: c2e5f6a7b849
Create Date: 2026-11-26 05:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3f6a8b9c150"
down_revision: str | None = "c2e5f6a7b849"
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


def upgrade() -> None:
    if "prix_fcfa_kg" not in _colonnes("captures"):
        op.add_column("captures", sa.Column("prix_fcfa_kg", sa.Integer(), nullable=True))


def downgrade() -> None:
    if "prix_fcfa_kg" in _colonnes("captures"):
        op.drop_column("captures", "prix_fcfa_kg")
