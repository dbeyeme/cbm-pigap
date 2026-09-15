# Données open source — Gabon (géolocalisation PIGAP)

Masque d’eau et corridors de démo pour M2. **Pas de données personnelles** ; géométries publiques uniquement.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `eez_marineregions.geojson` | Zone économique exclusive (ZEE) du Gabon |
| `rivers_osm.geojson` | Tronçons de fleuves nommés (Ogooué, Komo, Ntem, Nyanga, Ngounié, Ivindo…) |
| `rivers_overpass.json` | Réponse brute Overpass (cache) |
| `water_mask.geojson` | Union ZEE ∪ buffers fluviaux — validation `is_on_water` |
| `demo_routes_opendata.json` | Corridors de démo échantillonnés sur ces géométries |
| `SOURCES.md` | Ce fichier |

## Sources & licences

| Jeu | Éditeur | Licence | Accès |
|-----|---------|---------|--------|
| **EEZ Gabon** (MRGID 8476) | Flanders Marine Institute (VLIZ) — [Marine Regions](https://www.marineregions.org/) EEZ v12 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | API / GeoJSON Marine Regions |
| **Fleuves** | Contributeurs [OpenStreetMap](https://www.openstreetmap.org/) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) | Overpass API |
| **AIS (live)** | [Open Waters](https://ais.openwaters.io) (agrégat AIS open) | Conditions fournisseur | `GET /v1/vessels?bbox=` puis filtre ZEE PIGAP |

### Attribution (à conserver)

- Marine Regions / Flanders Marine Institute — Exclusive Economic Zones (EEZ) v12.
- © OpenStreetMap contributors — données fluviales (ODbL).
- Open Waters / contributeurs AIS — positions navires (couche surveillance ADR-005) ; **pas** le registre pêcheurs PIGAP.

## Date de génération

Voir le champ `generated` dans `demo_routes_opendata.json` (dernière regen : **2026-07-27**).

## Rafraîchir les données

```bash
cd backend && source .venv/bin/activate
pip install -r requirements.txt   # inclut shapely
python scripts/fetch_gabon_opendata.py
# régénère water_mask + demo_routes, puis synchronise les TS web/mobile
```

Prérequis réseau : accès à Marine Regions (WFS) et un miroir Overpass
(`overpass.private.coffee`, `kumi.systems`, `lz4.overpass-api.de`, …).
En cas de 504, le script réessaie les miroirs puis retombe sur le cache local
`rivers_osm.geojson` ; ou bien : `python scripts/fetch_gabon_opendata.py --offline`.

## Limites connues (MVP)

- Les polygones `natural=water` OSM complets sont lourds ; le masque utilise la **ZEE + buffers** autour des axes fluviaux OSM (pas chaque lac).
- Le tracé OSM du **Ntem** est surtout continental : le corridor démo suit la géométrie OSM, pas une invention d’estuaire côtier.
- La validation stricte est **côté API** (`gabon_routes.py`) ; le client mobile/web n’a qu’une approximation + les corridors démo.
