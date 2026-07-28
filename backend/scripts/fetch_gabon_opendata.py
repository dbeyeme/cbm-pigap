#!/usr/bin/env python3
"""Télécharge / régénère les données open source Gabon (ZEE + fleuves OSM).

Écrit sous data/open-data/gabon/ puis synchronise web/mobile gabonMaritimeRoutes.ts.

Usage:
  cd backend && source .venv/bin/activate
  python scripts/fetch_gabon_opendata.py
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

try:
    from shapely.geometry import LineString, Point, mapping, shape
    from shapely.ops import unary_union
except ImportError:
    print("Installer shapely : pip install shapely", file=sys.stderr)
    raise

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "data" / "open-data" / "gabon"
OUT.mkdir(parents=True, exist_ok=True)

EEZ_URL = (
    "https://geo.vliz.be/geoserver/MarineRegions/wfs"
    "?service=WFS&version=1.0.0&request=GetFeature"
    "&typeName=MarineRegions:eez&cql_filter=mrgid=8476"
    "&outputFormat=application/json"
)

# Public Overpass mirrors (main instance often 504 under load).
OVERPASS_URLS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
# Bbox Gabon (évite area ISO3166, plus lourd côté Overpass).
OVERPASS_QL = """
[out:json][timeout:120];
(
  way["waterway"="river"]["name"~"Ogooué|Ogooue|Komo|Ntem|Nyanga|Ngounié|Ngounie|Ivindo",i]( -4.0,8.5,2.4,14.6 );
  relation["waterway"="river"]["name"~"Ogooué|Ogooue|Komo|Ntem|Nyanga|Ngounié|Ngounie|Ivindo",i]( -4.0,8.5,2.4,14.6 );
);
out geom;
"""

UI_IDS = [
    "sortie_cote_mer",
    "entree_mondah",
    "remontee_komo",
    "mer_vers_ogooue",
    "ogooue_interieur",
    "rade_port_gentil",
    "entree_etranger",
    "ntem_fleuve",
    "mayumba_cote",
]


def _fetch(url: str, data: bytes | None = None, timeout: int = 180) -> bytes:
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "CBM-PIGAP/0.1 (open-data refresh; educational)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _fetch_overpass(ql: str) -> bytes:
    """Essaie plusieurs miroirs ; retry sur 429/5xx et timeouts."""
    body = ql.encode("utf-8")
    errors: list[str] = []
    for url in OVERPASS_URLS:
        for attempt in range(2):
            try:
                print(f"  Overpass → {url} (essai {attempt + 1})…")
                return _fetch(url, data=body, timeout=150)
            except urllib.error.HTTPError as e:
                msg = f"{url}: HTTP {e.code}"
                errors.append(msg)
                print(f"  ⚠ {msg}")
                if e.code not in (429, 502, 503, 504):
                    break
                time.sleep(3 * (attempt + 1))
            except (TimeoutError, urllib.error.URLError, OSError) as e:
                msg = f"{url}: {e}"
                errors.append(msg)
                print(f"  ⚠ {msg}")
                time.sleep(2 * (attempt + 1))
    raise RuntimeError("Overpass indisponible:\n  - " + "\n  - ".join(errors))


def fetch_eez() -> None:
    raw = _fetch(EEZ_URL)
    path = OUT / "eez_marineregions.geojson"
    path.write_bytes(raw)
    print(f"✓ EEZ → {path}")


def _rivers_from_overpass_payload(payload: dict) -> list[dict]:
    features = []
    for el in payload.get("elements") or []:
        name = (el.get("tags") or {}).get("name")
        if el.get("type") == "way" and "geometry" in el:
            coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
            if len(coords) < 2:
                continue
            features.append(
                {
                    "type": "Feature",
                    "properties": {"name": name, "osm_id": el.get("id")},
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            )
        elif el.get("type") == "relation" and "members" in el:
            parts = []
            for m in el["members"]:
                if m.get("type") == "way" and "geometry" in m:
                    parts.append([[p["lon"], p["lat"]] for p in m["geometry"]])
            if parts:
                features.append(
                    {
                        "type": "Feature",
                        "properties": {"name": name, "osm_id": el.get("id")},
                        "geometry": {"type": "MultiLineString", "coordinates": parts},
                    }
                )
    return features


def fetch_rivers(*, allow_cache: bool = True) -> None:
    cache = OUT / "rivers_osm.geojson"
    try:
        raw = _fetch_overpass(OVERPASS_QL)
    except RuntimeError as e:
        if allow_cache and cache.exists():
            print(f"⚠ Overpass en échec — réutilisation du cache {cache}")
            print(f"  ({e})")
            return
        raise SystemExit(str(e)) from e

    (OUT / "rivers_overpass.json").write_bytes(raw)
    payload = json.loads(raw)
    features = _rivers_from_overpass_payload(payload)
    if not features:
        if allow_cache and cache.exists():
            print("⚠ Overpass vide — réutilisation du cache rivers_osm.geojson")
            return
        raise SystemExit("Overpass: aucun fleuve nommé trouvé")
    geo = {"type": "FeatureCollection", "features": features}
    cache.write_text(json.dumps(geo), encoding="utf-8")
    print(f"✓ Fleuves OSM ({len(features)}) → {cache}")


def build_water_mask() -> object:
    eez = json.loads((OUT / "eez_marineregions.geojson").read_text(encoding="utf-8"))
    rivers = json.loads((OUT / "rivers_osm.geojson").read_text(encoding="utf-8"))
    geoms = [shape(f["geometry"]) for f in eez.get("features") or []]
    for f in rivers.get("features") or []:
        g = shape(f["geometry"])
        # ~0.04° ≈ 4 km buffer navigable grossier
        geoms.append(g.buffer(0.04))
    mask = unary_union(geoms)
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "gabon_water_mask", "buffer_deg": 0.04},
                "geometry": mapping(mask),
            }
        ],
    }
    path = OUT / "water_mask.geojson"
    path.write_text(json.dumps(fc), encoding="utf-8")
    print(f"✓ Masque eau → {path}")
    return mask


def _contains(water, lon: float, lat: float) -> bool:
    return bool(water.contains(Point(lon, lat)) or water.covers(Point(lon, lat)))


def _snap(water, lon: float, lat: float) -> tuple[float, float]:
    p = Point(lon, lat)
    if _contains(water, lon, lat):
        return (lon, lat)
    for r in (0.01, 0.02, 0.04, 0.08, 0.12):
        for ang in range(0, 360, 30):
            q = Point(
                lon + r * math.cos(ang * math.pi / 180),
                lat + r * math.sin(ang * math.pi / 180),
            )
            if water.contains(q):
                return (round(q.x, 5), round(q.y, 5))
    return (round(lon, 5), round(lat, 5))


def sample_line(water, coords: list, n: int = 10, reverse: bool = False) -> list[tuple[float, float]]:
    ls = LineString(coords)
    if ls.length == 0 or len(coords) < 2:
        return []
    pts = []
    for i in range(n):
        t = i / (n - 1)
        if reverse:
            t = 1 - t
        p = ls.interpolate(t, normalized=True)
        lon, lat = _snap(water, p.x, p.y)
        pts.append((round(lon, 5), round(lat, 5)))
    return pts


def sea_corridor(water, start, end, n: int = 10) -> list[tuple[float, float]]:
    pts = []
    for i in range(n):
        t = i / (n - 1)
        lon = start[0] + (end[0] - start[0]) * t
        lat = start[1] + (end[1] - start[1]) * t
        lon, lat = _snap(water, lon, lat)
        pts.append((round(lon, 5), round(lat, 5)))
    return pts


def validate(water, path: list[tuple[float, float]]) -> bool:
    if len(path) < 2:
        return False
    for lon, lat in path:
        if not _contains(water, lon, lat):
            return False
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        for s in range(11):
            t = s / 10
            lon = a[0] + (b[0] - a[0]) * t
            lat = a[1] + (b[1] - a[1]) * t
            if not _contains(water, lon, lat):
                return False
    return True


def _norm_name(name: str) -> str:
    return name.lower().replace("é", "e").replace("è", "e").replace("ï", "i")


def _named_segments(rivers: dict, needle: str) -> list[list]:
    """Tous les LineString (ou parts MultiLineString) dont le nom contient needle."""
    needle_n = _norm_name(needle)
    cands: list[list] = []
    for f in rivers.get("features") or []:
        name = (f.get("properties") or {}).get("name") or ""
        if needle_n not in _norm_name(name):
            continue
        g = f["geometry"]
        if g["type"] == "LineString":
            cands.append(g["coordinates"])
        elif g["type"] == "MultiLineString":
            cands.extend(g["coordinates"])
    return cands


def _longest_named(rivers: dict, needle: str) -> list:
    cands = _named_segments(rivers, needle)
    return max(cands, key=len) if cands else []


def _best_named_in_lon_window(
    rivers: dict,
    needle: str,
    lon_min: float,
    lon_max: float,
    *,
    min_pts: int = 5,
) -> list:
    """Préfère le plus long segment chevauchant [lon_min, lon_max] (évite amont Franceville)."""
    scored: list[list] = []
    for coords in _named_segments(rivers, needle):
        clipped = [c for c in coords if lon_min <= c[0] <= lon_max]
        if len(clipped) >= min_pts:
            scored.append(clipped)
        else:
            lons = [c[0] for c in coords]
            if lons and min(lons) <= lon_max and max(lons) >= lon_min and len(coords) >= min_pts:
                scored.append(coords)
    return max(scored, key=len) if scored else []


def build_demo_routes(water) -> dict:
    rivers = json.loads((OUT / "rivers_osm.geojson").read_text(encoding="utf-8"))
    routes: dict[str, list[tuple[float, float]]] = {}

    # Ogooué navigable ouest : embouchure / Port-Gentil → Lambaréné (pas amont ~13.7°E).
    ogo_aval = _best_named_in_lon_window(rivers, "ogooue", 8.9, 10.4)
    ogo_lambarene = _best_named_in_lon_window(rivers, "ogooue", 10.0, 11.3)
    komo = _longest_named(rivers, "komo")
    ntem = _longest_named(rivers, "ntem")
    nyanga = _longest_named(rivers, "nyanga")
    ngounie = _longest_named(rivers, "ngounie")
    ivindo = _longest_named(rivers, "ivindo")

    if ogo_aval and len(ogo_aval) >= 5:
        # Orienté ouest→est (vers Lambaréné) pour « mer → Ogooué ».
        ordered = sorted(ogo_aval, key=lambda c: c[0])
        routes["mer_vers_ogooue"] = sample_line(water, ordered)
        routes["ogooue_vers_mer"] = sample_line(water, ordered, reverse=True)
    if ogo_lambarene and len(ogo_lambarene) >= 5:
        routes["ogooue_interieur"] = sample_line(water, ogo_lambarene)
    if komo:
        routes["remontee_komo"] = sample_line(water, komo)
    if ntem:
        routes["ntem_fleuve"] = sample_line(water, ntem)
    if nyanga:
        routes["nyanga_fleuve"] = sample_line(water, nyanga)
    if ngounie:
        routes["ngounie_fleuve"] = sample_line(water, ngounie)
    if ivindo:
        routes["ivindo_fleuve"] = sample_line(water, ivindo)

    routes["sortie_cote_mer"] = sea_corridor(water, (9.25, 0.28), (8.90, 0.15))
    routes["entree_mondah"] = sea_corridor(water, (9.35, 0.72), (9.15, 0.85))
    routes["entree_etranger"] = sea_corridor(water, (7.80, -0.20), (8.50, -0.40))
    routes["mayumba_cote"] = sea_corridor(water, (10.55, -3.35), (10.35, -3.55))
    routes["rade_port_gentil"] = sea_corridor(water, (8.65, -0.70), (8.40, -0.90))

    meta = {
        "sortie_cote_mer": {
            "label": "Côte → mer (Estuaire)",
            "subtitle": "ZEE Marine Regions — sortie artisanale",
        },
        "entree_mondah": {
            "label": "Entrée baie de Mondah",
            "subtitle": "ZEE — approche nord Estuaire",
        },
        "remontee_komo": {
            "label": "Fleuve Komo",
            "subtitle": "OSM Komo / Estuaire intérieur",
        },
        "mer_vers_ogooue": {
            "label": "Ogooué → Lambaréné",
            "subtitle": "OSM Ogooué aval (remontée ~9–10.3°E)",
        },
        "ogooue_vers_mer": {
            "label": "Lambaréné → Ogooué aval",
            "subtitle": "OSM Ogooué (descente vers embouchure)",
        },
        "ogooue_interieur": {
            "label": "Ogooué intérieur (Lambaréné+)",
            "subtitle": "OSM Ogooué moyen (~10–11°E)",
        },
        "entree_etranger": {
            "label": "Navire étranger → ZEE Gabon",
            "subtitle": "Approche hauturière (EEZ open data)",
        },
        "ntem_fleuve": {"label": "Fleuve Ntem", "subtitle": "OSM Ntem"},
        "mayumba_cote": {"label": "Mayumba (sud)", "subtitle": "ZEE — côte sud"},
        "rade_port_gentil": {
            "label": "Rade Port-Gentil / Cap Lopez",
            "subtitle": "ZEE — pêche / approches",
        },
        "nyanga_fleuve": {"label": "Fleuve Nyanga", "subtitle": "OSM Nyanga"},
        "ngounie_fleuve": {"label": "Fleuve Ngounié", "subtitle": "OSM Ngounié"},
        "ivindo_fleuve": {"label": "Fleuve Ivindo", "subtitle": "OSM Ivindo"},
    }

    bad = [k for k, v in routes.items() if not validate(water, v)]
    if bad:
        raise SystemExit(f"Routes hors eau après regen: {bad}")

    bundle = {
        "generated": date.today().isoformat(),
        "sources": {
            "eez": "Marine Regions EEZ v12 MRGID 8476 CC-BY-4.0",
            "rivers": "OpenStreetMap Overpass ODbL 1.0",
        },
        "routes": {k: [[a, b] for a, b in v] for k, v in routes.items()},
        "meta": meta,
    }
    path = OUT / "demo_routes_opendata.json"
    path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ Routes démo ({len(routes)}) → {path}")
    return bundle


def sync_ts(bundle: dict) -> None:
    routes = bundle["routes"]
    meta = bundle["meta"]
    ids_union = " | ".join(f"'{i}'" for i in UI_IDS)

    def fmt_pts(pts: list) -> str:
        lines = ",\n".join(f"      [{lon}, {lat}]" for lon, lat in pts)
        return "[\n" + lines + ",\n    ]"

    blocks = []
    for rid in UI_IDS:
        pts = routes[rid]
        m = meta.get(rid, {})
        blocks.append(
            "  {\n"
            f"    id: '{rid}',\n"
            f"    label: {json.dumps(m.get('label', rid), ensure_ascii=False)},\n"
            f"    subtitle: {json.dumps(m.get('subtitle', ''), ensure_ascii=False)},\n"
            f"    path: {fmt_pts(pts)},\n"
            "  }"
        )

    ts = f"""/**
 * Corridors démo — générés depuis data/open-data/gabon/ (ZEE Marine Regions + OSM).
 * Ne pas éditer à la main : python backend/scripts/fetch_gabon_opendata.py
 * Licences : CC-BY-4.0 (EEZ) / ODbL 1.0 (OSM) — voir data/open-data/gabon/SOURCES.md
 */

