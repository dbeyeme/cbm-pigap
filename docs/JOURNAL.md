# JOURNAL — CBM-PIGAP

Journal de réalisation du MVP. Format imposé par le cahier technique §11.
Chaque module terminé = une entrée. Langage clair pour le porteur de projet.

---

## [2026-07-27] — Phase 0 : socle agents, règles, skills et suivi

**Ce qui a été construit :**
- `AGENTS.md` : contrat de travail pour tout agent Cursor
- Sous-agents projet dans `.cursor/agents/` : `module-builder`, `module-verifier`, `backend-geospatial`, `mobile-offline`, `web-dashboard`, `security-auditor`, `journal-keeper`
- Règles Cursor dans `.cursor/rules/` (core, discipline de phase, backend, mobile, web, sécurité, documentation)
- Skills projet : `start-module`, `finish-module`, `update-journal`, `write-adr`, `pigap-status`
- Documents de suivi : `docs/STATUS.md`, ce `JOURNAL.md`, index ADR, checklists Phase 0/DoD
- Hooks Cursor : injection du statut en début de session + rappel de journalisation en fin de tour

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §0 et §11 : le cahier est le contrat agent ↔ porteur ; le journal et le suivi module par module sont obligatoires
- §9 Phase 0 : création du `JOURNAL.md` et amorçage de la discipline avant le code
- §3.1 / §8 : modularité, DoD et commits conventionnels encodés dans les règles et agents

**Technologies / principes utilisés :**
- Cursor Rules (`.mdc`), Skills (`SKILL.md`), Subagents (`.cursor/agents/*.md`), Hooks (`hooks.json`)
- Séparation des responsabilités : construire / vérifier / sécuriser / documenter

**Tests réalisés :**
- Non applicables (pas encore de code applicatif). Vérification structurelle : arborescence créée.

**Points ouverts / dette technique :**
- ~~Initialiser le monorepo (§3.4), docker-compose PostGIS, squelette FastAPI `/health`, CI~~ → traité dans l'entrée suivante
- Décisions Expo vs bare et MapLibre vs Leaflet à trancher en Phase 1 (ADR)

---

## [2026-07-27] — Phase 0 : monorepo, PostGIS, FastAPI `/health`, CI

**Ce qui a été construit :**
- Structure monorepo §3.4 : `backend/`, `mobile/`, `web/`, `infra/`, `.github/workflows/`
- `infra/docker-compose.yml` : PostgreSQL 15 + PostGIS 3.4 (`pigap-db`) + service API optionnel
- Squelette FastAPI (`backend/app/`) : config, logging structlog, session SQLAlchemy async, route `GET /health` → 200
- Tests : `pytest` (`test_health_returns_200` vert) ; lint `ruff` + format `black`
- Pipeline CI GitHub Actions : lint + tests à chaque push/PR sur `main` et `feature/**`
- Dépôt Git local initialisé à la racine du projet ; `.env.example` + `.gitignore`
- Placeholders `mobile/` et `web/` (README) en attendant Phase 1 / M6

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 0 : monorepo, docker-compose PostGIS, squelette `/health`, CI
- §3.2 / §3.4 : stack et arborescence retenues pour le dossier Kimba Connect
- §3.1 sobriété : pas de logique métier avant Phase 1 / M1

**Technologies / principes utilisés :**
- FastAPI, Pydantic Settings, structlog, SQLAlchemy 2 async, GeoAlchemy2 (prêt), Alembic (dossier réservé)
- Docker Compose + image `postgis/postgis:15-3.4`
- GitHub Actions (`actions/setup-python`, ruff, black, pytest)

**Tests réalisés :**
- `ruff check app` : OK
- `black --check app` : OK
- `pytest` : 1 passed (`GET /health` → 200 / `{"status":"ok"}`)
- PostGIS local : `SELECT PostGIS_Version()` → 3.4 (GEOS/PROJ actifs)
- Curl manuel : `http://127.0.0.1:8000/health` → 200

