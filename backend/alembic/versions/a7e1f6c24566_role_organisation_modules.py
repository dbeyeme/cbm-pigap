"""role_organisation_modules

Ajoute rôle organisation + utilisateurs.organisation_id.

Revision ID: a7e1f6c24566
Revises: f6d0e5b13455
Create Date: 2026-09-15 10:50:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7e1f6c24566"
down_revision: str | None = "f6d0e5b13455"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$ BEGIN
                ALTER TYPE role_utilisateur ADD VALUE IF NOT EXISTS 'organisation';
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )
    op.add_column(
        "utilisateurs",
        sa.Column("organisation_id", sa.UUID(), nullable=True),
    )
    op.create_index("ix_utilisateurs_organisation_id", "utilisateurs", ["organisation_id"])
    op.create_foreign_key(
        "fk_utilisateurs_organisation_id",
        "utilisateurs",
        "organisations",
        ["organisation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_utilisateurs_organisation_id", "utilisateurs", type_="foreignkey")
    op.drop_index("ix_utilisateurs_organisation_id", table_name="utilisateurs")
    op.drop_column("utilisateurs", "organisation_id")
    # Ne pas retirer la valeur d'enum PostgreSQL (irréversible proprement).
