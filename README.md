# CBM-PIGAP

Plateforme Intelligente Gabonaise des Activités de Pêche — MVP (Kimba Connect / Gabon).

## Documents de pilotage

| Document | Rôle |
|----------|------|
| [CONTEXT.md](CONTEXT.md) | Point d'entrée rapide |
| [cdc-mvp-pigap.md](cdc-mvp-pigap.md) | Cahier technique MVP (contrat) |
| [AGENTS.md](AGENTS.md) | Instructions pour les agents Cursor |
| [docs/STATUS.md](docs/STATUS.md) | Avancement courant |
| [docs/JOURNAL.md](docs/JOURNAL.md) | Journal de réalisation |
| [docs/AGENT_SYSTEM.md](docs/AGENT_SYSTEM.md) | Cartographie agents / skills / règles |

## Structure (monorepo §3.4)

```
backend/   # FastAPI + SQLAlchemy async + PostGIS
mobile/    # React Native (placeholder — Phase 1)
web/       # Portail autorités (placeholder — M6)
infra/     # docker-compose PostGIS + API
docs/      # Suivi, ADR, checklists
```

## Démarrage rapide (Phase 0)

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d db

cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

- Santé : http://127.0.0.1:8000/health → `{"status":"ok"}`
- Docs OpenAPI : http://127.0.0.1:8000/docs
- Tests : `cd backend && pytest`

API + base ensemble :

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

## État

Voir [docs/STATUS.md](docs/STATUS.md).
