# Lot 8 — Périmètre de suivi multi-zones (ADR-015)

Référentiel de zones activables (pays, province, ville, côte, fleuve) pour cadrer les **lectures** cartographiques : positions, trajectoires, navires en direct, alertes liées à une embarcation positionnée.

## Comportement

- Seul l'**administrateur** peut activer ou désactiver une zone (`PATCH`).
- Une zone **inactive** masque aussi l'**historique** dans son emprise (aucune suppression en base).
- Filtre serveur : union PostGIS `ST_Union` des emprises actives, puis `ST_Intersects` sur les points.
- Variable `PERIMETRE_FILTRE_ACTIF` (défaut `true`) : désactivable en test si besoin.
- Emprises seedées **fictives, à valider** (boîtes englobantes approximatives).

## Endpoints

| Méthode | Chemin | Rôles |
|---------|--------|-------|
| GET | `/api/v1/perimetre` | admin, agent, autorité |
| GET | `/api/v1/perimetre/filtre` | admin, agent, autorité |
| PATCH | `/api/v1/perimetre/{id}` | admin seul (`{"actif": bool}`) |

## Zones par défaut (toutes actives au seed)

`gabon`, `estuaire`, `libreville`, `owendo`, `akanda`, `cap_esterias`

## Tests

```bash
cd backend && pytest app/tests/test_lot8_perimetre.py -q
```