**Points ouverts / dette technique :**
- Écart §3.4 : workflows CI placés en `.github/workflows/` (racine) car GitHub n'exécute pas `infra/.github/workflows/` — pointeur documenté dans `infra/`
- Image PostGIS forcée `platform: linux/amd64` (émulation sur Apple Silicon) — à revoir si une image multi-arch stable convient
- Alembic non initialisé (prévu Phase 1) ; auth JWT pas encore branchée (dès le premier endpoint métier)
- Validation humaine Phase 0 recommandée avant Phase 1

---

## [2026-07-27] — Phase 1 : schéma DB, contrats API, maquettes, ADR

**Ce qui a été construit :**
- Modèles SQLAlchemy §4 : Utilisateur, Pêcheur, Embarcation, Position, ZoneReglementee, Capture, Quota, Alerte (+ `Organisation` minimale pour la FK, + `LogAcces` §7)
- Migration Alembic `34280c301303_initial_schema_phase1` appliquée sur PostGIS local (extension PostGIS créée dans `env.py`)
- Contrats Pydantic M1–M7 + auth/commun (`docs/api-contracts.md`)
- Maquettes basse fidélité : `docs/maquettes/mobile-pecheur.md`, `docs/maquettes/web-dashboard.md`
- ADR-001 (Expo, Proposé) et ADR-002 (MapLibre, Proposé)
- Tests : health + import modèles/contrats (3 passed)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 1 : schéma Alembic, contrats API avant code métier, maquettes, décision mobile
- §4 / §6 / §7 : modèle de données, conventions API, journal d'accès
- §3.1 sobriété : pas de routes métier encore (Phase 2 / M1)

**Technologies / principes utilisés :**
- SQLAlchemy 2 + GeoAlchemy2 (Point/Polygon SRID 4326), Alembic + psycopg
- Pydantic v2 (contrats), UUID comme clés (préparation sync offline M4)
- Filtre Alembic pour ignorer tables système PostGIS/Tiger à l'autogenerate

**Tests réalisés :**
- `alembic upgrade head` : OK (tables métier créées)
- `pytest` : 3 passed
- `ruff` / `black` : OK

