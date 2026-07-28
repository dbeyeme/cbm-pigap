# Web CBM-PIGAP

Portail autorités — React + TypeScript + **MapLibre GL** (ADR-002).

## M2 — trajectoires

Carte des positions chronologiques filtrées par embarcation.

```bash
# API
cd backend && uvicorn app.main:app --reload --port 8000
python scripts/seed_agent.py

# Web (proxy /api → :8000)
cd web
npm install
npm run dev
# http://127.0.0.1:5173 — agent@example.com / AgentPass123!
```

Pour une démo carte : créer une embarcation (mobile/API) puis `POST /api/v1/positions/batch` avec 10 points, puis « Afficher trajectoire ».
