"""lot11_sorties

Sorties en mer déclarées (lot 11, ADR-016, statut Proposé).

Revision ID: b7c8d9e0f611
Revises: a1b2c3d4e580
Create Date: 2026-11-27 12:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7c8d9e0f611"
down_revision: str | None = "a1b2c3d4e580"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Garde d'existence : la table peut déjà avoir été créée par `create_all`
    if sa.inspect(op.get_bind()).has_table("sorties"):
        return
    op.create_table(
        "sorties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "pecheur_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pecheurs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "embarcation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("embarcations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "declare_par_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("utilisateurs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("port_depart_id", sa.String(64), nullable=True),
        sa.Column(
            "position_depart",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column("depart_a", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retour_prevu_a", sa.DateTime(timezone=True), nullable=False),
        sa.Column("secteur_vise", sa.String(64), nullable=True),
        sa.Column("retour_a", sa.DateTime(timezone=True), nullable=True),
        sa.Column("port_retour_id", sa.String(64), nullable=True),
        sa.Column(
            "position_retour",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=True,
        ),
        sa.Column("retour_constate_par", sa.String(32), nullable=True),
        sa.Column(
            "retour_constate_par_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("utilisateurs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "alerte_retard_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("alertes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "date_creation",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("pecheur_id", "client_id", name="uq_sorties_pecheur_client"),
    )
    op.create_index("ix_sorties_embarcation_id", "sorties", ["embarcation_id"])
    op.create_index("ix_sorties_depart_a", "sorties", ["depart_a"])
    op.create_index("ix_sorties_retour_prevu_a", "sorties", ["retour_prevu_a"])
    op.create_index(
        "uq_sorties_embarcation_en_cours",
        "sorties",
        ["embarcation_id"],
        unique=True,
        postgresql_where=sa.text("retour_a IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_sorties_embarcation_en_cours", table_name="sorties")
    op.drop_index("ix_sorties_retour_prevu_a", table_name="sorties")
    op.drop_index("ix_sorties_depart_a", table_name="sorties")
    op.drop_index("ix_sorties_embarcation_id", table_name="sorties")
    op.drop_table("sorties")
