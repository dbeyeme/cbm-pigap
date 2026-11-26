"""Renouvellement de session de l'application mobile (demande S1 du lot mobile).

Le jeton d'accès vaut une heure. Sur une sortie en mer, le téléphone reste
parfois sans réseau plus longtemps : à la connexion, l'application peut demander
une session longue et reçoit un jeton de renouvellement, qu'elle échange contre
un nouveau jeton d'accès sans redemander le mot de passe.

Règles au statut « Proposé » (valideur : Christian), dans `sessions.json` :
rôles admis, durée. Principes de sûreté :

- seule l'empreinte du jeton est conservée (secret du serveur), jamais sa valeur ;
- chaque renouvellement remplace le jeton (rotation) ; la réutilisation d'un
  jeton déjà employé, signe d'une copie, ferme toute la session ;
- pour un pêcheur, la session reste liée au téléphone rattaché (ADR-012) : un
  autre téléphone ne la renouvelle pas, et un téléphone libéré par un agent la
  ferme, ce qui impose une nouvelle connexion et donc le contrôle d'appareil.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from fastapi import status
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, forbidden
from app.core.regles import charger_regles, regle_invalide
from app.db.enums import EtatAppareil, RoleUtilisateur
from app.db.models import Appareil, JetonRenouvellement, Utilisateur
from app.modules.appareils import service as appareils

logger = structlog.get_logger(__name__)
FICHIER = "sessions"


class RegleSessions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    roles: list[RoleUtilisateur]
    duree_jours: int = Field(..., ge=1, le=366)


def regle_sessions() -> RegleSessions:
    contenu = charger_regles(FICHIER)
    try:
        return RegleSessions.model_validate(contenu.get("renouvellement"))
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc


def _empreinte(jeton: str) -> str:
    return hmac.new(
        appareils._cle_secrete(), b"pigap-session:" + jeton.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _refus(code: str, message: str) -> ApiError:
    return ApiError(status.HTTP_401_UNAUTHORIZED, message, code)


def session_longue_admise(user: Utilisateur) -> bool:
    return user.role in regle_sessions().roles


def emettre(
    db: AsyncSession,
    user: Utilisateur,
    *,
    appareil_empreinte: str | None,
    famille: uuid.UUID | None = None,
) -> tuple[str, datetime]:
    """Nouveau jeton de renouvellement : sa valeur (à remettre une seule fois) et son échéance."""
    regle = regle_sessions()
    jeton = secrets.token_urlsafe(48)
    echeance = datetime.now(UTC) + timedelta(days=regle.duree_jours)
    db.add(
        JetonRenouvellement(
            utilisateur_id=user.id,
            famille=famille or uuid.uuid4(),
            empreinte=_empreinte(jeton),
            appareil_empreinte=appareil_empreinte,
            expire_a=echeance,
        )
    )
    return jeton, echeance


async def _fermer_famille(db: AsyncSession, famille: uuid.UUID) -> None:
    await db.execute(
        update(JetonRenouvellement)
        .where(JetonRenouvellement.famille == famille, JetonRenouvellement.revoque_a.is_(None))
        .values(revoque_a=datetime.now(UTC))
    )


async def renouveler(
    db: AsyncSession, jeton: str, appareil_brut: str | None
) -> tuple[Utilisateur, str, datetime, bool]:
    """Échange un jeton de renouvellement valide ; renvoie le compte et le jeton suivant."""
    maintenant = datetime.now(UTC)
    ligne = (
        await db.execute(
            select(JetonRenouvellement)
            .where(JetonRenouvellement.empreinte == _empreinte(jeton))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if ligne is None:
        raise _refus("SESSION_INVALIDE", "Session inconnue : reconnectez-vous.")
    if ligne.revoque_a is not None:
        raise _refus("SESSION_FERMEE", "Cette session a été fermée : reconnectez-vous.")
    if ligne.utilise_a is not None:
        # Jeton déjà échangé une fois : une copie circule, toute la session est fermée
        await _fermer_famille(db, ligne.famille)
        await db.commit()
        logger.warning("session_jeton_reutilise", utilisateur=str(ligne.utilisateur_id))
        raise _refus("SESSION_FERMEE", "Cette session a été fermée : reconnectez-vous.")
    if ligne.expire_a <= maintenant:
        raise _refus("SESSION_EXPIREE", "Session expirée : reconnectez-vous.")

    user = await db.get(Utilisateur, ligne.utilisateur_id)
    if user is None or not session_longue_admise(user):
        raise _refus("SESSION_INVALIDE", "Session inconnue : reconnectez-vous.")

    appareil_rattache = False
    if ligne.appareil_empreinte is not None:
        lu = appareils.lire_identifiant(appareil_brut)
        if lu is None or appareils.empreinte(lu[0]) != ligne.appareil_empreinte:
            raise forbidden(
                "Cette session appartient à un autre téléphone : reconnectez-vous depuis "
                "celui-ci.",
                "APPAREIL_NON_RATTACHE",
            )
        actif = (
            await db.execute(
                select(Appareil.id).where(
                    Appareil.empreinte == ligne.appareil_empreinte,
                    Appareil.utilisateur_id == user.id,
                    Appareil.etat == EtatAppareil.actif,
                )
            )
        ).scalar_one_or_none()
        if actif is None:
            # Téléphone libéré par un agent : la connexion doit repasser le contrôle d'appareil
            await _fermer_famille(db, ligne.famille)
            await db.commit()
            raise _refus(
                "SESSION_FERMEE",
                "Ce téléphone n'est plus rattaché à votre compte : reconnectez-vous.",
            )
        appareil_rattache = True

    ligne.utilise_a = maintenant
    suivant, echeance = emettre(
        db, user, appareil_empreinte=ligne.appareil_empreinte, famille=ligne.famille
    )
    await db.commit()
    return user, suivant, echeance, appareil_rattache


async def fermer(db: AsyncSession, jeton: str) -> None:
    """Déconnexion : ferme la session du jeton présenté ; sans effet s'il est inconnu."""
    ligne = (
        await db.execute(
            select(JetonRenouvellement).where(JetonRenouvellement.empreinte == _empreinte(jeton))
        )
    ).scalar_one_or_none()
    if ligne is not None:
        await _fermer_famille(db, ligne.famille)
        await db.commit()


def appareil_de_connexion(appareil: Any) -> str | None:
    return getattr(appareil, "empreinte", None)
