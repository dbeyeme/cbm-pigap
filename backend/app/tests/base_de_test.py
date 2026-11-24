"""Base PostgreSQL et PostGIS dédiée aux tests (ADR-013).

Ce module ne doit importer aucun module applicatif : il fixe l'adresse de la
base avant que la configuration de l'application ne soit lue, si bien que
toutes les sessions ouvertes pendant les tests (y compris celles que des
services ouvrent eux-mêmes) visent la base de test.

Adresse retenue :
1. variable `TEST_DATABASE_URL` (environnement ou fichier `.env`) ;
2. à défaut, l'adresse de développement `DATABASE_URL` avec le nom de base
   suffixé de `_test` (par exemple `pigap` devient `pigap_test`).

Garde-fou, échec fermé : la base visée doit porter un nom terminé par `_test`
et différer de la base de développement. Sinon les tests ne démarrent pas.

À chaque passage, la base de test est supprimée, recréée, puis migrée par
`alembic upgrade head`. Aucune adresse complète n'est jamais affichée (elle
contient le mot de passe) : seuls l'hôte, le port et le nom de base le sont.
"""

from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

SUFFIXE = "_test"
DOSSIER_BACKEND = Path(__file__).resolve().parents[2]


class BaseDeTestRefusee(RuntimeError):
    """La base visée ne peut pas servir aux tests."""


class _Adresses(BaseSettings):
    """Lecture minimale, avec les mêmes fichiers que la configuration applicative."""

    model_config = SettingsConfigDict(
        env_file=(DOSSIER_BACKEND / ".env", DOSSIER_BACKEND.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://pigap:pigap_dev_change_me@localhost:5432/pigap"
    test_database_url: str | None = None


def _asyncpg(url: str) -> URL:
    adresse = make_url(url)
    if adresse.drivername in ("postgres", "postgresql", "postgresql+psycopg"):
        adresse = adresse.set(drivername="postgresql+asyncpg")
    return adresse


def decrire(adresse: URL) -> str:
    """Description sans mot de passe ni identifiant."""
    return f"{adresse.host}:{adresse.port or 5432}/{adresse.database}"


def adresses() -> tuple[URL, URL]:
    """(adresse de développement, adresse de test), après garde-fou."""
    lues = _Adresses()
    dev = _asyncpg(lues.database_url)
    if lues.test_database_url:
        test = _asyncpg(lues.test_database_url)
    else:
        test = dev.set(database=f"{dev.database}{SUFFIXE}")
    verifier(dev, test)
    return dev, test


def verifier(dev: URL, test: URL) -> None:
    nom = test.database or ""
    if not nom.endswith(SUFFIXE):
        raise BaseDeTestRefusee(
            f"La base de test {decrire(test)} doit porter un nom terminé par « {SUFFIXE} »."
        )
    meme_serveur = (dev.host, dev.port or 5432) == (test.host, test.port or 5432)
    if meme_serveur and nom == dev.database:
        raise BaseDeTestRefusee(
            f"La base de test {decrire(test)} est la base de développement : refus."
        )


def recreer(test: URL) -> None:
    """Supprime puis recrée la base de test, extension PostGIS comprise."""
    import psycopg
    from psycopg import sql

    maintenance = test.set(drivername="postgresql", database="postgres")
    nom = test.database
    assert nom and nom.endswith(SUFFIXE)  # second verrou, au plus près de la suppression
    with psycopg.connect(
        maintenance.render_as_string(hide_password=False), autocommit=True
    ) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(nom)))
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(nom)))
    with psycopg.connect(
        test.set(drivername="postgresql").render_as_string(hide_password=False), autocommit=True
    ) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def migrer() -> None:
    """`alembic upgrade head` sur la base désignée par `DATABASE_URL`."""
    from alembic import command
    from alembic.config import Config

    # Sans fichier : `env.py` ne reconfigure pas la journalisation des tests.
    config = Config()
    config.set_main_option("script_location", str(DOSSIER_BACKEND / "alembic"))
    command.upgrade(config, "head")


def preparer() -> tuple[URL, URL]:
    """Fixe `DATABASE_URL` sur la base de test ; à appeler avant tout import applicatif.

    Renvoie (adresse de développement, adresse de test), lues avant la substitution.
    """
    dev, test = adresses()
    os.environ["DATABASE_URL"] = test.render_as_string(hide_password=False)
    return dev, test
