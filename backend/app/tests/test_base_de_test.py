"""Garde-fou de la base de test (ADR-013) : jamais la base de développement."""

import pytest
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.tests.base_de_test import BaseDeTestRefusee, verifier

DEV = make_url("postgresql+asyncpg://u:p@localhost:5432/pigap")


@pytest.mark.parametrize(
    "adresse",
    [
        "postgresql+asyncpg://u:p@localhost:5432/pigap",  # la base de dev elle-même
        "postgresql+asyncpg://u:p@localhost/pigap",  # port implicite, même base
        "postgresql+asyncpg://u:p@localhost:5432/pigap_essai",  # nom sans suffixe
    ],
)
def test_garde_fou_refuse(adresse: str) -> None:
    with pytest.raises(BaseDeTestRefusee):
        verifier(DEV, make_url(adresse))


def test_garde_fou_accepte_base_suffixee() -> None:
    verifier(DEV, make_url("postgresql+asyncpg://u:p@localhost:5432/pigap_test"))


def test_session_vise_la_base_de_test() -> None:
    assert (make_url(settings.database_url).database or "").endswith("_test")
