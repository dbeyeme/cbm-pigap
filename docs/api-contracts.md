# Contrats d'API — Phase 1

Source de vérité **code** : schémas Pydantic sous `backend/app/`.

Voir le détail dans ce fichier — index des modules :

| Module | Fichier | Préfixe prévu (§6) |
|--------|---------|-------------------|
| Auth / utilisateurs | `app/schemas/auth.py` | `/api/v1/auth`, `/api/v1/utilisateurs` |
| M1 Pêcheurs | `app/modules/pecheurs/schemas.py` | `/api/v1/pecheurs`, `/api/v1/embarcations` |
| M2 Géoloc | `app/modules/geolocalisation/schemas.py` | `/api/v1/positions`, `/api/v1/geoloc` |
| M3 Zones | `app/modules/zones/schemas.py` | `/api/v1/zones` |
| M4 Captures | `app/modules/captures/schemas.py` | `/api/v1/captures` |
| M5 Quotas | `app/modules/quotas/schemas.py` | `/api/v1/quotas` |
| M6 Dashboard | `app/modules/dashboard/schemas.py` | `/api/v1/dashboard` |
| M7 Alertes | `app/modules/alertes/schemas.py` | `/api/v1/alertes` |
| Commun | `app/schemas/common.py` | erreurs `{detail, code}`, GeoJSON |

## Conventions

- Routes sous `/api/v1/` (implémentation Phase 2).
- Erreurs : `ErrorResponse` (`detail` + `code`).
- Géométries : GeoJSON Point / Polygon, SRID 4326.
- Rôles : déclarés via `Depends(require_role(...))` dès le premier endpoint métier.
- Sync offline (M4) : `CaptureCreate.id` optionnel (UUID client) pour idempotence.

## M3 — Zones (`/api/v1/zones`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| POST | `/zones` | autorité, agent, admin | Création Polygon |
| GET | `/zones` | + chercheur, pêcheur | Filtres `actif`, `type` |
| GET | `/zones/{id}` | lecture | |
| PATCH | `/zones/{id}` | autorité, agent, admin | Édition |
| DELETE | `/zones/{id}` | autorité, agent, admin | |
| POST | `/zones/import/geojson` | autorité, agent, admin | FeatureCollection |
| POST | `/zones/detect/intersection` | lecture | `ST_Intersects` PostGIS ; pas d'alerte M7 |

Import GeoJSON — properties : `nom` (ou `name`), `type` (`interdite\|protegee\|sensible`), `periode_debut`, `periode_fin`, `actif`.

## M4 — Captures (`/api/v1/captures`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| GET | `/captures/catalog` | lecture | Listes fermées espèces / méthodes |
| POST | `/captures` | pêcheur, agent, admin, autorité | `id` client optionnel (idempotence) |
| POST | `/captures/sync` | idem | Batch offline → `{accepts, duplicates, rejects}` |
| GET | `/captures` | + chercheur | Filtres `pecheur_id`, `embarcation_id`, `espece` |
| GET | `/captures/{id}` | lecture | |
| PATCH | `/captures/{id}` | pêcheur*, agent, admin, autorité | Correction champs (`CaptureUpdate`) |
| DELETE | `/captures/{id}` | pêcheur*, agent, admin, autorité | Hard delete |

\* Pêcheur limité à ses captures. Portail web : CRUD agents/autorités (`CapturesPage`).

## M5 — Quotas (`/api/v1/quotas`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| POST | `/quotas` | autorité, agent, admin | Espèce + période ; zone optionnelle |
| GET | `/quotas` | + chercheur | Filtre `espece` |
| GET | `/quotas/alertes` | lecture | Alertes `depassement_quota` (prépare M6) |
| GET | `/quotas/{id}` | lecture | Inclut `taux_consommation` |
| PATCH | `/quotas/{id}` | autorité, agent, admin | |
| DELETE | `/quotas/{id}` | autorité, agent, admin | |

Consommation recalculée à chaque capture (create/sync/patch/delete). Seuils 90 % / 100 % → `Alerte` avec `declencheur` obligatoire.

## M6 — Dashboard (`/api/v1/dashboard`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| GET | `/dashboard` | autorité, agent, admin, chercheur | Query `debut`, `fin` (captures) |

Réponse exacte : `pecheurs_actifs`, `volume_total_kg`, `repartition_especes`, `alertes_actives` (statut nouvelle), `zones_forte_activite` (ST_Intersects).

## M7 — Alertes (`/api/v1/alertes`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| GET | `/alertes` | autorité, agent, admin, chercheur | Filtres `type`, `statut`, `embarcation_id` |
| PATCH | `/alertes/{id}` | autorité, agent, admin | Statut `nouvelle\|traitee\|ignoree` |

Règles auto : intrusion zone interdite (positions/captures), dépassement quota (M5), tendance 7j > 2× moyenne hist. `declencheur` obligatoire.

## Hors Phase 1

Schémas Phase 1 conservés ; routes métier livrées progressivement (M1–M7 actifs).
