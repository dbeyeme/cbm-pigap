"""Zones d'eau et trajectoires basées sur données open source Gabon.

Sources (voir data/open-data/gabon/SOURCES.md) :
- ZEE : Marine Regions / VLIZ EEZ v12 (CC-BY-4.0)
- Fleuves : OpenStreetMap via Overpass (ODbL 1.0)

La validation `is_on_water` utilise le masque `water_mask.geojson`
(ZEE ∪ buffers des fleuves OSM). Fallback polygonal si fichier absent.
"""

from __future__ import annotations

import json
from functools import lru_cache

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry

from app.core.datafiles import gabon_data_dir

# __file__ → …/backend/app/modules/geolocalisation/gabon_routes.py → repo root = parents[4]
_DATA_DIR = gabon_data_dir()

GABON_ZONE_BBOX = {
    "min_lon": 6.5,
    "max_lon": 14.5,
    "min_lat": -6.5,
    "max_lat": 2.5,
}


@lru_cache(maxsize=1)
def _water_geom() -> BaseGeometry | None:
    path = _DATA_DIR / "water_mask.geojson"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    feats = data.get("features") or []
    if not feats:
        return None
    return shape(feats[0]["geometry"])


@lru_cache(maxsize=1)
def _demo_bundle() -> dict:
    path = _DATA_DIR / "demo_routes_opendata.json"
    if not path.exists():
        return {"routes": {}, "meta": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def is_in_gabon_zone(lon: float, lat: float) -> bool:
    return (
        GABON_ZONE_BBOX["min_lon"] <= lon <= GABON_ZONE_BBOX["max_lon"]
        and GABON_ZONE_BBOX["min_lat"] <= lat <= GABON_ZONE_BBOX["max_lat"]
    )


def is_on_water(lon: float, lat: float) -> bool:
    """True si dans la ZEE gabonaise, un corridor fluvial OSM (buffer) ou une zone portuaire.

    Les quais (Libreville, Port-Gentil, Mayumba…) sont hors du polygone ZEE
    strict : le rayon de quai du référentiel des ports (`rayon_quai_km`) les
    réintègre, sinon les positions GPS à quai seraient refusées et la présence
    au port impossible. Le rayon portuaire complet n'est pas utilisé ici : il
    englobe la ville.
    """
    if not is_in_gabon_zone(lon, lat):
        return False
    from app.modules.ais_gabon.ports import port_quai_proche

    if port_quai_proche(lon, lat) is not None:
        return True
    geom = _water_geom()
    if geom is None:
        # Fallback minimal : mer approximative à l'ouest
        return lon < 9.30 and -4.0 <= lat <= 1.2
    return bool(geom.contains(Point(lon, lat)) or geom.covers(Point(lon, lat)))


def segment_stays_on_water(
    a: tuple[float, float], b: tuple[float, float], *, samples: int = 10
) -> bool:
    for i in range(samples + 1):
        t = i / samples
        lon = a[0] + (b[0] - a[0]) * t
        lat = a[1] + (b[1] - a[1]) * t
        if not is_on_water(lon, lat):
            return False
    return True


def path_stays_on_water(path: list[tuple[float, float]]) -> bool:
    if not path:
        return False
    if not all(is_on_water(lon, lat) for lon, lat in path):
        return False
    for i in range(len(path) - 1):
        if not segment_stays_on_water(path[i], path[i + 1]):
            return False
    return True


def _load_routes() -> dict[str, list[tuple[float, float]]]:
    bundle = _demo_bundle()
    out: dict[str, list[tuple[float, float]]] = {}
    for key, pts in (bundle.get("routes") or {}).items():
        out[key] = [(float(p[0]), float(p[1])) for p in pts]
    return out


DEMO_ROUTES: dict[str, list[tuple[float, float]]] = _load_routes()
DEMO_ROUTE_META: dict[str, dict[str, str]] = dict(_demo_bundle().get("meta") or {})

# Alias acceptation §5.2
ESTUAIRE_LIBREVILLE = DEMO_ROUTES.get("sortie_cote_mer") or []


def assert_demo_routes_on_water() -> None:
    if not DEMO_ROUTES:
        raise AssertionError("Aucune route open data chargée (demo_routes_opendata.json)")
    for name, path in DEMO_ROUTES.items():
        if not path_stays_on_water(path):
            raise AssertionError(
                f"Route {name}: point ou segment hors eau open data (ZEE / fleuves OSM)"
            )


# Compat anciens imports (polygones manuels dépréciés)
WATER_POLYGONS: list[list[tuple[float, float]]] = []
INLAND_FORBIDDEN: list[list[tuple[float, float]]] = []


def is_inland_forbidden(lon: float, lat: float) -> bool:
    """Centre-ville hors masque eau — conservé pour messages métier."""
    return (9.34 <= lon <= 9.58) and (0.25 <= lat <= 0.55) and not is_on_water(lon, lat)
