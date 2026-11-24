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

## Fonds de carte (ADR-010)

Le style est défini dans `src/geo/mapStyle.ts` : imagerie satellitaire, fond et noms de lieux vectoriels OpenStreetMap servis sans clé. Toute couche de texte utilise les polices `MAP_FONT_*` de ce fichier.

```bash
npm test        # garde-fou : hôtes de tuiles interdits, polices manquantes
npm run build   # lance d'abord le garde-fou, puis le typage et la construction
```

Variables de construction : `VITE_MAP_TILES_URL` (service de tuiles hébergé par la plateforme), `VITE_DEMO_ACCOUNTS=true` (rappel des comptes de démonstration, instance de démonstration uniquement).

Pour diagnostiquer une carte, tester les tuiles hors cache du navigateur : une ancienne tuile en cache peut masquer un défaut du fournisseur.

Pour une démo carte : créer une embarcation (mobile/API) puis `POST /api/v1/positions/batch` avec 10 points, puis « Afficher trajectoire ».
