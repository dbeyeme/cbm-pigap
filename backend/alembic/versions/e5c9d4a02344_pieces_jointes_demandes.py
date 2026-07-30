"""pieces_jointes_demandes

JSONB pieces_jointes sur demandes_licence.

Revision ID: e5c9d4a02344
Revises: d4b8e3f91233
Create Date: 2026-07-30 06:50:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5c9d4a02344"
down_revision: str | None = "d4b8e3f91233"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "demandes_licence",
        sa.Column(
            "pieces_jointes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("demandes_licence", "pieces_jointes")
