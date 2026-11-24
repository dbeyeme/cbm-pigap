"""lot2_identite_profil

Lot 2 du chantier de novembre 2026 : informations d'inscription complémentaires
de l'embarcation (MMSI, numéro OMI, indicatif radio, jauge, année de
construction, propriétaire, exploitant), reprises sur les demandes de licence,
et page de profil d'un acteur.

Migration additive : colonnes facultatives et table nouvelle. Chaque étape
vérifie l'existant : une base dont les tables ont été créées par les tests
(`create_all`) se met à niveau sans erreur.

Revision ID: a9c3e4f5b627
Revises: f8b2d3e4a516
Create Date: 2026-11-24 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a9c3e4f5b627"
down_revision: str | None = "f8b2d3e4a516"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLONNES_EMBARCATION: tuple[tuple[str, sa.types.TypeEngine], ...] = (
    ("mmsi", sa.String(length=9)),
    ("numero_omi", sa.String(length=7)),
    ("indicatif_radio", sa.String(length=16)),
    ("jauge_brute", sa.Float()),
    ("annee_construction", sa.Integer()),
    ("proprietaire", sa.String(length=255)),
    ("exploitant", sa.String(length=255)),
)


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
    presentes = _colonnes("embarcations")
    for nom, type_colonne in _COLONNES_EMBARCATION:
        if nom not in presentes:
            op.add_column("embarcations", sa.Column(nom, type_colonne, nullable=True))
    index_embarcations = _index("embarcations")
    for nom in ("mmsi", "numero_omi"):
        if f"ix_embarcations_{nom}" not in index_embarcations:
            op.create_index(f"ix_embarcations_{nom}", "embarcations", [nom])

    if "embarcation_complements" not in _colonnes("demandes_licence"):
        op.add_column(
            "demandes_licence",
            sa.Column(
                "embarcation_complements",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
        )

    if not _table_existe("profils_acteur"):
        op.create_table(
            "profils_acteur",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("pecheur_id", sa.UUID(), nullable=True),
            sa.Column("organisation_id", sa.UUID(), nullable=True),
            sa.Column("presentation", sa.Text(), nullable=True),
            sa.Column(
                "especes_masquees",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "tarifs",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "tarifs_visibles", sa.Boolean(), server_default=sa.text("false"), nullable=False
            ),
            sa.Column(
                "ouvert_au_public", sa.Boolean(), server_default=sa.text("false"), nullable=False
            ),
            sa.Column("jeton_public", sa.String(length=64), nullable=True),
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
            sa.CheckConstraint(
                "(pecheur_id IS NOT NULL) <> (organisation_id IS NOT NULL)",
                name="ck_profils_acteur_un_seul_acteur",
            ),
            sa.ForeignKeyConstraint(["pecheur_id"], ["pecheurs.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("pecheur_id", name="uq_profils_acteur_pecheur"),
            sa.UniqueConstraint("organisation_id", name="uq_profils_acteur_organisation"),
            sa.UniqueConstraint("jeton_public", name="uq_profils_acteur_jeton_public"),
        )


def downgrade() -> None:
    op.drop_table("profils_acteur")
    op.drop_column("demandes_licence", "embarcation_complements")
    op.drop_index("ix_embarcations_numero_omi", table_name="embarcations")
    op.drop_index("ix_embarcations_mmsi", table_name="embarcations")
    for nom, _type in reversed(_COLONNES_EMBARCATION):
        op.drop_column("embarcations", nom)
