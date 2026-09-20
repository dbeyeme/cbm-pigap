"""numerotation_automatique

Table `compteurs` (séquences atomiques) + identifiants attribués sur les
demandes de licence approuvées.

Revision ID: b8f2a7d35677
Revises: a7e1f6c24566
Create Date: 2026-09-20 02:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8f2a7d35677"
down_revision: str | None = "a7e1f6c24566"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Idempotent : une base créée via Base.metadata.create_all (tests / dev)
    # peut déjà contenir la table ou les colonnes.
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS compteurs (
                cle VARCHAR(64) PRIMARY KEY,
                valeur INTEGER NOT NULL DEFAULT 0
            )
            """
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE demandes_licence "
            "ADD COLUMN IF NOT EXISTS numero_licence_attribue VARCHAR(64)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE demandes_licence "
            "ADD COLUMN IF NOT EXISTS immatriculation_attribuee VARCHAR(64)"
        )
    )


def downgrade() -> None:
    op.drop_column("demandes_licence", "immatriculation_attribuee")
    op.drop_column("demandes_licence", "numero_licence_attribue")
    op.drop_table("compteurs")
