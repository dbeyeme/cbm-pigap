"""agent_zones_affectation

Affectation agent de contrôle ↔ zones de périmètre (§7 : agent voit sa zone).

Revision ID: a1b2c3d4e580
Revises: f5b8c9d0e371
Create Date: 2026-11-27 04:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e580"
down_revision: str | None = "f5b8c9d0e371"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_zones",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "utilisateur_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("utilisateurs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "zone_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("perimetre_zones.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "date_creation",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("utilisateur_id", "zone_id", name="uq_agent_zones_user_zone"),
    )
    op.create_index("ix_agent_zones_utilisateur_id", "agent_zones", ["utilisateur_id"])
    op.create_index("ix_agent_zones_zone_id", "agent_zones", ["zone_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_zones_zone_id", table_name="agent_zones")
    op.drop_index("ix_agent_zones_utilisateur_id", table_name="agent_zones")
    op.drop_table("agent_zones")
