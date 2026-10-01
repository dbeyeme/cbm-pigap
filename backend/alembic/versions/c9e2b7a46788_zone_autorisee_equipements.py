"""zone_autorisee_equipements

Type de zone « autorisée » (limite géographique, §5.3) et équipements /
longueur de l'embarcation sur les demandes de licence (§5.1).

Revision ID: c9e2b7a46788
Revises: b8f2a7d35677
Create Date: 2026-10-01 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c9e2b7a46788"
down_revision: str | None = "b8f2a7d35677"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$ BEGIN
                ALTER TYPE type_zone ADD VALUE IF NOT EXISTS 'autorisee';
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )
    op.add_column(
        "demandes_licence",
        sa.Column("embarcation_longueur", sa.Float(), nullable=True),
    )
    op.add_column(
        "demandes_licence",
        sa.Column(
            "embarcation_equipements",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("demandes_licence", "embarcation_equipements")
    op.drop_column("demandes_licence", "embarcation_longueur")
    # La valeur d'enum PostgreSQL n'est pas retirée (irréversible proprement).