export type MaritimeRouteId =
  {ids_union};

export type MaritimeRoute = {{
  id: MaritimeRouteId;
  label: string;
  subtitle: string;
  path: [number, number][];
}};

export const GABON_ZONE_BBOX = {{
  minLon: 6.5,
  maxLon: 14.5,
  minLat: -6.5,
  maxLat: 2.5,
}} as const;

export const GABON_COAST_BOUNDS = {{
  west: 8.2,
  south: -3.9,
  east: 11.4,
  north: 2.3,
}} as const;

export function isInGabonZone(lon: number, lat: number): boolean {{
  return (
    lon >= GABON_ZONE_BBOX.minLon &&
    lon <= GABON_ZONE_BBOX.maxLon &&
    lat >= GABON_ZONE_BBOX.minLat &&
    lat <= GABON_ZONE_BBOX.maxLat
  );
}}

function nearDemoCorridor(lon: number, lat: number, maxDeg = 0.08): boolean {{
  for (const route of GABON_MARITIME_ROUTES) {{
    for (const [x, y] of route.path) {{
      if (Math.hypot(lon - x, lat - y) <= maxDeg) return true;
    }}
  }}
  return false;
}}

/** Approximation client ; validation stricte = API water_mask. */
export function isOnWater(lon: number, lat: number): boolean {{
  if (!isInGabonZone(lon, lat)) return false;
  if (lon < 9.30 && lat >= -4.0 && lat <= 1.2) return true;
  return nearDemoCorridor(lon, lat);
}}

export const GABON_MARITIME_ROUTES: MaritimeRoute[] = [
{",\n".join(blocks)},
];

export function getMaritimeRoute(id: MaritimeRouteId): MaritimeRoute {{
  const r = GABON_MARITIME_ROUTES.find((x) => x.id === id);
  if (!r) throw new Error(`Route inconnue: ${{id}}`);
  return r;
}}
"""
    for rel in ("web/src/geo/gabonMaritimeRoutes.ts", "mobile/src/geo/gabonMaritimeRoutes.ts"):
        p = REPO / rel
        p.write_text(ts, encoding="utf-8")
        print(f"✓ TS → {p}")


def main() -> None:
    skip_net = "--offline" in sys.argv
    if not skip_net:
        fetch_eez()
        fetch_rivers()
    elif not (OUT / "eez_marineregions.geojson").exists():
        raise SystemExit("Mode --offline sans eez_marineregions.geojson")
    water = build_water_mask()
    bundle = build_demo_routes(water)
    sync_ts(bundle)
    print("Terminé. Voir data/open-data/gabon/SOURCES.md")


if __name__ == "__main__":
    main()
