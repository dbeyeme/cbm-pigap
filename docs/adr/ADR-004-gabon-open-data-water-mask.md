# ADR-004 — Masque d’eau Gabon open data (ZEE + OSM)

- **Statut :** Accepté
- **Date :** 2026-07-27
- **Décideurs :** Christian BEYEME (+ agent)

## Contexte

Les polygones d’eau « dessinés à la main » pour M2 ne reflétaient pas la géographie réelle (estuaire, ZEE, fleuves). Il fallait une base **réelle, open source et rafraîchissable** pour `is_on_water` et les corridors de démo.

## Options envisagées

1. Polygones manuels — rapide, mais fictifs et difficiles à maintenir.
2. **ZEE Marine Regions + fleuves OSM (buffers)** — licences claires, téléchargeables, sobriété MVP.
3. Polygones `natural=water` OSM complets / GADM — plus fidèles côte/lacs, mais lourds et timeouts Overpass en MVP.

## Décision

Option 2 : stocker sous `data/open-data/gabon/` la ZEE Gabon (Marine Regions EEZ v12, MRGID 8476, **CC-BY-4.0**) et les axes fluviaux OSM (**ODbL 1.0**), construire `water_mask.geojson` (union + buffer ~0.04°), et générer `demo_routes_opendata.json` + sync TS via `backend/scripts/fetch_gabon_opendata.py`.

## Conséquences

- Positives : validation géo traçable ; attribution documentée (`SOURCES.md`) ; refresh reproductible.
- Négatives / dettes : buffers fluviaux ≠ polygones d’eau complets ; Ntem OSM surtout continental ; pas encore d’overlay MapLibre du masque.
- Impact cahier : non (renforce §5.2 / réalisme terrain, hors écart stack §3.2).

## Liens

- Modules concernés : M2 (prépare M3 zones)
- Entrée journal : 2026-07-27 open data Gabon
