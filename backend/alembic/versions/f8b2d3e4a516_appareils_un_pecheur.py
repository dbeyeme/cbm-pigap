"""appareils_un_pecheur

Un appareil, un seul compte pêcheur (ADR-012) : table des appareils rattachés
(empreinte seule, jamais l'identifiant), référence facultative de l'appareil
sur les positions, nombre d'appareils autorisés par pêcheur.

Migration additive. Chaque étape vérifie l'existant : une base dont les tables
ont été créées par les tests (`create_all`) se met à niveau sans erreur.

Revision ID: f8b2d3e4a516
Revises: e7a1c2d3f405
Create Date: 2026-11-24 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f8b2d3e4a516"
down_revision: str | None = "e7a1c2d3f405"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _hors_ligne() -> bool:
    """Génération de SQL sans connexion : rien n'est inspecté, tout est créé."""
    return bool(op.get_context().as_sql)


def _table_existe(table: str) -> bool:
    return not _hors_ligne() and sa.inspect(op.get_bind()).has_table(table)


def _colonnes(table: str) -> set[str]:
    if not _table_existe(table):
        return set()
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _index(table: str) -> set[str]:
    if not _table_existe(table):
        return set()
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$ BEGIN
                CREATE TYPE etat_appareil AS ENUM ('actif', 'libere');
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )
    etat_appareil = postgresql.ENUM(name="etat_appareil", create_type=False)

    if not _table_existe("appareils"):
        op.create_table(
            "appareils",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("empreinte", sa.String(length=64), nullable=False),
            sa.Column("origine", sa.String(length=16), nullable=True),
            sa.Column("utilisateur_id", sa.UUID(), nullable=False),
            sa.Column("etat", etat_appareil, server_default="actif", nullable=False),
            sa.Column(
                "premiere_utilisation",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "derniere_utilisation",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("libere_par_id", sa.UUID(), nullable=True),
            sa.Column("libere_le", sa.DateTime(timezone=True), nullable=True),
            sa.Column("motif_liberation", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["utilisateur_id"], ["utilisateurs.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["libere_par_id"], ["utilisateurs.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
    index_appareils = _index("appareils")
    if "ix_appareils_utilisateur_id" not in index_appareils:
        op.create_index("ix_appareils_utilisateur_id", "appareils", ["utilisateur_id"])
    if "uq_appareils_empreinte_actif" not in index_appareils:
        # Un appareil n'a qu'un rattachement actif à la fois (règle R1)
        op.create_index(
            "uq_appareils_empreinte_actif",
            "appareils",
            ["empreinte"],
            unique=True,
            postgresql_where=sa.text("etat = 'actif'"),
        )

    if "appareil_id" not in _colonnes("positions"):
        op.add_column("positions", sa.Column("appareil_id", sa.UUID(), nullable=True))
        op.create_foreign_key(
            "fk_positions_appareil_id",
            "positions",
            "appareils",
            ["appareil_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if "ix_positions_appareil_id" not in _index("positions"):
        op.create_index("ix_positions_appareil_id", "positions", ["appareil_id"])

    if "appareils_autorises" not in _colonnes("pecheurs"):
        op.add_column("pecheurs", sa.Column("appareils_autorises", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("pecheurs", "appareils_autorises")
    # Retirer la colonne retire aussi son index et sa clé étrangère, quel que soit le nom
    # que la base leur a donné (migration ou création par les tests).
    op.drop_column("positions", "appareil_id")
    op.drop_table("appareils")
    op.execute(sa.text("DROP TYPE IF EXISTS etat_appareil"))
