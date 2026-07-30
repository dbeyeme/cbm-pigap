"""demandes_licence

Table demandes_licence — inscription FO (personne physique / morale).

Revision ID: d4b8e3f91233
Revises: c3a9f2e80122
Create Date: 2026-07-30 06:20:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4b8e3f91233"
down_revision: str | None = "c3a9f2e80122"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Idempotent : une première tentative a pu créer les ENUM sans stamp Alembic.
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE type_demande_licence AS ENUM ('personne_physique', 'personne_morale'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    )
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE statut_demande_licence AS ENUM ('en_attente', 'approuvee', 'refusee'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS demandes_licence (
            id UUID NOT NULL PRIMARY KEY,
            type_demande type_demande_licence NOT NULL,
            statut statut_demande_licence NOT NULL DEFAULT 'en_attente',
            nom VARCHAR(255),
            prenom VARCHAR(255),
            telephone VARCHAR(32),
            email VARCHAR(255),
            org_nom VARCHAR(255),
            org_type VARCHAR(64),
            numero_registre VARCHAR(128),
            org_email VARCHAR(255),
            org_telephone VARCHAR(32),
            org_ville VARCHAR(128),
            org_adresse VARCHAR(255),
            zone_activite VARCHAR(255),
            embarcation_nom VARCHAR(255),
            embarcation_immatriculation VARCHAR(64),
            embarcation_type VARCHAR(64),
            message TEXT,
            motif_refus TEXT,
            pecheur_id UUID REFERENCES pecheurs(id) ON DELETE SET NULL,
            organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
            traite_par_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
            date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
            date_traitement TIMESTAMPTZ
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_demandes_licence_statut ON demandes_licence (statut)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_demandes_licence_email ON demandes_licence (email)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_demandes_licence_date_creation "
        "ON demandes_licence (date_creation)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_demandes_licence_date_creation")
    op.execute("DROP INDEX IF EXISTS ix_demandes_licence_email")
    op.execute("DROP INDEX IF EXISTS ix_demandes_licence_statut")
    op.execute("DROP TABLE IF EXISTS demandes_licence")
    op.execute("DROP TYPE IF EXISTS statut_demande_licence")
    op.execute("DROP TYPE IF EXISTS type_demande_licence")
