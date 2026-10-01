"""balise_id_embarcations

Identifiant de la balise satellitaire embarquée sur l'embarcation (ADR-009),
rapproché lors de l'ingestion des positions `source=balise`.

Revision ID: e7a1c2d3f405
Revises: d0f3c8b57899
Create Date: 2026-10-01 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7a1c2d3f405"
down_revision: str | None = "d0f3c8b57899"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("embarcations", sa.Column("balise_id", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_embarcations_balise_id", "embarcations", ["balise_id"])


def downgrade() -> None:
    op.drop_constraint("uq_embarcations_balise_id", "embarcations", type_="unique")
    op.drop_column("embarcations", "balise_id")
