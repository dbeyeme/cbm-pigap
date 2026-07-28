# AGENTS.md — CBM-PIGAP

> Contrat de travail pour tout agent Cursor sur ce dépôt.
> Référentiel métier et technique : [`cdc-mvp-pigap.md`](cdc-mvp-pigap.md) (cahier technique MVP).
> Suivi vivant : [`docs/STATUS.md`](docs/STATUS.md) · [`docs/JOURNAL.md`](docs/JOURNAL.md).

## Project overview

**CBM-PIGAP** (Plateforme Intelligente Gabonaise des Activités de Pêche) — MVP pour Kimba Connect (Gabon).

Monorepo prévu :

| Couche | Stack |
|--------|--------|
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2 async, PostGIS, Alembic, JWT |
| Mobile | React Native (Expo ou bare — ADR Phase 1), offline-first (SQLite + file de sync) |
| Web | React + TypeScript, MapLibre GL ou Leaflet |
| Infra | Docker Compose, GitHub Actions, structlog, `/health` |

Modules métier **strictement séquentiels** : M1 → M7 (voir cahier §5 et §9).

## Règle d'or

Tu suis strictement `cdc-mvp-pigap.md`. Tu avances **module par module** dans l'ordre du plan (§9). Après chaque module livré, tu mets à jour `docs/JOURNAL.md` et `docs/STATUS.md`. Tu ne passes jamais au module suivant sans tests verts du module courant. En cas d'ambiguïté, **tu poses une question** plutôt que de supposer.

## Working agreements

1. **Un module à la fois** — jamais M1–M7 en parallèle.
2. **Pas d'invention métier** — uniquement ce qui est dans le cahier ; sinon question.
3. **Documenter en même temps** — chaque module terminé = entrée journal.
4. **Expliquer en clair** — choix techniques compréhensibles pour le porteur (Christian).
5. **Tester avant "done"** — critères d'acceptation §5 couverts par des tests.
6. **Ne pas casser l'existant** — relancer les tests des modules précédents avant d'avancer.
7. **Écarts documentés** — tout écart cahier ↔ code = ADR + mention dans le journal.
8. **Sobriété** — version la plus simple qui satisfait l'acceptation.
9. **Sécurité dès le premier endpoint** — rôles, hash mots de passe, pas de "plus tard".

## Definition of Done (module)

Un module n'est "done" que si :

- [ ] Modèle + migration (si applicable)
- [ ] Endpoints / écrans du périmètre MVP
- [ ] Tests couvrant les critères d'acceptation §5
- [ ] Tests des modules précédents toujours verts
- [ ] Entrée `docs/JOURNAL.md` au format §11
- [ ] `docs/STATUS.md` mis à jour
- [ ] README court du module (objectif, endpoints, comment tester)

## Sous-agents disponibles

| Agent | Quand l'utiliser |
|-------|------------------|
| `module-builder` | Implémenter le module courant de bout en bout |
| `module-verifier` | Vérifier DoD + critères d'acceptation avant de marquer done |
| `backend-geospatial` | Routes FastAPI, PostGIS, migrations Alembic |
| `maritime-trajectory` | Veille trajectoires pirogues : mer / fleuves uniquement (pas à terre) |
| `fisheries-halieutique` | Expert pêche artisanale gabonaise : corridors eau, sorties vs ZEE, réalisme trajectoires |
| `mobile-offline` | App RN, SQLite, file de sync hors-ligne |
| `web-dashboard` | Portail autorités, cartes, indicateurs |
| `security-auditor` | Auth JWT, rôles, données sensibles, géoloc |
| `journal-keeper` | Mettre à jour JOURNAL / STATUS / checklist |

## Skills projet

| Skill | Déclencheur typique |
|-------|---------------------|
| `start-module` | Démarrer un module Mx |
| `finish-module` | Clôturer un module (DoD + journal) |
| `update-journal` | Ajouter une entrée de suivi |
| `write-adr` | Décision technique structurante |
| `pigap-status` | Point d'avancement / phase |

## Setup (cible Phase 0)

```bash
# Après initialisation monorepo :
docker compose -f infra/docker-compose.yml up -d
# Backend : pytest dans backend/
# Mobile / web : selon package manager détecté (lockfile)
```

## Security

- Jamais de secrets commités (`.env`, clés JWT, mots de passe).
- Données de test **fictives** jusqu'à la phase pilote (§7).
- Géolocalisation filtrée par rôle (pêcheur / agent / autorité).
- Alertes : champ `declencheur` obligatoire (traçabilité).

## Commits & branches

- Convention : `type(scope): message` — ex. `feat(quotas): ajoute calcul de consommation`
- Branches : `feature/m1-pecheurs`, `feature/m2-geoloc`, … fusion après tests verts
- `main` protégée

## Hors périmètre MVP (ne pas implémenter)

SSO, iOS natif complet, paiement, multi-zones, IoT/MQTT réel, ML prédictif stocks.
Prévoir seulement les **points d'extension** (ex. `source=balise` sur Position).
