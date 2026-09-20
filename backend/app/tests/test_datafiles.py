"""Les données ouvertes embarquées dans l'image doivent suivre la source du dépôt."""

from __future__ import annotations

import hashlib
from pathlib import Path

from app.core.datafiles import CANDIDATES, gabon_data_dir

ROOT = Path(__file__).resolve().parents[3]
FILES = (
    "eez_marineregions.geojson",
    "water_mask.geojson",
    "ports.json",
    "secteurs_mer.json",
    "demo_routes_opendata.json",
)


def _digest(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def test_bundled_data_matches_source() -> None:
    src = ROOT / "data" / "open-data" / "gabon"
    dst = CANDIDATES[-1]
    for name in FILES:
        assert (dst / name).exists(), (
            f"{name} absent de backend/app/data/gabon : python scripts/sync_data.py"
        )
        if (src / name).exists():
            assert _digest(src / name) == _digest(dst / name), (
                f"{name} désynchronisé : python scripts/sync_data.py"
            )


def test_data_dir_resolves() -> None:
    d = gabon_data_dir()
    assert (d / "eez_marineregions.geojson").exists()
