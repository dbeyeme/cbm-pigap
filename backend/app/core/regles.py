"""Règles et paramètres métier versionnés : ni dans le code, ni dans l'environnement.

Chaque fichier JSON de `backend/app/data/regles/` porte une version, un statut
(« Proposé » ou « Validé ») et la liste de ses valideurs. Le fichier est relu
dès qu'il change sur le disque : modifier un paramètre change le résultat sans
toucher au code. `PIGAP_REGLES_DIR` désigne un autre dossier (tests, hébergement) ;
seul l'emplacement vient de l'environnement, jamais une valeur de règle.

Échec fermé : un fichier absent ou illisible lève une erreur claire, aucune
valeur de repli n'est codée en dur.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import structlog
from fastapi import status
from pydantic import ValidationError

from app.core.errors import ApiError

logger = structlog.get_logger(__name__)

_DOSSIER_DEFAUT = Path(__file__).resolve().parents[1] / "data" / "regles"
_cache: dict[str, tuple[tuple[int, int], dict[str, Any]]] = {}


def dossier_regles() -> Path:
    externe = (os.environ.get("PIGAP_REGLES_DIR") or "").strip()
    if not externe:
        return _DOSSIER_DEFAUT
    chemin = Path(externe)
    if not chemin.is_dir():
        # Dossier demandé mais introuvable (volume non monté, faute de frappe) : aucun
        # repli sur les règles du dépôt, qui s'appliqueraient à la place sans prévenir.
        logger.warning("regles_dossier_introuvable")
        raise ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Le dossier des paramétrages indiqué pour ce serveur est introuvable : "
            "ce service est indisponible pour le moment.",
            "REGLE_INDISPONIBLE",
        )
    return chemin


def regle_indisponible(nom: str) -> ApiError:
    """Erreur servie quand le paramétrage `nom` manque.

    Le nom du fichier est inscrit au journal du serveur par l'appelant ; la réponse,
    parfois lue sans connexion, ne le donne pas.
    """
    return ApiError(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Un paramétrage de ce serveur est absent ou illisible : "
        "ce service est indisponible pour le moment.",
        "REGLE_INDISPONIBLE",
    )


def charger_regles(nom: str) -> dict[str, Any]:
    """Contenu du fichier `<nom>.json`, relu s'il a changé depuis la dernière lecture."""
    chemin = dossier_regles() / f"{nom}.json"
    try:
        etat = chemin.stat()
    except OSError as exc:
        logger.warning("regle_absente", fichier=nom)
        raise regle_indisponible(nom) from exc
    modifie = (etat.st_mtime_ns, etat.st_size)
    cle = str(chemin)
    en_cache = _cache.get(cle)
    if en_cache is not None and en_cache[0] == modifie:
        return en_cache[1]
    try:
        contenu = json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        logger.warning("regle_illisible", fichier=nom, cause=type(exc).__name__)
        raise regle_indisponible(nom) from exc
    if not isinstance(contenu, dict):
        logger.warning("regle_illisible", fichier=nom, cause="objet attendu")
        raise regle_indisponible(nom)
    _cache[cle] = (modifie, contenu)
    return contenu


def regle_invalide(nom: str, exc: ValidationError) -> ApiError:
    """Erreur à lever pour un paramétrage mal formé ; journalise les champs fautifs,
    jamais leurs valeurs, pour qu'une faute de frappe ne reste pas sans indice."""
    champs = sorted({".".join(str(p) for p in e["loc"]) + " : " + e["type"] for e in exc.errors()})
    logger.warning("regle_invalide", fichier=nom, champs=champs)
    return regle_indisponible(nom)


def entete_regle(contenu: dict[str, Any]) -> dict[str, Any]:
    """Version, statut et valideurs, à joindre aux réponses qui appliquent la règle."""
    return {
        "version": str(contenu.get("version") or ""),
        "statut": str(contenu.get("statut") or "Proposé"),
        "valideurs": [str(v) for v in contenu.get("valideurs") or []],
    }
