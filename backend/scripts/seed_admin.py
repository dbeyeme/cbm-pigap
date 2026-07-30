"""Seed / reset d'un administrateur fictif (dev / staging).

  python scripts/seed_admin.py
  python scripts/seed_admin.py --reset   # remet le mot de passe AdminPass123!
"""

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

EMAIL = "admin@example.com"
PASSWORD = "AdminPass123!"


async def main() -> None:
    reset = "--reset" in sys.argv
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(Utilisateur).where(Utilisateur.email == EMAIL))
        admin = existing.scalar_one_or_none()
        if admin is not None:
            if reset:
                admin.mot_de_passe_hash = hash_password(PASSWORD)
                admin.role = RoleUtilisateur.admin
                await session.commit()
                print(f"Admin réinitialisé : {EMAIL} / {PASSWORD}")
            else:
                print(f"Admin déjà présent : {EMAIL} (utilisez --reset pour remettre {PASSWORD})")
            return
        admin = Utilisateur(
            nom="Admin Démo",
            role=RoleUtilisateur.admin,
            email=EMAIL,
            telephone="+24106000000",
            mot_de_passe_hash=hash_password(PASSWORD),
        )
        session.add(admin)
        await session.commit()
        print(f"Admin créé : {EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
