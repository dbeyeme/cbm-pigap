# ADR-002 — Cartographie web : MapLibre GL plutôt que Leaflet

- **Statut :** Accepté
- **Date :** 2026-07-27
- **Décideurs :** Christian BEYEME

## Contexte

Le cahier §3.2 autorise **MapLibre GL** ou **Leaflet** pour le portail autorités. Utile dès M2 (trajectoires) et M6 (tableau de bord).

## Options envisagées

1. **MapLibre GL** — rendu vectoriel WebGL, perf sur densités de points, écosystème open-source (fork Mapbox GL).
2. **Leaflet** — léger, très documenté, tuiles raster, plugins nombreux, moins adapté aux très gros volumes.

## Décision

**Option 1 — MapLibre GL**, pour le MVP (validé 2026-07-27) :

- Trajectoires GPS + zones polygones + densités d'activité (M2/M3/M6) : rendu vectoriel plus confortable.
- Pas de dépendance payante Mapbox (tuiles à choisir open — ex. OpenFreeMap / self-host ultérieur).
- Cohérence future éventuelle avec carte mobile (MapLibre existe aussi côté RN).

## Conséquences

- Positives : perf et qualité visuelle pour le pilotage ; stack 100 % open-source.
- Négatives / dettes : courbe d'apprentissage un peu plus haute que Leaflet ; choix du fournisseur de tuiles à figer en M2.
- Impact cahier : précise §3.2 (MapLibre retenu).

## Liens

- Modules concernés : M2, M3, M6
- Entrée journal : Phase 1 (2026-07-27)
