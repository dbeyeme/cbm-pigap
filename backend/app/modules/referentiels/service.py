"""Référentiels métier de la pêche gabonaise (espèces, engins, sites, barèmes).

Source : `data/open-data/gabon/referentiels_peche.json` (copié dans l'image
Docker via `scripts/sync_data.py`). Les valeurs proviennent des tableurs de
l'administration des pêches tels que décrits dans le rapport d'étude
NTSAGUI-2026-PGH-001 ; elles restent à valider par la DGPA avant tout usage
réglementaire (indicateur `a_valider_dgpa`).
"""

from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from typing import Any

from app.core.datafiles import data_path

_FILE = "referentiels_peche.json"


def _norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.strip().lower().replace(" ", "_").replace("-", "_")


@lru_cache(maxsize=1)
def load_referentiels() -> dict[str, Any]:
    path = data_path(_FILE)
    if not path.exists():
        return {
            "especes": [],
            "engins": [],
            "engins_generiques": [],
            "sites_debarquement": [],
            "baremes": {"taxe_production_fcfa_kg": [], "autorisation_annuelle": []},
            "especes_protegees": [],
            "prix_moyens_2024_fcfa_kg": {},
        }
    return json.loads(path.read_text(encoding="utf-8"))


def reload() -> None:
    load_referentiels.cache_clear()


# --------------------------------------------------------------------------- #
# Espèces
# --------------------------------------------------------------------------- #


@lru_cache(maxsize=1)
def _especes_index() -> dict[str, dict[str, Any]]:
    """Code canonique et alias → fiche espèce."""
    index: dict[str, dict[str, Any]] = {}
    for e in load_referentiels().get("especes", []):
        index[_norm(e["code"])] = e
        for alias in e.get("alias", []) or []:
            index[_norm(alias)] = e
    return index


def especes() -> list[dict[str, Any]]:
    return list(load_referentiels().get("especes", []))


def espece_codes() -> list[str]:
    """Codes canoniques, dans l'ordre du référentiel (production décroissante)."""
    return [e["code"] for e in especes()]


def espece(code: str | None) -> dict[str, Any] | None:
    if not code:
        return None
    return _especes_index().get(_norm(code))


def espece_valide(code: str | None) -> bool:
    return espece(code) is not None


def canonical_espece(code: str | None) -> str | None:
    fiche = espece(code)
    return fiche["code"] if fiche else None


def groupe_espece(code: str | None) -> str | None:
    fiche = espece(code)
    return fiche.get("groupe") if fiche else None


def nom_espece(code: str | None) -> str:
    fiche = espece(code)
    return fiche["nom"] if fiche else (code or "")


def prix_moyen_fcfa_kg(code: str | None) -> float | None:
    canon = canonical_espece(code)
    if canon is None:
        return None
    value = load_referentiels().get("prix_moyens_2024_fcfa_kg", {}).get(canon)
    return float(value) if value is not None else None


@lru_cache(maxsize=1)
def _protegees() -> set[str]:
    return {_norm(e["code"]) for e in load_referentiels().get("especes_protegees", [])}


def espece_protegee(code: str | None) -> bool:
    return _norm(code) in _protegees()


def especes_protegees() -> list[dict[str, Any]]:
    return list(load_referentiels().get("especes_protegees", []))


# --------------------------------------------------------------------------- #
# Engins, sites, nationalités
# --------------------------------------------------------------------------- #


def engins() -> list[dict[str, Any]]:
    return list(load_referentiels().get("engins", []))


@lru_cache(maxsize=1)
def engin_codes() -> set[str]:
    ref = load_referentiels()
    codes = {_norm(e["code"]) for e in ref.get("engins", [])}
    codes |= {_norm(c) for c in ref.get("engins_generiques", [])}
    return codes


def engin_valide(code: str | None) -> bool:
    return _norm(code) in engin_codes()


def sites_debarquement() -> list[dict[str, Any]]:
    return list(load_referentiels().get("sites_debarquement", []))


def nationalites() -> list[dict[str, Any]]:
    return list(load_referentiels().get("nationalites", []))


def categories_infraction() -> list[dict[str, Any]]:
    return list(load_referentiels().get("categories_infraction", []))


# --------------------------------------------------------------------------- #
# Barèmes
# --------------------------------------------------------------------------- #


def baremes() -> dict[str, Any]:
    return dict(load_referentiels().get("baremes", {}))


def taux_taxe_production(code_espece: str | None) -> tuple[float | None, str | None]:
    """Taux FCFA/kg applicable à une espèce : règle par espèce, sinon par groupe.

    Retourne (taux, code du barème) ; (None, None) si aucun barème ne couvre
    l'espèce (statut « sans barème » sur la capture).
    """
    fiche = espece(code_espece)
    if fiche is None:
        return None, None
    rules = baremes().get("taxe_production_fcfa_kg", [])
    canon = fiche["code"]
    for rule in rules:
        if rule.get("espece") and _norm(rule["espece"]) == canon:
            return float(rule["taux"]), str(rule["code"])
    groupe = fiche.get("groupe")
    for rule in rules:
        if rule.get("groupe") and rule["groupe"] == groupe:
            return float(rule["taux"]), str(rule["code"])
    return None, None


def montant_autorisation_annuelle(
    *, nationalite: str | None, engins_declares: list[str] | None, continentale: bool = False
) -> tuple[int | None, str | None]:
    """Montant de l'autorisation annuelle selon le barème observé.

    Priorité : senne tournante > pêche continentale > nationalité du propriétaire.
    """
    rules = {r["code"]: r for r in baremes().get("autorisation_annuelle", [])}
    engins_norm = {_norm(e) for e in (engins_declares or [])}
    if "senne_tournante" in engins_norm and "senne_tournante" in rules:
        return int(rules["senne_tournante"]["montant_fcfa"]), "senne_tournante"
    if continentale and "continentale" in rules:
        return int(rules["continentale"]["montant_fcfa"]), "continentale"
    nat = _norm(nationalite)
    if not nat:
        return None, None
    code = (
        "maritime_national"
        if nat in ("gabon", "gabonaise", "gabonais", "ga")
        else "maritime_etranger"
    )
    if code in rules:
        return int(rules[code]["montant_fcfa"]), code
    return None, None


def validite_licence_jours() -> int:
    """Durée d'une autorisation de pêche artisanale : annuelle (barème observé)."""
    from app.core.config import settings

    return int(settings.licence_validite_jours)


def reperes() -> dict[str, Any]:
    return dict(load_referentiels().get("reperes_2024_grand_libreville", {}))
