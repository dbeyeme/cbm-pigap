# AIS ZEE Gabon — couche surveillance open data (ADR-005)

## Objectif

Afficher les **navires AIS réels** situés dans la **ZEE gabonaise**,
sans les mélanger aux pirogues / GPS PIGAP.

## Endpoint

| Méthode | Chemin | Rôles |
|---------|--------|--------|
| GET | `/api/v1/ais/live?refresh=` | agent, autorité, admin, chercheur |

## Sources (ordre)

1. **AISStream** WebSocket — **recommandé** (clé gratuite [aisstream.io](https://aisstream.io))
2. Open Waters REST + WebSocket
3. Snapshot local `data/open-data/gabon/ais_zee_snapshot.geojson`
4. Démo seulement si `AIS_DEMO_WHEN_EMPTY=true`

Filtre : `eez_marineregions.geojson` (Marine Regions, CC-BY-4.0).

## Config

```bash
AIS_ENABLED=true
AISSTREAM_API_KEY=   # obligatoire pour du vrai AIS au Gabon
AIS_COLLECT_SECONDS=25
AIS_DEMO_WHEN_EMPTY=false
```

Collecte manuelle :

```bash
cd backend && source .venv/bin/activate
export AISSTREAM_API_KEY=...
python scripts/collect_ais_gabon.py
```

## Limites

- Couverture AIS terrestre faible sur le Golfe de Guinée → souvent 0 sans AISStream
- Pas d’AIS sur pirogues artisanales / fleuves
- Pas d’historique AIS persisté au-delà du snapshot MVP
