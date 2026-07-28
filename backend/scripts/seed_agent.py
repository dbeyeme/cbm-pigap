"""Seed d'un agent de contrôle fictif (dev uniquement)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.db.session import AsyncSessionLocal


async def main() -> None:
    email = "agent@example.com"
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(Utilisateur).where(Utilisateur.email == email))
        if existing.scalar_one_or_none():
            print(f"Agent déjà présent : {email} / AgentPass123!")
            return
        agent = Utilisateur(
            nom="Agent Démo",
            role=RoleUtilisateur.agent_controle,
            email=email,
            telephone="+24106000001",
            mot_de_passe_hash=hash_password("AgentPass123!"),
        )
        session.add(agent)
        await session.commit()
        print(f"Agent créé : {email} / AgentPass123!")


if __name__ == "__main__":
    asyncio.run(main())
