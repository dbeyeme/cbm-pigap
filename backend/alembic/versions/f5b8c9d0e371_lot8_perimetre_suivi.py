"""lot8_perimetre_suivi

Lot 8 (ADR-015) : périmètre de suivi multi-zones, table perimetre_zones, seed défauts.
Emprises polygonales approximatives (fictif, à valider DGPA).

Revision ID: f5b8c9d0e371
Revises: e4a7b8c9d260
Create Date: 2026-11-27 04:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "f5b8c9d0e371"
down_revision: str | None = "e4a7b8c9d260"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TYPES = ("pays", "province", "ville", "cote", "fleuve")

# WKT POLYGON (lon lat), emprises fictives à valider
_ZONES = (
    (
        "gabon",
        "Gabon",
        "pays",
        "POLYGON((8.0 -4.0, 14.5 -4.0, 14.5 2.5, 8.0 2.5, 8.0 -4.0))",
    ),
    (
        "estuaire",
        "Estuaire",
        "cote",
        "POLYGON((9.0 0.0, 9.8 0.0, 9.8 0.9, 9.0 0.9, 9.0 0.0))",
    ),
    (
        "libreville",
        "Libreville",
        "ville",
        "POLYGON((9.35 0.35, 9.55 0.35, 9.55 0.55, 9.35 0.55, 9.35 0.35))",
    ),
    (
        "owendo",
        "Owendo",
        "ville",
        "POLYGON((9.45 0.25, 9.55 0.25, 9.55 0.40, 9.45 0.40, 9.45 0.25))",
    ),
    (
        "akanda",
        "Akanda",
        "ville",
        "POLYGON((9.40 0.55, 9.60 0.55, 9.60 0.75, 9.40 0.75, 9.40 0.55))",
    ),
    (
        "cap_esterias",
        "Cap Estérias",
        "cote",
        "POLYGON((9.25 0.55, 9.40 0.55, 9.40 0.70, 9.25 0.70, 9.25 0.55))",
    ),
)


def _hors_ligne() -> bool:
    return bool(op.get_context().as_sql)


def _table_existe(table: str) -> bool:
    return not _hors_ligne() and sa.inspect(op.get_bind()).has_table(table)


def upgrade() -> None:
    valeurs = ", ".join(f"'{v}'" for v in _TYPES)
    op.execute(
        sa.text(
            f"""
            DO $$ BEGIN
                CREATE TYPE type_perimetre AS ENUM ({valeurs});
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )

    if not _table_existe("perimetre_zones"):
        type_perimetre = postgresql.ENUM(*_TYPES, name="type_perimetre", create_type=False)
        op.create_table(
            "perimetre_zones",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("code", sa.String(64), nullable=False),
            sa.Column("libelle", sa.String(255), nullable=False),
            sa.Column("type_zone", type_perimetre, nullable=False),
            sa.Column("actif", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column(
                "emprise",
                Geometry(geometry_type="POLYGON", srid=4326),
                nullable=False,
            ),
            sa.Column(
                "date_creation",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "date_mise_a_jour",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.UniqueConstraint("code", name="uq_perimetre_zones_code"),
        )
        op.create_index("ix_perimetre_zones_code", "perimetre_zones", ["code"], unique=False)
        op.create_index(
            "ix_perimetre_zones_emprise",
            "perimetre_zones",
            ["emprise"],
            unique=False,
            postgresql_using="gist",
        )

    if _hors_ligne():
        return

    bind = op.get_bind()
    for code, libelle, type_zone, wkt in _ZONES:
        existe = bind.execute(
            sa.text("SELECT 1 FROM perimetre_zones WHERE code = :code LIMIT 1"),
            {"code": code},
        ).first()
        if existe:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO perimetre_zones (id, code, libelle, type_zone, actif, emprise)
                VALUES (
                    gen_random_uuid(),
                    :code,
                    :libelle,
                    CAST(:type_zone AS type_perimetre),
                    true,
                    ST_SetSRID(ST_GeomFromText(:wkt), 4326)
                )
                """
            ),
            {"code": code, "libelle": libelle, "type_zone": type_zone, "wkt": wkt},
        )


def downgrade() -> None:
    if _table_existe("perimetre_zones"):
        op.drop_index("ix_perimetre_zones_emprise", table_name="perimetre_zones")
        op.drop_index("ix_perimetre_zones_code", table_name="perimetre_zones")
        op.drop_table("perimetre_zones")
    op.execute(sa.text("DROP TYPE IF EXISTS type_perimetre"))