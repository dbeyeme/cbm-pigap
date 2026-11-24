# Tests du serveur sur une base dédiée

Date : 2026-11-24. Décision associée : [ADR-013](adr/ADR-013-base-de-test-dediee.md) (Proposé).

## 1. Compréhension

Les tests du serveur écrivaient dans la base de développement (`pigap`) sans jamais rien supprimer. Deux effets :

- la base de développement grossissait à chaque passage (environ 45 embarcations et 1 000 alertes par passage complet) ;
- huit tests anciens échouaient ou vacillaient, parce qu'ils comptent ou agrègent des données de toute la base (tableau de bord, prédictions, numéro de paiement déjà pris).

La CI lançait `pytest` sans base de données.

## 2. Ce qui a été fait

| Fichier | Changement |
|---------|------------|
| `backend/app/tests/base_de_test.py` (nouveau) | Choix de l'adresse de la base de test, garde-fou, recréation de la base, migrations |
| `backend/app/tests/conftest.py` | Bascule sur la base de test avant tout import applicatif ; remise à zéro et `alembic upgrade head` au début de chaque passage ; nom de la base affiché dans l'en-tête de `pytest` |
| `backend/app/tests/test_base_de_test.py` (nouveau) | Cinq tests du garde-fou, dont la vérification que la session vise bien une base `_test` |
| `backend/app/tests/test_predictions.py` | `test_penurie_serie_decroissante` rendu déterministe (voir section 4) |
| `.env.example` | Nom de la variable `TEST_DATABASE_URL`, sans valeur |
| `.github/workflows/ci.yml` | Service PostGIS et variables de base pour la CI |
| `docs/adr/ADR-013-base-de-test-dediee.md`, `docs/adr/README.md` | Décision et index |

Fonctionnement :

1. Adresse : `TEST_DATABASE_URL` si elle est renseignée, sinon la base de développement suffixée de `_test` (`pigap_test`, même conteneur `pigap-db`).
2. Garde-fou : si le nom de la base ne se termine pas par `_test`, ou s'il est celui de la base de développement, `pytest` s'arrête avec le code 4 avant toute connexion. Vérifié avec une adresse pointant sur `pigap` : arrêt immédiat, code 4.
3. À chaque passage : `DROP DATABASE pigap_test`, `CREATE DATABASE pigap_test`, extension PostGIS, `alembic upgrade head` (révision `a9c3e4f5b627` constatée).
4. Aucune adresse complète n'est affichée : seuls l'hôte, le port et le nom de la base apparaissent.

## 3. Vérifications

| Contrôle | Résultat |
|----------|----------|
| Deux passages complets consécutifs, après correction | 246 passés, 0 échoué, deux fois |
| Base de développement, relevés avant et après ces deux passages | Identique : 8 852 utilisateurs, 3 835 pêcheurs, 3 182 embarcations, 2 759 positions, 25 130 alertes, 3 874 captures, 355 zones, 224 paiements |
| Même contrôle autour d'un passage antérieur | Identique |
| Lint des fichiers touchés (`ruff`, `black`) | Conforme |
| CI | Présent en code, **non exécuté** (aucun envoi sur le dépôt distant) |

Remarque : entre le premier relevé et la mise en place, 58 comptes et quelques embarcations, positions et captures ont été ajoutés à la base de développement à 14 h 52 UTC, avec les marques des tests du lot 2. Ils proviennent d'un passage lancé par une autre session pendant la pose du dispositif ; rien n'a plus été écrit dans la base de développement par les tests ensuite. Ces lignes n'ont pas été supprimées.

## 4. Les huit tests anciens

| Test | Résultat sur base dédiée | Cause |
|------|--------------------------|-------|
| `test_m6_dashboard.py::test_dashboard_alertes_actives_et_zone_activite` | Vert | Données accumulées |
| `test_paiement_msisdn.py` (deux tests) | Verts | Numéro fixe déjà en base |
| `test_predictions.py` (deux tests) | Verts | Données accumulées ; en plus, voir ci-dessous |
| `test_redevances.py::test_dashboard_indicateurs_effort` | Vert | Données accumulées |
| `test_dashboard_series.py::test_series_grain_semaine_un_seul_bucket` | Vert | Données accumulées |
| `test_m7_alertes.py::test_regle_zone_interdite_positif_et_negatif` | Vert | Données accumulées |

`test_predictions.py::test_penurie_serie_decroissante` échouait encore une fois sur deux sur la base neuve. Cause propre au test : sa série de quinze semaines démarrait à une date tirée au hasard (5 juin plus 0 à 19 semaines). Quand la dernière semaine tombait en octobre, la moyenne saisonnière ne retenait plus les semaines fortes du test (saison sèche) mais seulement les captures de sardine des autres tests. Correction : série fixée du 3 juin au 9 septembre, toute en saison sèche, et semaines fortes portées de 40 à 400 kg (données fictives) pour rester indépendant des autres captures du passage. Le code du service de prédiction n'est pas modifié.

## 5. Commandes

Depuis `backend/` :

```bash
.venv/bin/python -m pytest
```

La base `pigap_test` est créée et migrée automatiquement ; il n'est plus nécessaire de lancer `alembic upgrade head` sur la base de développement avant les tests. Pour une autre base de test :

```bash
TEST_DATABASE_URL=postgresql+asyncpg://utilisateur:motdepasse@localhost:5432/autre_test .venv/bin/python -m pytest
```

Ne lancer qu'un passage à la fois : deux passages simultanés supprimeraient chacun la base de l'autre.

## 6. Points laissés en l'état

- `instant_isole` et les dates futures des tests restent en place ; ils ne sont plus nécessaires. Simplification possible, non faite.
- `ruff check app/tests` signale une variable inutilisée dans `test_m2_geoloc.py` (ligne 288), antérieure à ce chantier : la CI échouera sur ce point tant qu'il n'est pas corrigé.
- La règle de la mémoire de travail « `alembic upgrade head` sur la base de dev avant pytest » ne vaut plus pour les tests.

## 7. Prochaine action

Christian : valider l'ADR-013 (statut « Proposé »), puis demander le commit de ces fichiers.
