# Contrats d'API — Phase 1

Source de vérité **code** : schémas Pydantic sous `backend/app/`.

Voir le détail dans ce fichier — index des modules :

| Module | Fichier | Préfixe prévu (§6) |
|--------|---------|-------------------|
| Auth / utilisateurs | `app/schemas/auth.py` + `modules/utilisateurs/` | `/api/v1/auth`, `/api/v1/utilisateurs` |
| M1 Pêcheurs | `app/modules/pecheurs/schemas.py` | `/api/v1/pecheurs`, `/api/v1/embarcations` |
| M2 Géoloc | `app/modules/geolocalisation/schemas.py` | `/api/v1/positions`, `/api/v1/geoloc` |
| M3 Zones | `app/modules/zones/schemas.py` | `/api/v1/zones` |
| M4 Captures | `app/modules/captures/schemas.py` | `/api/v1/captures` |
| M5 Quotas | `app/modules/quotas/schemas.py` | `/api/v1/quotas` |
| M6 Dashboard | `app/modules/dashboard/schemas.py` | `/api/v1/dashboard` |
| M7 Alertes | `app/modules/alertes/schemas.py` | `/api/v1/alertes` |
| Demandes licence (FO) | `app/modules/demandes_licence/schemas.py` | `/api/v1/demandes-licence` |
| Abonnements / Mobile Money | `app/modules/abonnements/` | `/api/v1/abonnements` |
| Documents | `app/modules/documents/` | `/api/v1/documents` |
| Commun | `app/schemas/common.py` | erreurs `{detail, code}`, GeoJSON |

## Conventions

- Routes sous `/api/v1/` (implémentation Phase 2).
- Erreurs : `ErrorResponse` (`detail` + `code`).
- Géométries : GeoJSON Point / Polygon, SRID 4326.
- Rôles : déclarés via `Depends(require_role(...))` dès le premier endpoint métier.
- Sync offline (M4) : `CaptureCreate.id` optionnel (UUID client) pour idempotence.

## Staff — Agents & admins (`/api/v1/utilisateurs`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| POST | `/utilisateurs` | admin | Créer `agent_controle` ou `admin` |
| GET | `/utilisateurs` | admin | Filtres `role`, `q` |
| GET | `/utilisateurs/{id}` | admin | |
| PATCH | `/utilisateurs/{id}` | admin | Nom, rôle, contact, mot de passe |
| DELETE | `/utilisateurs/{id}` | admin | Interdit soi / dernier admin |

Pêcheurs : CRUD via M1 (`/pecheurs`), pas via cet endpoint.

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

`GET /dashboard/series` — buckets jour/semaine/mois (`volume_par_periode`, espèces, alertes, labels saisonniers). Somme = volume dashboard.

## Prédictions consultatives (`/api/v1/predictions`) — ADR-006

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| GET | `/predictions?horizon_jours=7\|30` | autorité, agent, admin, chercheur | sklearn léger, `justification` obligatoire, pas d’alerte M7 |

## M7 — Alertes (`/api/v1/alertes`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| GET | `/alertes` | autorité, agent, admin, chercheur | Filtres `type`, `statut`, `embarcation_id` |
| PATCH | `/alertes/{id}` | autorité, agent, admin | Statut `nouvelle\|traitee\|ignoree` |

Règles auto : intrusion zone interdite (positions/captures), dépassement quota (M5), tendance 7j > 2× moyenne hist. `declencheur` obligatoire.

## Demandes de licence FO (`/api/v1/demandes-licence`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| POST | `/demandes-licence` | **public** | Inscription FO (physique / morale) |
| POST | `/demandes-licence/with-files` | **public** | Multipart + justificatifs (PDF/JPG/PNG) |
| GET | `/demandes-licence` | agent, admin, autorité | Filtres `statut`, `type_demande`, `q` |
| GET | `/demandes-licence/{id}` | idem | |
| GET | `/demandes-licence/{id}/pieces/{piece_id}` | idem | Téléchargement pièce |
| PATCH | `/demandes-licence/{id}` | idem | Seulement `en_attente` |
| DELETE | `/demandes-licence/{id}` | idem | Interdit si déjà `approuvee` |
| POST | `/demandes-licence/{id}/approve` | idem | Crée pêcheur (+ org / embarcation) |
| POST | `/demandes-licence/{id}/refuse` | idem | Motif obligatoire |

Personnes morales : CRUD aussi via M1 `/api/v1/organisations`.

## Documents (`/api/v1/documents`)

PDF (ReportLab) + CSV rapport. Chaque export écrit `LogAcces`.

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| GET | `/documents/licence/{pecheur_id}` | agent, admin, autorité | PDF licence M1 |
| GET | `/documents/fiche/pecheur/{pecheur_id}` | idem | PDF fiche d’enregistrement |
| GET | `/documents/fiche/demande/{demande_id}` | idem | PDF fiche depuis demande FO |
| GET | `/documents/bilan/{pecheur_id}` | + chercheur | PDF bilan captures / alertes |
| GET | `/documents/rapport` | + chercheur | Query `debut`, `fin`, `format=pdf\|csv` |

## Notifications portail (`/api/v1/notifications`)

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| GET | `/notifications/summary` | agent, admin, autorité | Compteurs demandes en attente + alertes nouvelles |
| GET | `/notifications/stream` | idem | SSE `event: summary` (temps réel + ping) |

## Hors Phase 1

Schémas Phase 1 conservés ; routes métier livrées progressivement (M1–M7 actifs).
