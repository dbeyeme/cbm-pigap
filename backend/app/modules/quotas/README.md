# M5 — Gestion des quotas

Objectif (§5.5) : définir un quota par espèce (+ zone/période optionnelles), recalculer la consommation à chaque capture, alerter à 90 % puis 100 %.

## Endpoints

| Méthode | Chemin | Rôles |
|---------|--------|-------|
| POST | `/api/v1/quotas` | autorité, agent, admin |
| GET | `/api/v1/quotas` | + chercheur |
| GET | `/api/v1/quotas/alertes` | lecture |
| GET/PATCH/DELETE | `/api/v1/quotas/{id}` | lecture / admin |

## Consommation

À chaque création / sync / MAJ / suppression de capture, `refresh_quotas_for_especes` recalcule `volume_consomme_kg` (somme des captures de l’espèce dans la période ; si `zone_id`, uniquement positions `ST_Intersects`).

## Alertes

Type `depassement_quota`, `declencheur` JSON obligatoire (`regle`, `quota_id`, `seuil`, volumes…). Une alerte par seuil (0.9 / 1.0), pas de doublon.

## Tester

```bash
cd backend && pytest app/tests/test_m5_quotas.py -q
```
