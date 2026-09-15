# M6 — Tableau de bord de pilotage

Objectif (§5.6) : indicateurs exacts pour autorités / agents — pêcheurs actifs, volume capturé (période), répartition espèces, alertes actives, zones à forte activité.

## Endpoint

| Méthode | Chemin | Rôles |
|---------|--------|-------|
| GET | `/api/v1/dashboard?debut=&fin=` | autorité, agent, admin, chercheur |
| GET | `/api/v1/dashboard/series?debut=&fin=&grain=jour\|semaine\|mois` | idem — séries exactes |

## Tester

```bash
cd backend && .venv/bin/python -m pytest app/tests/test_m6_dashboard.py -q
```
