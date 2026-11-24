"""Client HTTP unique vers l'API de Global Fishing Watch (ADR-011).

Seul endroit du serveur qui manipule le jeton. Garanties :

- à l'arrêt par défaut : aucun appel si `GFW_ENABLED` est faux ou si le jeton manque ;
- un seul rapport à la fois (verrou), comme l'éditeur l'exige pour un jeton ;
- cache en mémoire des réponses, avec leur date de récupération ; une réponse
  périmée est resservie, signalée comme telle, quand l'éditeur ne répond plus ;
- budget de requêtes par jour, très en dessous du plafond de l'éditeur ;
- ni le jeton, ni le corps d'une réponse en erreur ne vont dans les journaux
  ou dans les messages renvoyés.

Ce module ne lit ni n'écrit la base et ne déclenche aucune alerte.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from fastapi import status

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.gfw.parametres import ParametresGfw, parametres_gfw

logger = structlog.get_logger(__name__)

# Nombre de réponses gardées en mémoire (les plus anciennes sont retirées)
_CACHE_MAX = 256


@dataclass
class _Entree:
    donnees: Any
    recupere_a: datetime


@dataclass(frozen=True)
class ReponseGfw:
    """Réponse de l'éditeur avec sa fraîcheur côté serveur."""

    donnees: Any
    recupere_a: datetime
    en_cache: bool
    perime: bool = False


_cache: dict[str, _Entree] = {}
_compteur: dict[str, int] = {}
# Verrou des rapports et boucle d'évènements à laquelle il appartient
_verrou_rapport: tuple[asyncio.AbstractEventLoop, asyncio.Lock] | None = None


def reinitialiser() -> None:
    """Vide le cache et le compteur (tests, redémarrage)."""
    global _verrou_rapport
    _cache.clear()
    _compteur.clear()
    _verrou_rapport = None


def jeton_configure() -> bool:
    jeton = settings.gfw_api_token
    return bool(jeton is not None and jeton.get_secret_value().strip())


def exiger_actif() -> str:
    """Jeton de l'éditeur, ou refus clair : échec fermé, sans appel sortant."""
    if not settings.gfw_enabled:
        raise ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "La source Global Fishing Watch n'est pas activée sur ce serveur.",
            "GFW_DESACTIVE",
        )
    if not jeton_configure():
        raise ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "La source Global Fishing Watch est activée sans jeton d'accès : "
            "aucune donnée ne peut être demandée.",
            "GFW_JETON_ABSENT",
        )
    assert settings.gfw_api_token is not None
    return settings.gfw_api_token.get_secret_value().strip()


def _transport() -> httpx.AsyncBaseTransport | None:
    """Transport HTTP ; remplacé par un simulateur dans les tests (aucun réseau)."""
    return None


def _maintenant() -> datetime:
    return datetime.now(UTC)


def _verrou() -> asyncio.Lock:
    """Verrou des rapports, propre à la boucle d'évènements en cours."""
    global _verrou_rapport
    boucle = asyncio.get_running_loop()
    if _verrou_rapport is None or _verrou_rapport[0] is not boucle:
        _verrou_rapport = (boucle, asyncio.Lock())
    return _verrou_rapport[1]


def _cle(chemin: str, params: Sequence[tuple[str, str]]) -> str:
    return chemin + "?" + "&".join(f"{k}={v}" for k, v in sorted(params))


def _frais(entree: _Entree | None, p: ParametresGfw) -> bool:
    return entree is not None and _maintenant() - entree.recupere_a < timedelta(
        hours=float(p.cache_heures)
    )


def _ranger(cle: str, donnees: Any) -> _Entree:
    entree = _Entree(donnees=donnees, recupere_a=_maintenant())
    _cache.pop(cle, None)
    _cache[cle] = entree
    while len(_cache) > _CACHE_MAX:
        _cache.pop(next(iter(_cache)))
    return entree


def _erreur_http(statut: int) -> ApiError:
    if statut in (401, 403):
        return ApiError(
            status.HTTP_502_BAD_GATEWAY,
            "L'éditeur a refusé l'accès : jeton invalide ou droits insuffisants.",
            "GFW_ACCES_REFUSE",
        )
    if statut == 404:
        return ApiError(
            status.HTTP_404_NOT_FOUND,
            "Aucune donnée ne correspond à cette demande chez l'éditeur.",
            "GFW_INTROUVABLE",
        )
    if statut == 422:
        return ApiError(
            status.HTTP_502_BAD_GATEWAY,
            "L'éditeur a refusé la demande telle qu'elle est formulée.",
            "GFW_DEMANDE_REFUSEE",
        )
    if statut == 429:
        return ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "L'éditeur limite les demandes : un rapport est déjà en cours ou le quota "
            "est atteint. Réessayez dans quelques minutes.",
            "GFW_LIMITE_EDITEUR",
        )
    return ApiError(
        status.HTTP_502_BAD_GATEWAY,
        "La source Global Fishing Watch ne répond pas correctement pour le moment.",
        "GFW_INDISPONIBLE",
    )


