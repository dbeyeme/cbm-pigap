# Backend CBM-PIGAP

API FastAPI + PostgreSQL/PostGIS (cahier §3.2 / §3.4).

## Prérequis

- Python 3.11+
- Docker (pour PostGIS local)

## Démarrage local

```bash
# Depuis la racine du monorepo
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d db

cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Vérifier : `curl http://127.0.0.1:8000/health` → `{"status":"ok"}`

## Tests

```bash
cd backend
pytest
```

## Migrations

```bash
docker compose -f infra/docker-compose.yml up -d db
cd backend
alembic upgrade head
```

## Endpoints (Phase 0)

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/health` | Santé API (200) |
| GET | `/docs` | OpenAPI interactif |

Contrats métier (Pydantic) : voir `docs/api-contracts.md`. Routes `/api/v1/...` à partir de la Phase 2.