**Points ouverts / dette technique :**
- **Validation humaine obligatoire** avant Phase 2 (ADR-001/002, maquettes, liste d'espèces)
- `Organisation` non détaillée au §4 — table minimale `id, nom, date_creation` ajoutée pour la FK
- `NiveauGravite` (`info|attention|critique`) et `ESPECES_MVP` inventés provisoirement — à confirmer
- Auth JWT / hash argon2 : dès le premier endpoint M1
- Index spatiaux créés automatiquement par GeoAlchemy2 (pas de doublon dans la migration)
---

## [2026-07-27] — Phase 1 clôturée + Module M1 : pêcheurs & embarcations

**Ce qui a été construit :**
- Validation humaine Phase 1 : ADR-001 Expo, ADR-002 MapLibre, maquettes, espèces et gravités — **Acceptés**
- ADR-003 : Organisation / société extensible (colonnes stables + `attributs` JSONB)
- Migration `b7e4a1c90211_organisations_robustes_m1`
- Auth JWT + argon2 (`/api/v1/auth/login`, `/me`) + `require_role` sur routes M1
- CRUD organisations, pêcheurs (licence obligatoire), embarcations + recherche `GET /pecheurs?q=`
- App Expo (agent) : login, création pêcheur+embarcation, recherche
- Seed agent fictif : `python scripts/seed_agent.py` (`agent@example.com`)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 1 validation + démarrage Phase 2
- §5.1 acceptation : créer pêcheur + embarcation et retrouver par nom/licence
- §6 / §7 : rôles sur endpoints, hash mots de passe dès le premier endpoint métier
- Demande porteur : organisation extensible sans recréer le schéma (ADR-003)

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy async, Alembic, argon2-cffi, PyJWT, Expo (blank-typescript)
- Erreurs API `{detail, code}` via handler `ApiError`

**Tests réalisés :**
- `pytest` : 6 passed (health, contrats Phase 1, acceptation M1 §5.1, auth 401)
- `ruff` / `black` : OK
- `tsc --noEmit` (mobile) : OK

**Points ouverts / dette technique :**
- Token mobile en mémoire (SecureStore à brancher)
- CI GitHub pas encore exécutée sur dépôt distant
- Parcours pêcheur (hors agent) et offline : M4
- Revue `module-verifier` / `security-auditor` recommandée avant M2

---

## [2026-07-27] — Module M2 : géolocalisation & suivi GPS

**Ce qui a été construit :**
- API positions : `POST /positions`, `POST /positions/batch`, `GET /positions/trajectory` (ordre chrono), filtre période, `GET /geoloc/config` (`gps_interval_minutes`)
- Filtrage d’accès par rôle (pêcheur = ses embarcations ; agent/autorité/admin/chercheur = plus large)
- Tests §5.2 : trajectoire 10 points GPS chronologiques (même si batch désordonné)
- Mobile Expo : écran « Suivi GPS » (permission + envoi périodique + historique)
- Web MapLibre : page trajectoire (filtre embarcation) — ADR-002
- CORS API pour le portail local

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2 envoi périodique paramétrable, historique carte, acceptation 10 points chrono
- §3.2 / ADR-002 MapLibre ; point d’extension `source=balise` déjà au schéma
- §7 filtrage géoloc par rôle

**Technologies / principes utilisés :**
- PostGIS `ST_AsGeoJSON` + WKT Point 4326, FastAPI, Expo Location, MapLibre GL JS, Vite React

**Tests réalisés :**
- `pytest` : 10 passed (régression M1 + M2)
- `tsc` mobile : OK

**Points ouverts / dette technique :**
- Style tuiles démo MapLibre (remplacer en staging)
- Intervalle GPS en minutes entières (pas de sous-minute en MVP)
- Carte native mobile non embarquée (historique liste + carte web autorités)

---

## [2026-07-27] — M2 (complément) : données open source Gabon

**Ce qui a été construit :**
- Jeux open data sous `data/open-data/gabon/` : ZEE Marine Regions, fleuves OSM, `water_mask.geojson`, corridors `demo_routes_opendata.json`
- `gabon_routes.py` charge le masque réel (plus de polygones inventés) ; script `fetch_gabon_opendata.py` (+ sync web/mobile)
- Attribution / licences : `SOURCES.md` ; décision **ADR-004**
- Dépendance `shapely` pour construction du masque

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Réalisme terrain §5.2 / préparation M3 ; données publiques (pas de secrets, pas de PII)

**Technologies / principes utilisés :**
- Marine Regions EEZ v12 (CC-BY-4.0), OpenStreetMap Overpass (ODbL 1.0), Shapely, GeoJSON

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 11 passed
- `tsc --noEmit` web + mobile : OK

**Points ouverts / dette technique :**
- Overlay EEZ/fleuves sur la carte web (optionnel)
- Enrichir le masque avec polygones `natural=water` si Overpass/miroir stable
- Relancer `seed_maritime_scenarios.py` après redémarrage API pour revoir les trajets

---

## [2026-07-27] — Gate M2 → M3 : revue experts + démarrage M3

**Ce qui a été construit :**
- Revue trajectoires (maritime) : **SATISFAIT** — 13/13 corridors en eau, rejet GPS ville/simulateur OK, Go M3
- Revue pêche artisanale (halieutique) : **RÉSERVES** non bloquantes — Go M3
- Démarrage module **M3** (zones réglementées) : STATUS mis à jour, branche suggérée `feature/m3-zones`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Discipline de phase : ne pas avancer sans validation métier / trajectoire
- §5.3 / §9 : prochain sous-jalon Phase 2

**Technologies / principes utilisés :**
- Sous-agents `maritime-trajectory` + `fisheries-halieutique` ; ADR-004 comme référentiel masque eau

**Tests réalisés :**
- Revue manuelle experts (pas de nouveau run pytest dans cette entrée)

**Points ouverts / dette technique :**
- ~~**Ogooué** : labels / tronçon OSM trop à l’est (près Franceville) au lieu de Lambaréné / embouchure — corriger `_longest_named` / échantillonnage ouest~~ → corrigé (fenêtre lon 8.9–11.3 + Cap Lopez dans UI)
- ~~Exposer `rade_port_gentil` (Cap Lopez) dans le picker mobile/web (`UI_IDS`)~~ → fait
- Buffer fluvial ~4 km un peu permissif en ville berge (MVP acceptable)

---

## [2026-07-27] — Correctif Ogooué / Cap Lopez (dette M2)

**Ce qui a été construit :**
- Sélection Ogooué par fenêtre de longitude (aval Lambaréné ~9–10.3°E, intérieur ~10–11°E) au lieu du plus long segment amont
- Labels UI alignés ; `rade_port_gentil` ajouté au picker mobile/web
- Regen `--offline` des corridors + sync TS

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Réalisme trajectoires §5.2 / revue halieutique avant M3

**Technologies / principes utilisés :**
- Script `fetch_gabon_opendata.py`, OSM Ogooué, Shapely

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 11 passed

**Points ouverts / dette technique :**
- Buffer fluvial ~4 km (MVP)

---

## [2026-07-28] — Correctif UX : carte zones M3 + CRUD licences M1 (web)

**Ce qui a été construit :**
- Page Zones refondue (`web/src/pages/ZonesPage.tsx`) : layout carte MapLibre, polygones colorés par type, création bbox, PATCH actif, clic → détection
- Overlay optionnel « Afficher zones » sur la carte trajectoires
- Page Licences (`web/src/pages/LicencesPage.tsx`) : recherche, création pêcheur+licence, embarcation, dossier/trajectoires (écart §5.1)
- API client enrichi (`list/create/update/delete` pêcheurs, embarcations, create/patch zones)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 : zones exploitables pour autorités/agents (pas seulement liste + textarea)
- §5.1 : création pêcheur + embarcation via l’interface en moins de 2 min

**Technologies / principes utilisés :**
- React/TS, MapLibre GL (ADR-002), styles existants

**Tests réalisés :**
- `pytest app/tests/test_m1_pecheurs.py app/tests/test_m3_zones.py -q` : OK
- `npx tsc --noEmit` dans `web/` : OK

**Points ouverts / dette technique :**
- Pas d’éditeur graphique de polygones (bbox + GeoJSON secondaire suffisent MVP)
- M4 non démarré

---

## [2026-07-28] — UX zones : dessin carte, libellés, superpositions

**Ce qui a été construit :**
- Modes **Voir / Dessiner / Tester** (plus de saisie minLon/maxLat en premier)
- Dessin rectangle en 2 clics + aperçu ; libellés sur carte ; pastilles décalées si zones superposées
- Badge « superposée », centrage liste→carte, popup au clic polygone
- Filtre « actives seulement »

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur : anomalies d’affichage (zones empilées invisibles), prise en main difficile

**Technologies / principes utilisés :**
- MapLibre symbol/fill, React modes UX

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Éditeur polygone libre (N points) hors MVP
- M4 non démarré

---

## [2026-07-28] — Zones ciblées : purge + 3 presets métier

**Ce qui a été construit :**
- `seed_zones_demo.py --reset` : purge test/démo, recrée Mondah (sensible), Cap Lopez (interdite), Lambaréné/Ogooué (protégée) — secteurs séparés
- UI : rappel règle métier, chips presets, « Charger 3 presets », « Purger doublons », refus bbox ≥ ~90 km

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 / zone pilote : polygones ciblés, pas pavage côte + intérieur

**Technologies / principes utilisés :**
- PostGIS zones, MapLibre presets UX

**Tests réalisés :**
- Script `--reset` : 6 purge / 3 créées ; `tsc` web OK

**Points ouverts / dette technique :**
- Validation « sur eau » à la création (optionnel)
- ~~M4 non démarré~~ → démarré (entrée suivante)

---

## [2026-07-28] — Démarrage M4 + rehausse design portail

**Ce qui a été construit :**
- Démarrage module **M4** (déclarations captures, offline-first) — branche `feature/m4-captures`
- Lancement polish UX/UI portail web (login brand-first, tokens, accueil, chrome) en parallèle du build M4

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.4 / §9 : prochain sous-jalon Phase 2
- Retour porteur : plateforme à réhausser avant d’enchaîner

**Technologies / principes utilisés :**
- start-module ; web-dashboard (design) ; module-builder + mobile-offline (M4)

**Tests réalisés :**
- Non encore (démarrage)

**Points ouverts / dette technique :**
- Liste fermée d’espèces à confirmer si absente du cahier (question métier si besoin)
- Sync idempotente mobile ↔ API

---

## [2026-07-28] — Rehausse design portail web

**Ce qui a été construit :**
- Tokens océan (Fraunces + Sora), login brand-first, accueil rail M1–M4, nav pill, sidebars/empty states
- Motion légère (`rise-in`, hover) avec `prefers-reduced-motion`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur UX/UI avant / pendant M4

**Technologies / principes utilisés :**
- CSS tokens, React (pas de lib UI lourde)

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Appliquer la même langue visuelle au mobile M4

---

## [2026-07-28] — Module M4 : Déclaration & suivi des captures

**Ce qui a été construit :**
- API `/api/v1/captures` (catalog, CRUD, `POST /sync` idempotent via id client)
- Mobile offline-first : SQLite `pending`/`synced`, `CapturesScreen`, badges sync
- Portail web : page lecture Captures
- README module + contrats API

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.4 formulaire + offline + sync sans doublon/perte
- §4 entité Capture ; §9 sous-jalon M4

**Technologies / principes utilisés :**
- FastAPI, PostGIS Point optionnel, Expo SQLite, sync batch

**Tests réalisés :**
- `pytest` M1–M4 + phase1 + health : **30 passed** (dont sync idempotente §5.4)
- module-verifier : **PASS**
- `tsc` mobile + web : OK (annoncé builder)

**Points ouverts / dette technique :**
- Listes espèces/méthodes MVP à valider zone pilote
- Pas de suite Jest mobile (preuve sync côté API)

---

## [2026-07-28] — Gate multi-experts M1–M4 + correctifs

**Ce qui a été construit :**
- Revues : sécu, mobile-offline, halieutique, maritime, design — synthèse **Go M5** (réserves)
- Sécu Haute : anti-IDOR captures, dossier licence filtré pêcheur, DELETE GPS restreint + tests
- CRUD captures web (POST/PATCH/DELETE) pour agents/autorités
- Cache SQLite embarcations mobile (déclaration offline à froid)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §7 filtrage rôles ; §5.4 offline-first terrain ; validation croisée avant M5

**Technologies / principes utilisés :**
- Sous-agents projet ; pytest anti-IDOR ; Expo SQLite cache

**Tests réalisés :**
- `test_security_gate_m1_m4.py` + M2/M4 : verts
- M4 captures (incl. patch/delete) : verts (builder CRUD)

**Points ouverts / dette technique :**
- Valider liste espèces (eau douce Ogooué) avant quotas pilote
- LogAcces, CORS origins, JWT secret non-dev (Moyennes sécu)
- Sync captures encore manuelle ; labels espèces UX
- Buffer fluvial ~4 km

---

## [2026-07-28] — UX landing + illustrations + listes compactes

**Ce qui a été construit :**
- Landing publique (hero Gabon, mockup mobile/web, grille modules illustrés + connexion)
- Icônes modules M1–M4 sur accueil web, nav, en-têtes de pages ; mêmes assets sur accueil mobile
- `CompactList` (« Voir plus ») sur trajectoires, licences, zones, captures, dossier

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur : listes trop longues, manque d’illustrations / page d’accueil produit

**Technologies / principes utilisés :**
- Assets `web/public/illustrations` + `mobile/assets/illustrations` ; CSS landing ; React CompactList

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Compresser / retailler les PNG icônes (~1 Mo) pour perf mobile
- Landing encore côté SPA (pas de route marketing séparée)

---

## [2026-07-28] — Module M5 : Gestion des quotas

**Ce qui a été construit :**
- API `/api/v1/quotas` (CRUD, `GET /alertes`) ; recalcul `volume_consomme_kg` à chaque capture
- Alertes `depassement_quota` à 90 % / 100 % avec `declencheur` JSON obligatoire
- Portail `QuotasPage` (barres de progression, listes compactes, alertes)
- Fond hero local + polish glass (web) ; ImageBackground mobile
- Icône M5 ; contrats API + README module

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.5 seuils espèce/zone/période, consommation auto, alerte 90 %
- §4 entités Quota + Alerte

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy async, PostGIS `ST_Intersects` (quota zoné), React QuotasPage

**Tests réalisés :**
- `pytest` M1–M5 + sécu + health : **37 passed** (dont acceptation §5.5)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Liste alertes sur page Quotas (M6 dashboard complet plus tard)
- Quota zoné exige position_capture sur la capture

---

## [2026-07-28] — Module M6 : Tableau de bord de pilotage

**Ce qui a été construit :**
- API `GET /api/v1/dashboard` (période) : pêcheurs actifs, volume exact, répartition espèces, alertes nouvelles, zones à forte activité (`ST_Intersects`)
- Portail `DashboardPage` : KPI, barres espèces, alertes, carte MapLibre des foyers
- Design Gabon/Afrique : accents okoumé, motif tressage, copy autorités / Estuaire
- Icône Pilotage ; contrats + README

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.6 indicateurs minimums + acceptation chiffres exacts
- Utilisateurs cibles : autorités et agents (Gabon)

**Technologies / principes utilisés :**
- FastAPI agrégats SQL exacts, MapLibre, CSS tokens okoumé/earth

**Tests réalisés :**
- `pytest` suite : **42 passed** (dont 3 M6 §5.6)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Foyers d’activité = zones réglementées intersectées (pas grille hex libre)
- M7 alertes règles restantes (intrusion auto, tendance 7j)

---

## [2026-07-28] — Module M7 : Alertes intelligentes + shell command-center

**Ce qui a été construit :**
- Règles auto : zone interdite (`ST_Intersects`), dépassement quota (M5), tendance 7j > 2× moyenne hist.
- API `GET/PATCH /api/v1/alertes` ; hooks positions + captures ; `declencheur` obligatoire
- Page Alertes (traiter / ignorer)
- Design réf. command-center : rail icônes desktop, bottom nav mobile, accents or / glass

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.7 trois règles explicites (positif + négatif) ; fin Phase 2 MVP modules

**Technologies / principes utilisés :**
- FastAPI, PostGIS, React rail CSS, Expo BottomNav glass

**Tests réalisés :**
- `pytest` suite : verts (dont 3 M7 §5.7)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Anti-doublon alertes 12 h (fingerprint)
- Dashboard map-first plein écran encore perfectible (panels flottants)

---

## [2026-07-27] — Module M3 : Cartographie des zones réglementées

**Ce qui a été construit :**
- Modèle `ZoneReglementee` + index GIST Alembic ; module `backend/app/modules/zones/`
- API CRUD `/api/v1/zones`, import GeoJSON, détection `POST .../detect/intersection` via PostGIS `ST_Intersects`
- UI web « Zones réglementées » (liste, import, test lon/lat)
- Seed démo fictif Estuaire / Cap Lopez ; contrats dans `docs/api-contracts.md`
- README module

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 polygones + intersection PostGIS ; préparation intrusion zone → M7
- §4 entité ZoneReglementee ; §9 sous-jalon M3

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy 2 async, GeoAlchemy2, PostGIS `ST_Intersects`, React/TS (admin simple)

**Tests réalisés :**
- `pytest` M1+M2+M3+phase1+health : **23 passed** (dont 6 M3 inside/outside §5.3)
- module-verifier : **PASS**

**Points ouverts / dette technique :**
- Pas d’éditeur graphique de polygones (import GeoJSON suffisant §5.3)
- Alertes / `declencheur` réservés à M7
- Filtre période début/fin appliqué après intersection géométrique


## [2026-07-30] — Front office : landing + demandes de licence

**Ce qui a été construit :**
- Landing FO redesignée : hero carousel (3 slides), typo display, fond maritime, structure claire (outils / demande / modules / connexion)
- Formulaire public demande de licence (personne physique ou morale) → `POST /api/v1/demandes-licence`
- Back-office : pages Demandes (liste, approuver, refuser, supprimer) et Organisations (CRUD personnes morales)
- Migration `demandes_licence` ; rail portail « Demandes » / « Organis. »

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Extension M1 (§5.1) : entrée FO pour inscription pêcheurs / orgs avant attribution licence
- Portail autorités (§5.6) : traitement des dossiers côté agents

**Technologies / principes utilisés :**
- FastAPI public + JWT staff ; React landing glass ; CSS FO dédié

**Tests réalisés :**
- `pytest app/tests/test_demandes_licence.py` : **4 passed**
- `tsc` web : OK
- Alembic `upgrade head` : OK (`d4b8e3f91233`)

**Points ouverts / dette technique :**
- Approbation org + pêcheur : commits séparés (risque org orpheline si échec pêcheur)
- Pas de suivi public du statut de demande (n° de dossier)
- Captcha / rate-limit sur POST public à prévoir en Phase 3

## [2026-07-30] — Charte logo, wizard modal & justificatifs

**Ce qui a été construit :**
- Logo CBM-PIGAP intégré (header FO + portail) ; tokens charte marine / bleu / sage
- Demande licence en **wizard modal** (5 étapes) ; connexion autorités en modale
- Upload justificatifs (PDF/JPG/PNG, max 5×5 Mo) via `POST /demandes-licence/with-files`
- BO : téléchargement des pièces jointes sur la fiche demande

**Pourquoi (lien avec le cahier des charges / ce document) :**
- UX FO accessible (§ utilisateurs non experts) ; extension M1 inscription

**Technologies / principes utilisés :**
- Multipart FastAPI, stockage local `uploads/`, JSONB `pieces_jointes`

**Tests réalisés :**
- `pytest app/tests/test_demandes_licence.py` : 4 passed
- `tsc` web : OK

**Points ouverts / dette technique :**
- Stockage local (pas S3) ; antivirus / rate-limit Phase 3

## [2026-07-30] — Notifications temps réel portail

**Ce qui a été construit :**
- API `GET /notifications/summary` + `GET /notifications/stream` (SSE)
- Hub in-process poussé à chaque nouvelle demande / alerte
- Cloche header + badges rail Demandes / Alertes ; pulse sur items en attente
- Correctif FO 404 : `VITE_API_URL` local vide (proxy Vite → :8000) au lieu de Railway obsolète

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Pilotage autorités (§5.6 / §5.7) — file d’attente visible sans rafraîchir

**Technologies / principes utilisés :**
- SSE + poll 12 s de secours ; badges sage charte

**Tests réalisés :**
- `pytest` notifications + demandes : **5 passed**
- `tsc` web : OK

**Points ouverts / dette technique :**
- Hub mono-process (pas Redis) — suffisant MVP / un worker uvicorn

## [2026-07-30] — Messages clairs + notifs + gate experts déploiement

**Ce qui a été construit :**
- Erreurs API FR (backend validation + parseApiError web/mobile) — plus de JSON brut
- Toasts opérations web ; badges notifications exacts ; purge alertes/demandes démo
- FO wizard licence + pièces ; MIME upload durci (type ET extension)
- Mobile : validation MDP 8 car. + messages clairs tous écrans

**Pourquoi :**
- UX non experts (§ utilisateurs) ; préparation publication Phase 3

**Tests réalisés :**
- `pytest` suite : **58 passed**
- Gate experts : Sécurité / Mobile / Web = **GO réserves** (majorité)

**Points ouverts :**
- JWT_SECRET + rate-limit + CORS prod (ops)
- Railway login agent requis pour redeploy API si auto-deploy GitHub absent
