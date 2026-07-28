# Infrastructure locale CBM-PIGAP

## Services

```bash
# Depuis la racine du monorepo
cp .env.example .env   # si pas déjà fait
docker compose -f infra/docker-compose.yml up -d
```

| Service | Image / build | Port | Rôle |
|---------|---------------|------|------|
| `db` | `postgis/postgis:15-3.4` | 5432 | PostgreSQL + PostGIS |
| `api` | `backend/Dockerfile` | 8000 | FastAPI |

Vérifier PostGIS :

```bash
docker compose -f infra/docker-compose.yml exec db \
  psql -U pigap -d pigap -c "SELECT PostGIS_Version();"
```

Vérifier l'API : `curl http://127.0.0.1:8000/health`

## CI/CD

Les workflows GitHub Actions sont dans [`.github/workflows/`](../.github/workflows/) à la **racine** du dépôt (exigence GitHub). Voir le journal Phase 0 pour le détail de cet écart par rapport au schéma §3.4.
