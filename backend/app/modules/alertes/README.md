# M7 — Alertes intelligentes

Règles MVP (§5.7), sans ML :

1. **zone_interdite** — position GPS / capture géolocalisée ∩ zone `interdite` (`ST_Intersects`)
2. **depassement_quota** — déjà émis par M5 (90 % / 100 %)
3. **anomalie** — volume 7 jours > 2× moyenne historique 7j de l’embarcation

Chaque alerte a un `declencheur` JSON obligatoire.

## Endpoints

| Méthode | Chemin | Rôles |
|---------|--------|-------|
| GET | `/api/v1/alertes` | autorité, agent, admin, chercheur |
| PATCH | `/api/v1/alertes/{id}` | autorité, agent, admin (statut) |

## Tester

```bash
cd backend && .venv/bin/python -m pytest app/tests/test_m7_alertes.py -q
```
