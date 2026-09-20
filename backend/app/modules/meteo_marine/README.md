# Météo-marine — bulletin, zones calculées, alertes automatiques (ADR-008)

## Objectif

Signaler automatiquement aux autorités et aux pêcheurs les risques (mer, vent,
courant, visibilité, crues) et les opportunités de pêche, et présenter sur la
carte les secteurs de danger, de prudence, favorables ou surexploités, à partir
du croisement de données ouvertes et des données PIGAP.

## Endpoints

| Méthode | Chemin | Rôles | Description |
|---------|--------|-------|-------------|
| GET | `/api/v1/meteo/bulletin?refresh=` | tous rôles authentifiés | Bulletin par secteur et station fluviale, synthèse |
| GET | `/api/v1/meteo/zones` | idem | Polygones des secteurs avec classe et motifs (carte) |
| GET | `/api/v1/meteo/avis?lon=&lat=` | idem | Avis en langage clair pour une position (mobile) |

## Sources et croisements

- Open-Meteo Marine / Prévisions / Flood (CC BY 4.0, sans clé) : houle, période,
  courant, température, hauteur d'eau, vent, rafales, pluie, visibilité, débit GloFAS.
- PIGAP : captures déclarées sur 30 jours dans le rayon du secteur, quotas des
  zones réglementées contenant le secteur, zones interdites actives.

## Règles

| Élément | Règle |
|---------|-------|
| Risque pirogue | orange dès houle ≥ 1,8 m, rafales ≥ 22 nd, courant ≥ 1,2 nd, visibilité < 4 km, pluie ≥ 5 mm/h ; rouge dès houle ≥ 2,5 m, rafales ≥ 30 nd, courant ≥ 2 nd, visibilité < 1 km |
| Risque navire | rouge seulement au-delà de houle ≥ 4 m ; orange pour rafales ≥ 30 nd ou courant ≥ 2 nd |
| Danger | risque pirogue rouge ou zone interdite active |
| Surexploitée | un quota du secteur consommé à ≥ 90 % |
| Favorable | score ≥ 65 : mer praticable, température 23,5–28,5 °C, captures récentes au-dessus de la médiane, quota < 75 %, marée montante |
| Crue | débit moyen prévu ≥ 1,4 × débit du jour dans la semaine |

Les alertes automatiques (type `anomalie`, règles `meteo_marine` et
`crue_fleuve`) sont émises une fois par bloc de six heures et par secteur, et
publiées sur le bus de notifications. Seuils dans `.env` (`METEO_*`).

## Tests

```bash
cd backend && source .venv/bin/activate && pytest app/tests/test_meteo_marine.py -q
```

## Limites

- Modèles globaux (résolution kilométrique), non validés localement ; la station
  Komo à Kango présente un débit GloFAS peu réaliste, à recaler.
- Pas de chlorophylle : l'opportunité repose sur la mer, la température et
  l'historique déclaré. Aide à la décision, jamais injonction.

## Données embarquées

Les fichiers de `data/open-data/gabon/` utilisés à l'exécution sont copiés dans `backend/app/data/gabon/` pour l'image Docker : après toute modification, lancer `python scripts/sync_data.py` (le test `test_datafiles.py` vérifie la synchronisation).
