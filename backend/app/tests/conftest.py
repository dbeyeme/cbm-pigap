"""Fixtures de test M1 — base PostGIS + agent JWT."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.db.models  # noqa: F401
from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.db.session import get_db
from app.main import app


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


@pytest_asyncio.fixture
async def agent_headers(engine) -> dict[str, str]:
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        email = f"agent-{uuid.uuid4().hex[:8]}@example.com"
        agent = Utilisateur(
            nom="Agent Test",
            role=RoleUtilisateur.agent_controle,
            email=email,
            telephone=f"+2410{uuid.uuid4().int % 10_000_000:07d}",
            mot_de_passe_hash=hash_password("AgentPass123!"),
        )
        session.add(agent)
        await session.commit()
        await session.refresh(agent)
        token = create_access_token(subject=agent.id, role=agent.role.value)
    return {"Authorization": f"Bearer {token}"}
