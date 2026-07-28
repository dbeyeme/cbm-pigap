"""organisations_robustes_m1

Revision ID: b7e4a1c90211
Revises: 34280c301303
Create Date: 2026-07-27 18:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7e4a1c90211"
down_revision: str | None = "34280c301303"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organisations",
        sa.Column("nom_commercial", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "organisations", sa.Column("type_organisation", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "organisations", sa.Column("forme_juridique", sa.String(length=128), nullable=True)
    )
    op.add_column(
        "organisations", sa.Column("numero_registre", sa.String(length=128), nullable=True)
    )
    op.add_column("organisations", sa.Column("numero_fiscal", sa.String(length=128), nullable=True))
    op.add_column("organisations", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("organisations", sa.Column("telephone", sa.String(length=32), nullable=True))
    op.add_column(
        "organisations", sa.Column("telephone_secondaire", sa.String(length=32), nullable=True)
    )
    op.add_column("organisations", sa.Column("site_web", sa.String(length=512), nullable=True))
    op.add_column(
        "organisations", sa.Column("adresse_ligne1", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "organisations", sa.Column("adresse_ligne2", sa.String(length=255), nullable=True)
    )
    op.add_column("organisations", sa.Column("ville", sa.String(length=128), nullable=True))
    op.add_column(
        "organisations", sa.Column("province_region", sa.String(length=128), nullable=True)
    )
    op.add_column("organisations", sa.Column("code_postal", sa.String(length=32), nullable=True))
    op.add_column(
        "organisations",
        sa.Column("pays", sa.String(length=2), server_default="GA", nullable=False),
    )
    op.add_column("organisations", sa.Column("zone_activite", sa.String(length=255), nullable=True))
    op.add_column(
        "organisations",
        sa.Column(
            "attributs",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column("organisations", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column(
        "organisations",
        sa.Column("actif", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column(
        "organisations",
        sa.Column(
            "date_mise_a_jour",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_organisations_nom"), "organisations", ["nom"], unique=False)
    op.create_index(
        op.f("ix_organisations_numero_registre"),
        "organisations",
        ["numero_registre"],
        unique=False,
    )
    op.create_index(op.f("ix_organisations_ville"), "organisations", ["ville"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_organisations_ville"), table_name="organisations")
    op.drop_index(op.f("ix_organisations_numero_registre"), table_name="organisations")
    op.drop_index(op.f("ix_organisations_nom"), table_name="organisations")
    op.drop_column("organisations", "date_mise_a_jour")
    op.drop_column("organisations", "actif")
    op.drop_column("organisations", "notes")
    op.drop_column("organisations", "attributs")
    op.drop_column("organisations", "zone_activite")
    op.drop_column("organisations", "pays")
    op.drop_column("organisations", "code_postal")
    op.drop_column("organisations", "province_region")
    op.drop_column("organisations", "ville")
    op.drop_column("organisations", "adresse_ligne2")
    op.drop_column("organisations", "adresse_ligne1")
    op.drop_column("organisations", "site_web")
    op.drop_column("organisations", "telephone_secondaire")
    op.drop_column("organisations", "telephone")
    op.drop_column("organisations", "email")
    op.drop_column("organisations", "numero_fiscal")
    op.drop_column("organisations", "numero_registre")
    op.drop_column("organisations", "forme_juridique")
    op.drop_column("organisations", "type_organisation")
    op.drop_column("organisations", "nom_commercial")
