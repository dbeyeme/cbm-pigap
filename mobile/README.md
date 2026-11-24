# Application mobile CBM-PIGAP (Expo)

Application React Native et Expo pour les **pêcheurs** et les **agents de contrôle** (ADR-001).
Autorités, administrateurs et organisations utilisent le portail web.

Compte rendu du lot 3 (socle fiable sur le terrain) : [`docs/lot-3-mobile-socle.md`](../docs/lot-3-mobile-socle.md).

## Ce que fait l'application

| Rôle | Accueil | Onglets |
|------|---------|---------|
| Pêcheur | Déclarer une capture, suivre sa sortie, présenter sa carte, régler | Accueil · Captures · GPS · Abonnement |
| Agent de contrôle | Contrôler une licence par QR, créer un dossier, consulter | Accueil · Captures · GPS · Licences |
| Autres rôles | Refus : le compte s'utilise sur le portail web | |

- **Session conservée.** Le jeton est gardé dans le stockage sécurisé du téléphone (`src/auth/session.ts`) : l'application se rouvre sans redemander le mot de passe, même sans réseau. Il est effacé à la déconnexion et dès que le serveur répond 401 ; l'écran de connexion explique alors pourquoi. Le mot de passe n'est jamais conservé.
- **Hors ligne d'abord.** Captures et positions sont écrites en SQLite (`src/offline/db.ts`) avant tout appel réseau, sous le compte qui les a saisies. L'envoi est automatique (ouverture, retour au premier plan, toutes les minutes, après chaque saisie, à chaque relevé du suivi) ; une saisie refusée n'en bloque aucune autre (`src/offline/batching.ts`).
- **Lieu de pêche.** La déclaration propose une étape « Lieu » : position du téléphone au moment de la saisie, que le pêcheur peut reprendre, corriger à la main ou retirer. Elle part dans `position_capture`.
- **Suivi GPS en arrière-plan.** Le pêcheur démarre et arrête le suivi lui-même, après une explication. Sur Android, un service de premier plan avec notification permanente relève la position écran éteint ; seule l'autorisation « pendant l'utilisation » est demandée (`src/tracking/`). Les agents consultent, ils ne lancent pas de suivi.
- **Carte professionnelle et QR.** Le pêcheur affiche sa carte (identité, licence, validité, QR de vérification publique), même sans réseau. L'agent lit le QR par la caméra ou saisit le numéro, et voit la situation de la licence.
- **Un téléphone, un seul compte pêcheur (ADR-012).** L'application envoie l'identifiant de l'appareil dans l'en-tête `X-Appareil-Id` (`src/device.ts`, `src/api.ts`) et refuse localement un second compte pêcheur (`src/auth/attachment.ts`). Le serveur fera foi (lot 10).
- **Aides contextuelles.** Un seul composant, `HelpTip` : un « ? » discret qui ouvre quelques lignes d'explication.

## Composants d'interface (`src/components/ui/`)

Écrans courts, peu de texte, un repère visuel par élément, cibles tactiles d'au moins 48 dp.

| Composant | Rôle |
|-----------|------|
| `PhotoBanner` | En-tête photographique des écrans principaux, texte blanc sur voile bleu nuit |
| `ScreenHeader` | En-tête simple des écrans secondaires |
| `HelpTip` / `InfoSheet` | Aide « ? » et feuille d'explication (aide, consentement avant une autorisation) |
| `Segmented` | Bascule entre vues |
| `StepBar` | Fil d'étapes (captures, nouveau dossier) |
| `Chip` | Choix unique ou multiple avec icône et coche |
| `ListRow` | Ligne de liste : pastille icône, titre, détail, action |
| `StatTile` / `StatRow` | Chiffre clé avec icône |
| `Notice` | Message d'état (info, ok, warn, error, muted) |
| `ActionTile` | Tuile d'accueil en grille de deux colonnes |
| `AppIcon` | Ionicons par défaut, `mci:` Material Community, `fa6:` FontAwesome 6 |

Les tonalités (`tones`) sont dans `src/theme.ts`. Les photographies du porteur sont dans `assets/photos/` et déclarées dans `src/photos.ts`.

## Lancer en développement

```bash
cd mobile
cp .env.example .env   # puis renseigner EXPO_PUBLIC_API_URL
npx expo start -c
```

Le suivi en arrière-plan, le stockage sécurisé et la caméra demandent une construction de l'application : ils ne fonctionnent pas dans Expo Go. Sur un téléphone physique, l'adresse du serveur est celle du poste sur le réseau local, jamais `localhost`.

Variables de construction : voir [`.env.example`](.env.example). Elles sont figées dans le paquet à la compilation ; aucun secret ne doit y figurer.

## Vérifier

```bash
cd mobile
npx tsc --noEmit        # typage
npm test                # tests de la logique : file hors ligne, session, QR, formats
npx expo-doctor         # santé du projet Expo
npx expo export --platform android --output-dir /chemin/hors/du/depot   # paquet de production
```

Attention : sans `--output-dir`, `expo export` écrit dans `dist/`, qui contient les APK déjà construites.

### Serveur d'essai

