"""m3_zones_gist_index

Index spatial GIST sur zones_reglementees.geometrie pour ST_Intersects (M3).

Revision ID: c3a9f2e80122
Revises: b7e4a1c90211
Create Date: 2026-07-27 23:30:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "c3a9f2e80122"
down_revision: str | None = "b7e4a1c90211"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # GeoAlchemy2 peut déjà créer cet index via create_all ; IF NOT EXISTS pour idempotence.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_zones_reglementees_geometrie "
        "ON zones_reglementees USING GIST (geometrie)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_zones_reglementees_geometrie")
