"""Localisation des données ouvertes Gabon (ZEE, masque d'eau, ports, secteurs).

Source de vérité : `data/open-data/gabon/` à la racine du dépôt. L'image Docker
du backend ne contient que `backend/`, donc une copie synchronisée est embarquée
dans `backend/app/data/gabon/` (`python scripts/sync_data.py`). Le premier
dossier existant est utilisé ; `PIGAP_DATA_DIR` permet un emplacement externe.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parents[1]  # backend/app
_REPO_ROOT = _APP_DIR.parents[1]  # racine du dépôt (si présente)

CANDIDATES: tuple[Path, ...] = (
    _REPO_ROOT / "data" / "open-data" / "gabon",
    _APP_DIR / "data" / "gabon",
)


@lru_cache(maxsize=1)
def gabon_data_dir() -> Path:
    env = os.environ.get("PIGAP_DATA_DIR")
    if env and Path(env).is_dir():
        return Path(env)
    for candidate in CANDIDATES:
        if (candidate / "eez_marineregions.geojson").exists():
            return candidate
    return CANDIDATES[-1]


def data_path(name: str) -> Path:
    """Chemin d'un fichier de données ; le fichier peut ne pas exister (snapshot)."""
    return gabon_data_dir() / name
