# M1 — Enregistrement pêcheurs & embarcations

## Objectif

CRUD pêcheur / embarcation / licence, recherche par nom ou n° de licence (§5.1).

## Endpoints (`/api/v1`)

| Méthode | Chemin | Rôles |
|---------|--------|-------|
| POST | `/auth/login` | public |
| GET | `/auth/me` | authentifié |
| POST/GET/PATCH | `/organisations`… | agent, admin, autorité |
| POST/GET/PATCH/DELETE | `/pecheurs`… | agent, admin, autorité |
| GET | `/pecheurs?q=` | recherche |
| POST/GET/PATCH/DELETE | `/embarcations`… | agent, admin, autorité |

## Tester

```bash
cd backend
pytest app/tests/test_m1_pecheurs.py app/tests/test_health.py -q
python scripts/seed_agent.py
uvicorn app.main:app --reload --port 8000
# OpenAPI : http://127.0.0.1:8000/docs
```

Données de test **fictives** uniquement.
