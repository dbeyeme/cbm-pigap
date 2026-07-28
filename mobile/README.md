# Mobile CBM-PIGAP (Expo)

Application React Native / Expo — pêcheurs & agents (ADR-001 Accepté).

## Design « Marée »

Identité visuelle océan gabonais : fond animé, glassmorphism (`BlurView`), typo Fraunces + DM Sans, icônes Ionicons, transitions Reanimated.

## M1 — parcours agent

Écrans : connexion → créer pêcheur + embarcation → recherche (nom / licence).

```bash
# API locale
docker compose -f infra/docker-compose.yml up -d db
cd backend && source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload --port 8000
python scripts/seed_agent.py   # agent@example.com / AgentPass123!

# Mobile (cache clean après babel / Reanimated)
cd mobile
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npx expo start -c
```

Sur appareil physique, remplacer l'URL par l'IP LAN (`http://192.168.x.x:8000`).

## Hors M1

Offline-first SQLite + file de sync : M4. GPS : M2.
