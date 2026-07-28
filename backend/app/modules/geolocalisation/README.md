# M2 — Géolocalisation & suivi GPS

## Objectif

Envoi de positions depuis le mobile, historique filtrable, affichage trajectoire chronologique (§5.2).

## Endpoints

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/v1/geoloc/config` | `gps_interval_minutes` (paramétrable) |
| POST | `/api/v1/positions` | Une position |
| POST | `/api/v1/positions/batch` | Lot de positions (sync) |
| GET | `/api/v1/positions/trajectories` | Toutes les sorties (multi-trajets / bateau) |
| GET | `/api/v1/positions/trajectory?...` | Points d’une embarcation (filtre période) |
| GET | `/api/v1/positions/embarcations` | Embarcations visibles selon rôle |

Géométries GeoJSON Point SRID 4326. Source `mobile` (MVP) ou `balise` (extension V2).

## Tester

```bash
cd backend
pytest app/tests/test_m2_geoloc.py -q

# Mobile : scénarios Côte→mer / Ogooué / étranger
# Carte web : après login, toutes les trajectoires ; clic = isoler une sortie
```

## Géographie (open data)

Validation `is_on_water` = masque **ZEE Marine Regions (CC-BY-4.0)** ∪ buffers **fleuves OSM (ODbL)**  
→ `data/open-data/gabon/` (voir `SOURCES.md`).

Corridors démo (extraits de ces géométries) : Estuaire→mer, Mondah, Komo, Ogooué, Ntem, Mayumba, navire étranger→ZEE…

```bash
# Rafraîchir les jeux (réseau) + sync web/mobile
python scripts/fetch_gabon_opendata.py
# Reconstruire masque/routes sans retélécharger
python scripts/fetch_gabon_opendata.py --offline

python scripts/seed_maritime_scenarios.py
```

Hors eau → `POSITION_HORS_EAU` ; segment terre → `TRAJECTOIRE_PASSAGE_TERRESTRE`.  
Agents : `maritime-trajectory`, `fisheries-halieutique`.
