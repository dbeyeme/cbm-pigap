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

## Mise en ligne (Railway)

Réglages portés par le service `cbm-pigap` lui-même depuis le 2026-11-27 (le fichier `railway.toml`
n'est plus lu par Railway après le 2026-12-01) : construction par `Dockerfile`, contrôle de santé
`/health` (120 s), redémarrage en cas d'échec (5 essais). La commande de démarrage est celle du
`Dockerfile` : `alembic upgrade head` puis `uvicorn`. Mise en ligne depuis ce dossier :
`railway up --detach --service cbm-pigap --environment production`.

