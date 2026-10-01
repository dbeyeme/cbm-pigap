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

## Balises satellitaires, `source=balise` (ADR-009, ajout 2026-10-01)

Point d'entrée du flux de balises déployées par l'État sur les pirogues (données
**fictives** tant que l'accès au flux réel n'est pas obtenu).

| Méthode | Chemin | Description |
|---------|--------|-------------|
| POST | `/api/v1/positions/balises/ingest` | Lot de messages de balises (clé `X-Balise-Ingest-Key` = `BALISE_INGEST_KEY`) |

- Rapprochement balise ↔ embarcation par `embarcations.balise_id` (unique, saisi au registre M1).
- Message pivot : `balise_id`, `lat`, `lon`, `horodatage`, `vitesse_noeuds`, `cap_degres`, `alerte`.
- Règles : balise inconnue listée dans `balises_inconnues` ; position à terre comptée `hors_eau` ;
  doublon (même embarcation, horodatage, source) ignoré ; `alerte=true` → alerte critique
  `detresse_balise` (type anomalie, une seule par bouton maintenu pendant 12 h).
- Les règles M7 (zone interdite, limite, concentration…) s'appliquent comme au mobile.

```bash
cd backend
pytest app/tests/test_balises_ingest.py -q

# Simulation fictive (attribue BAL-FICTIF-000n aux embarcations sans balise)
BALISE_INGEST_KEY=demo-balise python scripts/simulate_balises_nemo.py
# un lot puis sortie, avec détresse sur la première pirogue :
BALISE_ONCE=1 BALISE_SOS=1 BALISE_INGEST_KEY=demo-balise python scripts/simulate_balises_nemo.py
```
