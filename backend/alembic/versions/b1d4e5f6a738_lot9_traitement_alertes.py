"""lot9_traitement_alertes

Lot 9 du chantier de novembre 2026 : état de traitement des alertes et journal
de traçabilité.

Migration additive : une colonne `alertes.etat_traitement`, renseignée pour les
alertes existantes à partir de leur statut (nouvelle : à traiter ; traitee :
clôturée, fondée ; ignoree : clôturée, non fondée), et une table
`alertes_journal`. Un déclencheur refuse toute mise à jour et toute suppression
dans le journal : il n'est jamais modifiable ni supprimable.

Revision ID: b1d4e5f6a738
Revises: a9c3e4f5b627
Create Date: 2026-11-24 17:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b1d4e5f6a738"
down_revision: str | None = "a9c3e4f5b627"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FONCTION = "alertes_journal_inalterable"
_DECLENCHEUR = "tr_alertes_journal_inalterable"


def _hors_ligne() -> bool:
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
    if "etat_traitement" not in _colonnes("alertes"):
        op.add_column(
            "alertes",
            sa.Column(
                "etat_traitement",
                sa.String(length=32),
                nullable=False,
                server_default=sa.text("'a_traiter'"),
            ),
        )
        # Reprise de l'existant, une seule fois, depuis le statut historique
        op.execute(
            "UPDATE alertes SET etat_traitement = CASE statut::text "
            "WHEN 'traitee' THEN 'cloturee_fondee' "
            "WHEN 'ignoree' THEN 'cloturee_non_fondee' "
            "ELSE 'a_traiter' END"
        )
    if "ix_alertes_etat_traitement" not in _index("alertes"):
        op.create_index("ix_alertes_etat_traitement", "alertes", ["etat_traitement"])

    if not _table_existe("alertes_journal"):
        op.create_table(
            "alertes_journal",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "alerte_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("alertes.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("etat_avant", sa.String(length=32), nullable=False),
            sa.Column("etat_apres", sa.String(length=32), nullable=False),
            sa.Column("commentaire", sa.Text(), nullable=False),
            sa.Column(
                "auteur_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("utilisateurs.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("auteur_nom", sa.String(length=255), nullable=False),
            sa.Column("auteur_role", sa.String(length=32), nullable=False),
            sa.Column("origine", sa.String(length=32), nullable=False),
            sa.Column(
                "horodatage",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
    for nom, colonne in (
        ("ix_alertes_journal_alerte_id", "alerte_id"),
        ("ix_alertes_journal_horodatage", "horodatage"),
    ):
        if nom not in _index("alertes_journal"):
            op.create_index(nom, "alertes_journal", [colonne])

    # Journal inaltérable : toute mise à jour ou suppression est refusée par la base.
    # La mise à NULL de l'auteur par la suppression d'un compte reste permise.
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION {_FONCTION}() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'UPDATE'
               AND NEW.id = OLD.id AND NEW.alerte_id = OLD.alerte_id
               AND NEW.etat_avant = OLD.etat_avant AND NEW.etat_apres = OLD.etat_apres
               AND NEW.commentaire = OLD.commentaire AND NEW.auteur_nom = OLD.auteur_nom
               AND NEW.auteur_role = OLD.auteur_role AND NEW.origine = OLD.origine
               AND NEW.horodatage = OLD.horodatage AND NEW.auteur_id IS NULL THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'Journal des alertes : ni modification, ni suppression';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(f"DROP TRIGGER IF EXISTS {_DECLENCHEUR} ON alertes_journal")
    op.execute(
        f"CREATE TRIGGER {_DECLENCHEUR} BEFORE UPDATE OR DELETE ON alertes_journal "
        f"FOR EACH ROW EXECUTE FUNCTION {_FONCTION}()"
    )
    # Vidage de la table entière : refusé lui aussi
    op.execute(f"DROP TRIGGER IF EXISTS {_DECLENCHEUR}_vidage ON alertes_journal")
    op.execute(
        f"CREATE TRIGGER {_DECLENCHEUR}_vidage BEFORE TRUNCATE ON alertes_journal "
        f"FOR EACH STATEMENT EXECUTE FUNCTION {_FONCTION}()"
    )


def downgrade() -> None:
    # Retour arrière documenté : il efface le journal ; à ne lancer qu'après sauvegarde.
    op.execute(f"DROP TRIGGER IF EXISTS {_DECLENCHEUR}_vidage ON alertes_journal")
    op.execute(f"DROP TRIGGER IF EXISTS {_DECLENCHEUR} ON alertes_journal")
    op.execute(f"DROP FUNCTION IF EXISTS {_FONCTION}()")
    op.drop_table("alertes_journal")
    op.drop_index("ix_alertes_etat_traitement", table_name="alertes")
    op.drop_column("alertes", "etat_traitement")