def _repli(entree: _Entree | None, erreur: ApiError) -> ReponseGfw:
    """Dernière réponse connue, signalée périmée ; sinon l'erreur."""
    if entree is None:
        raise erreur
    return ReponseGfw(entree.donnees, entree.recupere_a, en_cache=True, perime=True)


async def _interroger(
    chemin: str,
    params: Sequence[tuple[str, str]],
    *,
    jeton: str,
    cle: str,
    p: ParametresGfw,
) -> ReponseGfw:
    ancienne = _cache.get(cle)
    jour = _maintenant().strftime("%Y-%m-%d")
    if _compteur.get(jour, 0) >= int(p.budget_requetes_jour):
        return _repli(
            ancienne,
            ApiError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Le nombre de demandes prévu pour aujourd'hui vers Global Fishing Watch "
                "est atteint. Réessayez demain.",
                "GFW_BUDGET_ATTEINT",
            ),
        )
    for ancien_jour in [j for j in _compteur if j != jour]:
        _compteur.pop(ancien_jour, None)
    _compteur[jour] = _compteur.get(jour, 0) + 1

    statut: int | None = None
    # Une ancienne réponse ne remplace qu'une panne passagère, jamais un refus de
    # l'éditeur (accès retiré, demande rejetée, navire inconnu).
    repli_permis = True
    try:
        async with httpx.AsyncClient(
            base_url=settings.gfw_base_url,
            timeout=float(p.delai_reponse_secondes),
            transport=_transport(),
        ) as http:
            reponse = await http.get(
                chemin,
                params=list(params),
                headers={"Authorization": f"Bearer {jeton}", "Accept": "application/json"},
            )
        statut = reponse.status_code
        if statut == 200:
            try:
                donnees = reponse.json()
            except ValueError:
                erreur = ApiError(
                    status.HTTP_502_BAD_GATEWAY,
                    "La réponse de l'éditeur est illisible.",
                    "GFW_REPONSE_ILLISIBLE",
                )
            else:
                entree = _ranger(cle, donnees)
                return ReponseGfw(entree.donnees, entree.recupere_a, en_cache=False)
        else:
            erreur = _erreur_http(statut)
            repli_permis = statut not in (401, 403, 404, 422)
    except httpx.TimeoutException:
        erreur = ApiError(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "L'éditeur n'a pas répondu à temps. Réessayez plus tard.",
            "GFW_DELAI_DEPASSE",
        )
    except httpx.HTTPError:
        erreur = ApiError(
            status.HTTP_502_BAD_GATEWAY,
            "La source Global Fishing Watch est injoignable pour le moment.",
            "GFW_INDISPONIBLE",
        )
    # Ni le jeton ni le corps de la réponse : seulement le chemin, le statut et le code
    logger.warning("gfw_appel_echec", chemin=chemin, statut=statut, code=erreur.code)
    if not repli_permis:
        raise erreur
    return _repli(ancienne, erreur)


async def appeler(
    chemin: str, params: Sequence[tuple[str, str]], *, rapport: bool = False
) -> ReponseGfw:
    """Interroge l'éditeur, ou ressert la réponse en cache si elle est encore fraîche.

    `rapport=True` : les rapports passent un par un (verrou) ; une demande
    identique à celle qui vient d'aboutir profite de son résultat.
    """
    p = parametres_gfw()
    jeton = exiger_actif()
    cle = _cle(chemin, params)
    entree = _cache.get(cle)
    if entree is not None and _frais(entree, p):
        return ReponseGfw(entree.donnees, entree.recupere_a, en_cache=True)
    if not rapport:
        return await _interroger(chemin, params, jeton=jeton, cle=cle, p=p)

    verrou = _verrou()
    try:
        await asyncio.wait_for(verrou.acquire(), timeout=float(p.delai_reponse_secondes))
    except TimeoutError:
        return _repli(
            entree,
            ApiError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Un rapport est déjà en préparation auprès de l'éditeur. "
                "Réessayez dans une minute.",
                "GFW_RAPPORT_EN_COURS",
            ),
        )
    try:
        entree = _cache.get(cle)
        if entree is not None and _frais(entree, p):
            return ReponseGfw(entree.donnees, entree.recupere_a, en_cache=True)
        return await _interroger(chemin, params, jeton=jeton, cle=cle, p=p)
    finally:
        verrou.release()
