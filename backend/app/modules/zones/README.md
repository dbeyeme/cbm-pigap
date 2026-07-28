# M3 — Cartographie des zones réglementées

## Objectif

Définir des polygones de zones (interdite / protégée / sensible) et détecter
l'intersection avec une position GPS via **PostGIS `ST_Intersects`** (§5.3).

Pas d'alertes métier ici (M7) — uniquement la détection.

## Endpoints

| Méthode | Chemin | Rôles | Description |
|---------|--------|-------|-------------|
| POST | `/api/v1/zones` | autorité, agent, admin | Créer une zone (GeoJSON Polygon) |
| GET | `/api/v1/zones` | + chercheur, pêcheur | Lister (filtres `actif`, `type`) |
| GET | `/api/v1/zones/{id}` | lecture | Détail |
| PATCH | `/api/v1/zones/{id}` | autorité, agent, admin | Éditer |
| DELETE | `/api/v1/zones/{id}` | autorité, agent, admin | Supprimer |
| POST | `/api/v1/zones/import/geojson` | autorité, agent, admin | Import FeatureCollection |
| POST | `/api/v1/zones/detect/intersection` | lecture | Détection ST_Intersects |

Géométries SRID 4326. Properties GeoJSON import : `nom`, `type`, `periode_debut`, `periode_fin`, `actif`.

## Portail web

Page **Zones réglementées** : modes Voir / Dessiner / Tester, polygones MapLibre,
presets ciblés (Mondah, Cap Lopez, Lambaréné), garde-fou taille max (~90 km).

**Règle métier :** une zone = un secteur précis — pas un ruban côtier national
ni un pavage terrestre.

## Tester

```bash
cd backend
pytest app/tests/test_m3_zones.py app/tests/test_m2_geoloc.py app/tests/test_m1_pecheurs.py -q

# Reset zones test/démo + 3 presets ciblés
python scripts/seed_zones_demo.py --reset
```

## Acceptation §5.3

- Position **à l'intérieur** d'une zone `interdite` → `intersects: true`
- Position **à l'extérieur** → `intersects: false` (pas de faux positif)
