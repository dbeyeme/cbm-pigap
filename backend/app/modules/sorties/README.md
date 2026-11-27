# Sorties (lot 11)

Déclaration de sortie / retour, alerte « non rentrée », lieu de pêche proposé depuis la trace GPS. Règles dans `app/data/regles/sorties.json` (statut **Proposé**, ADR-016).

## Endpoints (`/api/v1`)

| Méthode | Chemin | Rôles |
|---------|--------|--------|
| `POST` | `/sorties` | pêcheur (ses embarcations), admin |
| `POST` | `/sorties/{id}/retour` | pêcheur propriétaire, agent, admin |
| `GET` | `/sorties` · `/sorties/{id}` | selon périmètre |
| `GET` | `/sorties/lieu-de-peche` | pêcheur / agent / autorité / admin |

## Tester

```bash
cd backend && .venv/bin/python -m pytest app/tests/test_lot11_sorties.py -q
```
