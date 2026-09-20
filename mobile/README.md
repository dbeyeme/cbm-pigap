# Mobile CBM-PIGAP (Expo)

Application React Native / Expo — **pêcheurs** et **agents de contrôle** (ADR-001 Accepté).
Autorités / admin / organisations : portail web.

## Design « Marée »

Identité visuelle océan gabonais : fond, glassmorphism, typo Fraunces + DM Sans, Ionicons.

## Parcours multi-rôles

Après login, `GET /api/v1/auth/me` oriente l’UI :

| Rôle | Accueil | Onglets |
|------|---------|---------|
| `pecheur` | Captures, GPS perso, abonnement B2C | Accueil · Captures · GPS · Abo |
| `agent_controle` | Dossiers, licences, GPS flotte | Accueil · Captures · GPS · Licences |
| Autres | Refus — utiliser le portail web | — |

```bash
# API locale
docker compose -f infra/docker-compose.yml up -d db
cd backend && source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload --port 8000
python scripts/seed_production_demo.py
# agent@example.com / AgentPass123!
# pecheur1@example.com / PecheurPass1!

# Mobile
cd mobile
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npx expo start -c
```

Sur appareil physique, remplacer l’URL par l’IP LAN (`http://192.168.x.x:8000`).

Pas d’image Docker mobile (Expo Go / build EAS). Le `backend/Dockerfile` n’a pas besoin d’être reconstruit pour cette UI.

## Modules couverts

- M1 agent : créer pêcheur + embarcation, recherche licence
- M2 GPS : tracking (scope API selon rôle)
- M4 captures offline SQLite + sync
- Abonnement B2C (écran pêcheur)
