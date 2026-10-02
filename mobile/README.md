# Mobile CBM-PIGAP (Expo)

Application React Native / Expo — **pêcheurs** et **agents de contrôle** (ADR-001 Accepté).
Autorités / admin / organisations : portail web.

## Design « Marée »

Identité visuelle océan gabonais : fond, glassmorphism, typo Fraunces + DM Sans, Ionicons.

## Composants d'interface (`src/components/ui/`)

Écrans courts, peu de texte, un repère visuel par élément :

| Composant | Rôle |
|-----------|------|
| `ScreenHeader` | Retour, surtitre, titre, action droite (un seul style d'en-tête) |
| `Segmented` | Bascule entre vues (Nouvelle / Historique, familles d'espèces) |
| `StepBar` | Fil d'étapes (captures, nouveau dossier) |
| `Chip` | Choix unique ou multiple avec icône et coche |
| `ListRow` | Ligne de liste : pastille icône, titre, détail, action |
| `StatTile` / `StatRow` | Chiffre clé avec icône, remplace une phrase |
| `Notice` | Message d'état (info, ok, warn, error, muted) |
| `ActionTile` | Tuile d'accueil en grille 2 colonnes |
| `AppIcon` | Ionicons par défaut, `mci:` Material Community, `fa6:` FontAwesome 6 |

Les tonalités (`tones`) sont dans `src/theme.ts`.

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

Pas d’image Docker mobile. Le `backend/Dockerfile` n’a pas besoin d’être reconstruit pour cette UI.

## APK Android (installation directe, API de production)

L’URL d’API est lue dans `mobile/.env` (`EXPO_PUBLIC_API_URL`) au moment de la compilation :
l’APK reste donc connecté à l’API déclarée dans ce fichier.

```bash
cd mobile
export ANDROID_HOME="$HOME/Library/Android/sdk" JAVA_HOME="$(/usr/libexec/java_home)"
npx expo prebuild --platform android --no-install   # génère android/ (ignoré par git)
cd android && ./gradlew assembleRelease
# APK : android/app/build/outputs/apk/release/app-release.apk
```

Identifiant d’application : `com.kimbaconnect.cbmpigap` (`app.json`). La version release est signée
avec la clé de débogage par défaut : suffisant pour une installation directe, à remplacer par une
clé propre avant toute publication sur un magasin. La carte Android (Google Maps) nécessite une clé
d’API dans `app.json` ; sans clé, le fond de carte reste vide sur Android.

## Écran de bienvenue et numéro Mobile Money

- Première ouverture : trois volets (déclarer, naviguer, régler), mémorisés dans SQLite (`app_settings`).
- Le pêcheur modifie son numéro Mobile Money depuis l’écran Abonnement (`PATCH /api/v1/auth/me/telephone`).

## Modules couverts

- M1 agent : créer pêcheur + embarcation, recherche licence
- M2 GPS : tracking (scope API selon rôle)
- M4 captures offline SQLite + sync
- Abonnement B2C (écran pêcheur)