`scripts/serveur-essai.mjs` rejoue les situations du terrain sans écrire dans une base : réseau coupé, session expirée, position refusée, refus de l'ADR-012.

```bash
node scripts/serveur-essai.mjs --autonome     # données fictives, aucun autre serveur requis
curl -s -X POST localhost:8790/__essai/mode -d '{"reseau":"coupe"}'
curl -s -X POST localhost:8790/__essai/mode -d '{"session":"expiree"}'
curl -s localhost:8790/__essai                 # ce que l'application a envoyé
```

Construction d'essai pour l'émulateur Android (trafic en clair autorisé vers le poste, à ne jamais diffuser) :

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PIGAP_ESSAI_LOCAL=1 EXPO_PUBLIC_API_URL=http://10.0.2.2:8790
npx expo prebuild --platform android --no-install --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## APK Android (installation directe)

L'adresse du serveur est lue dans `mobile/.env` (`EXPO_PUBLIC_API_URL`) au moment de la compilation. Une construction de diffusion est **refusée** si cette adresse n'est pas en https (`app.config.js`).

```bash
cd mobile
# JDK 17 ou 21 requis (brew install openjdk@17) ; les JDK 24 et 25 font échouer l'étape CMake
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
npx expo prebuild --platform android --no-install --clean   # régénère android/ (ignoré par git)
cd android && ./gradlew assembleRelease
# APK : android/app/build/outputs/apk/release/app-release.apk
```

Toujours régénérer `android/` avec `--clean` avant une construction de diffusion : une construction d'essai y laisse l'autorisation du trafic en clair. `expo prebuild` réécrit aussi les scripts `android` et `ios` de `package.json` ; les rétablir (`expo start --android`, `expo start --ios`).

Les variables `EXPO_PUBLIC_*` sont inscrites dans le paquet à la compilation, et Metro garde ce résultat en cache : après une construction d'essai, une construction de diffusion peut reprendre l'adresse d'essai sans aucune erreur (constaté le 2026-11-24). Construire la diffusion avec un cache neuf, depuis `mobile/android` :

```bash
TMPDIR="$(mktemp -d)" ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease
```

Puis contrôler, depuis `mobile`, l'adresse inscrite dans l'APK (attendu : l'adresse du serveur de production, et aucune adresse d'essai) :

```bash
unzip -p android/app/build/outputs/apk/release/app-release.apk assets/index.android.bundle | grep -a -o -E "https://cbm-pigap-production[a-z.-]*|10\.0\.2\.2:[0-9]+" | sort | uniq -c
```

Pour une construction destinée au terrain, ajouter `EXPO_PUBLIC_MODE_DEMO=false` : les comptes d'essai, le parcours d'exemple et le mot de passe proposé à la création d'un dossier disparaissent de l'application et du paquet. Depuis la 0.2.0, chaque version existe en deux APK, `CBM-PIGAP-<version>-terrain.apk` et `CBM-PIGAP-<version>-demonstration.apk` ; seul le paquet JavaScript change, donc une fois `android/` régénéré, la seconde se construit depuis `mobile/android` sans nouvelle régénération, toujours avec un cache neuf :

```bash
EXPO_PUBLIC_MODE_DEMO=false TMPDIR="$(mktemp -d)" ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease
```

Les deux versions portent le même identifiant d'application : un téléphone n'en garde qu'une.

Identifiant d'application : `com.kimbaconnect.cbmpigap` (`app.json`). La version de diffusion est signée avec la clé de débogage par défaut : suffisant pour une installation directe, à remplacer par une clé propre au projet avant toute diffusion large. L'identifiant Android transmis au serveur (ADR-012) dépend de cette clé : la fixer avant la mise en service de la règle.

Diffusion : l'accueil du portail web pointe vers
`https://github.com/dbeyeme/cbm-pigap/releases/latest/download/CBM-PIGAP.apk` (adresse modifiable par `VITE_APK_URL` côté web). Pour diffuser une nouvelle version, publier l'APK sous le nom exact `CBM-PIGAP.apk` dans une nouvelle version marquée « latest », puis mettre à jour la version et la taille affichées dans `web/src/pages/LandingPage.tsx` (constante `APK`).

Carte Android : sans clé Google, l'écran GPS assemble un fond de carte par tuiles raster (`TileTrajectoryMap`) avec le parcours superposé ; hors réseau, repli sur le tracé schématique. Variables facultatives : `EXPO_PUBLIC_TILE_URL_TEMPLATE`, `EXPO_PUBLIC_TILE_ATTRIBUTION`, `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`. Prévoir un fournisseur de tuiles contractualisé avant un déploiement large.

## Modules couverts

- M1, agent : créer un pêcheur et son embarcation (numéro de licence attribué automatiquement), rechercher une licence, contrôler une licence par QR
- M2, GPS : suivi en arrière-plan du pêcheur, envoi d'une position isolée, consultation de la flotte par l'agent
- M4, captures : déclaration hors ligne avec lieu de pêche, envoi automatique
- Abonnement et redevances du pêcheur, numéro Mobile Money modifiable
- Écran de bienvenue à la première ouverture, mémorisé sur le téléphone
