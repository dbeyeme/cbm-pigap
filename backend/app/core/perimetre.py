"""Périmètre de données d'un compte : quelles embarcations et quels pêcheurs il voit.

Règle de cloisonnement (cahier §7, standards 13.1) :

- autorité, agent de contrôle, administrateur, chercheur : toute la flotte ;
- pêcheur : sa fiche et ses embarcations ;
- organisation : ses membres et leurs embarcations, tant qu'elle est active ;
- tout autre cas, compte sans rattachement ou organisation désactivée : rien
  (échec fermé).

Un objet hors périmètre se traite comme un objet inexistant (404).
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import RoleUtilisateur
from app.db.models import Embarcation, Organisation, Pecheur, Utilisateur

ROLES_PILOTAGE: frozenset[RoleUtilisateur] = frozenset(
    {
        RoleUtilisateur.autorite,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.admin,
        RoleUtilisateur.chercheur,
    }
)


@dataclass(frozen=True)
class Perimetre:
    """`tout` : aucune restriction. Sinon, seuls les identifiants listés sont visibles."""

    tout: bool
    pecheur_ids: frozenset[UUID] = frozenset()
    embarcation_ids: frozenset[UUID] = frozenset()

    def voit_pecheur(self, pecheur_id: UUID) -> bool:
        return self.tout or pecheur_id in self.pecheur_ids

    def voit_embarcation(self, embarcation_id: UUID) -> bool:
        return self.tout or embarcation_id in self.embarcation_ids


async def perimetre_de(db: AsyncSession, user: Utilisateur) -> Perimetre:
    if user.role in ROLES_PILOTAGE:
        return Perimetre(tout=True)

    if user.role == RoleUtilisateur.pecheur:
        filtre = Pecheur.utilisateur_id == user.id
    elif user.role == RoleUtilisateur.organisation and user.organisation_id is not None:
        organisation = await db.get(Organisation, user.organisation_id)
        if organisation is None or not organisation.actif:
            # Organisation désactivée : son compte ne lit plus les données de ses membres
            return Perimetre(tout=False)
        filtre = Pecheur.organisation_id == user.organisation_id
    else:
        return Perimetre(tout=False)

    pecheur_ids = frozenset((await db.execute(select(Pecheur.id).where(filtre))).scalars().all())
    if not pecheur_ids:
        return Perimetre(tout=False)
    embarcation_ids = frozenset(
        (await db.execute(select(Embarcation.id).where(Embarcation.pecheur_id.in_(pecheur_ids))))
        .scalars()
        .all()
    )
    return Perimetre(tout=False, pecheur_ids=pecheur_ids, embarcation_ids=embarcation_ids)
