"""Modules métier activables selon formule B2B."""

from __future__ import annotations

from app.db.enums import CanalAbonnement, CodeOffreAbonnement

# Clés stables — utilisées en BO superadmin + portail org
MODULE_KEYS: list[tuple[str, str]] = [
    ("m1_pecheurs", "Pêcheurs & embarcations"),
    ("m2_geoloc", "Géolocalisation GPS"),
    ("m3_zones", "Zones réglementées"),
    ("m4_captures", "Déclarations de captures"),
    ("m5_quotas", "Quotas"),
    ("m6_dashboard", "Tableau de bord"),
    ("m7_alertes", "Alertes"),
    ("ais", "Couche AIS ZEE"),
    ("documents", "Documents PDF"),
    ("predictions", "Prédictions / tendances"),
]

ALL_MODULES_OFF = {k: False for k, _ in MODULE_KEYS}
ALL_MODULES_ON = {k: True for k, _ in MODULE_KEYS}

# Packs par défaut selon offre B2B
DEFAULT_MODULES_BY_OFFRE: dict[CodeOffreAbonnement, dict[str, bool]] = {
    CodeOffreAbonnement.b2b_autorite_mensuel: dict(ALL_MODULES_ON),
    CodeOffreAbonnement.b2b_autorite_annuel: dict(ALL_MODULES_ON),
    CodeOffreAbonnement.b2b_flotte_mensuel: {
        **ALL_MODULES_OFF,
        "m1_pecheurs": True,
        "m2_geoloc": True,
        "m4_captures": True,
        "m6_dashboard": True,
        "documents": True,
        "m7_alertes": True,
    },
    CodeOffreAbonnement.b2b_flotte_annuel: {
        **ALL_MODULES_OFF,
        "m1_pecheurs": True,
        "m2_geoloc": True,
        "m4_captures": True,
        "m6_dashboard": True,
        "documents": True,
        "m7_alertes": True,
    },
}


def default_modules_for(
    code: CodeOffreAbonnement | None, canal: CanalAbonnement | None = None
) -> dict[str, bool]:
    if code and code in DEFAULT_MODULES_BY_OFFRE:
        return dict(DEFAULT_MODULES_BY_OFFRE[code])
    if canal == CanalAbonnement.b2b_autorite:
        return dict(ALL_MODULES_ON)
    if canal == CanalAbonnement.b2b_flotte:
        return dict(DEFAULT_MODULES_BY_OFFRE[CodeOffreAbonnement.b2b_flotte_annuel])
    return dict(ALL_MODULES_OFF)


def merge_modules(current: dict | None, patch: dict[str, bool]) -> dict[str, bool]:
    base = dict(ALL_MODULES_OFF)
    if isinstance(current, dict):
        for k, v in current.items():
            if k in base:
                base[k] = bool(v)
    for k, v in patch.items():
        if k in base:
            base[k] = bool(v)
    return base
