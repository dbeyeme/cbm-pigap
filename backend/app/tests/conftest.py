"""Fixtures de test : base PostGIS dédiée aux tests (ADR-013) + agent JWT."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio

from app.tests import base_de_test

# Avant tout import applicatif : la configuration lira l'adresse de la base de test.
try:
    BASE_DE_DEV, BASE_DE_TEST = base_de_test.preparer()
except base_de_test.BaseDeTestRefusee as refus:
    pytest.exit(str(refus), returncode=4)

# ruff: noqa: E402
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.db.models  # noqa: F401
from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.db.session import get_db
from app.main import app


def pytest_sessionstart(session: pytest.Session) -> None:
    """Base de test remise à zéro puis migrée (`alembic upgrade head`) à chaque passage."""
    # La configuration applicative doit bien viser la base de test, jamais celle de dev.
    base_de_test.verifier(BASE_DE_DEV, make_url(settings.database_url))
    base_de_test.recreer(BASE_DE_TEST)
    base_de_test.migrer()


def pytest_report_header(config: pytest.Config) -> str:
    return f"base de test : {base_de_test.decrire(BASE_DE_TEST)}"


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(settings.database_url, pool_pre_ping=True)
    async with eng.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def client(engine) -> AsyncGenerator[AsyncClient, None]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _headers_pour_role(engine, role: RoleUtilisateur, nom: str) -> dict[str, str]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        email = f"{role.value}-{uuid.uuid4().hex[:8]}@example.com"
        user = Utilisateur(
            nom=nom,
            role=role,
            email=email,
            telephone=f"+2410{uuid.uuid4().int % 10_000_000:07d}",
            mot_de_passe_hash=hash_password("AgentPass123!"),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        if role == RoleUtilisateur.agent_controle:
            from app.modules.perimetre import service as perimetre_service

            await perimetre_service.assurer_affectation_defaut_agent(session, user.id)
        token = create_access_token(subject=user.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def agent_headers(engine) -> dict[str, str]:
    """Agent avec zone `gabon` par défaut (lecture flotte ; pas d'écriture GPS)."""
    return await _headers_pour_role(engine, RoleUtilisateur.agent_controle, "Agent Test")


@pytest_asyncio.fixture
async def admin_headers(engine) -> dict[str, str]:
    """Admin : écriture GPS outillage + administration périmètre."""
    return await _headers_pour_role(engine, RoleUtilisateur.admin, "Admin Test")
