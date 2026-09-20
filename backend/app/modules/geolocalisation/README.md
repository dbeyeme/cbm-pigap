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
| GET | `/api/v1/positions/live?since_minutes=` | Circulation near-live (dernière position / bateau) |
| GET | `/api/v1/positions/trajectory?...` | Points d’une embarcation (filtre période) |
| GET | `/api/v1/positions/embarcations` | Embarcations visibles selon rôle |

Géométries GeoJSON Point SRID 4326. Source `mobile` (MVP) ou `balise` (extension V2).

## Tester

```bash
cd backend
pytest app/tests/test_m2_geoloc.py -q

# Semis historique + ping live
python scripts/seed_maritime_scenarios.py
# Optionnel : flotte qui avance toutes les 20 s
python scripts/simulate_live_fleet.py

# Web : Navires / Surveillance → « Circulation live » (poll 20 s)
# Dashboard : carte « Suivi des navires en temps réel »
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


## Présence au port (ajout 2026-09-20)

`GET /api/v1/positions/presence-ports?fenetre_heures=24` — calculée depuis les
positions GPS PIGAP, sans matériel supplémentaire, sur le référentiel de ports
partagé avec la couche AIS (`data/open-data/gabon/ports.json`).

| Statut | Règle |
|--------|-------|
| `a_quai` | dernière position dans le rayon d'un port, immobile depuis ≥ `PRESENCE_PORT_MIN_MINUTES` (10) |
| `en_manoeuvre` | dans le rayon d'un port depuis moins que le seuil (arrivée ou départ en cours) |
| `en_mer` | hors de tout rayon portuaire ; `dernier_port` et `dernier_depart` renseignés si connus |
| `sans_signal` | dernière position plus ancienne que `PRESENCE_SILENCE_HEURES` (6) |

Par port : effectifs, arrivées et départs détectés (transitions sur la fenêtre),
débarquements déclarés. Chaque déclaration de capture dont le point de
débarquement cite un port est rapprochée de la présence GPS
(`coherente` si présence au port à ± `PRESENCE_TOLERANCE_HEURES`, sinon
`incoherente` ; `non_verifiable` sans GPS). Les incohérences sont listées pour
contrôle.

Masque d'eau : les quais hors polygone ZEE (Libreville, Port-Gentil, Mayumba,
Cocobeach, Cap Lopez) sont acceptés dans le rayon `rayon_quai_km` du référentiel ;
la rade intérieure de Port-Gentil au-delà de 2,5 km reste refusée (limite du
masque, à traiter avec un polygone portuaire dédié).
