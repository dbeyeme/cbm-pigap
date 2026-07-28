# M4 — Déclaration & suivi des captures

## Objectif

Formulaire de déclaration (espèce, quantité, méthode, point de débarquement, date)
avec **offline-first** mobile → sync réseau sans duplication ni perte (§5.4).
Complément portail web : CRUD pour agents / autorités (création en ligne).

## Listes fermées MVP

Espèces (Gabon artisanal / côtier — à valider zone pilote) :

`capitaine`, `merou`, `crevette`, `thon`, `barracuda`, `sardine`, `autre`

Méthodes : `filet`, `ligne`, `nasse`, `senne`, `palangre`, `autre`

Constantes partagées : `schemas.ESPECES_MVP` / `METHODES_MVP` ; mobile `src/offline/catalog.ts` ;
catalog API `GET /captures/catalog`.

## Endpoints

| Méthode | Chemin | Rôles | Description |
|---------|--------|-------|-------------|
| GET | `/api/v1/captures/catalog` | lecture | Listes fermées |
| POST | `/api/v1/captures` | pêcheur, agent, admin, autorité | Créer (idempotent si `id` client) |
| POST | `/api/v1/captures/sync` | idem | Batch sync offline |
| GET | `/api/v1/captures` | + chercheur | Lister |
| GET | `/api/v1/captures/{id}` | lecture | Détail |
| PATCH | `/api/v1/captures/{id}` | pêcheur*, agent, admin, autorité | Correction champs |
| DELETE | `/api/v1/captures/{id}` | pêcheur*, agent, admin, autorité | Suppression hard |

\* Pêcheur limité à **ses** captures (même règle que la création).

Idempotence : le client envoie un UUID local (`id`) ; un second envoi du même `id`
renvoie / marque `duplicates` sans créer de doublon.

Schéma DB : table `captures` (migration initiale Phase 1) — pas de soft-delete ni
migration M4 supplémentaire.

## Mobile

Écran **Captures** : SQLite (`expo-sqlite`) + file `pending` → `POST /captures/sync`.
Indicateurs : « en attente » / « synchronisé ».

## Portail web

Page **Captures** (`web/src/pages/CapturesPage.tsx`) :

- Liste + filtre espèce (catalog)
- Formulaire créer / éditer (espèces & méthodes fermées, pêcheur + embarcation, quantité, débarquement, date)
- Supprimer (confirmation)

## Tester

```bash
cd backend
pytest app/tests/test_m4_captures.py app/tests/test_m3_zones.py \
  app/tests/test_m2_geoloc.py app/tests/test_m1_pecheurs.py -q
```

## Acceptation §5.4

- Déclaration saisie hors-ligne (file locale) présente en base après sync
- Pas de duplication (rejeu du même `client_id`)
- Pas de perte (batch partiel : accepts + rejects séparés)
- Agent peut créer / corriger / supprimer une capture depuis le web (sans curl)
