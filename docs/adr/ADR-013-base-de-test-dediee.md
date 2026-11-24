# ADR-013 : base PostgreSQL et PostGIS dédiée aux tests du serveur

- **Statut :** Proposé (à valider par Christian)
- **Date :** 2026-11-24
- **Décideurs :** Christian BEYEME (+ agent)
- **Liens :** [compte rendu](../tests-base-dediee.md), `backend/app/tests/base_de_test.py`, `backend/app/tests/conftest.py`

## Contexte

Jusqu'ici, les tests du serveur se connectaient à la base de développement (`pigap`, conteneur `pigap-db`), créaient les tables manquantes et ne supprimaient rien. Chaque passage complet ajoutait environ 45 embarcations et 1 000 alertes ; sur la journée du 2026-11-24, la base de développement est passée de 1 814 à plus de 3 000 embarcations et de 12 444 à plus de 25 000 alertes. Huit tests anciens échouaient ou vacillaient pour cette seule raison. Pour s'isoler, les tests récents se plaçaient dans des fenêtres de temps tirées au hasard (`instant_isole`), ce qui rendait d'autres résultats dépendants du tirage.

La CI (`.github/workflows/ci.yml`) lançait `pytest` sans aucune base.

## Options envisagées

1. **Statu quo**, base partagée et isolement par le temps. Écartée : base de développement polluée, résultats instables.
2. **Transaction annulée à la fin de chaque test.** Écartée pour l'instant : plusieurs services ouvrent leurs propres sessions et valident eux-mêmes ; reprise lourde.
3. **Base distincte, recréée et migrée à chaque passage.** Retenue : aucune modification du code applicatif, la base de développement n'est plus touchée, les migrations sont exercées à chaque passage.

## Décision

- Base de test distincte, par défaut `pigap_test` sur le même serveur que la base de développement ; adresse surchargeable par la variable `TEST_DATABASE_URL` (seul son nom figure dans `.env.example`).
- Le fichier `conftest.py` fixe `DATABASE_URL` sur cette base **avant** tout import applicatif : toutes les sessions, y compris celles que des services ouvrent eux-mêmes, visent la base de test.
- Au début de chaque passage : suppression de la base de test, recréation, extension PostGIS, puis `alembic upgrade head`.
- Garde-fou, échec fermé : le nom de la base visée doit se terminer par `_test` et différer de celui de la base de développement ; sinon `pytest` s'arrête (code de sortie 4) avant toute connexion. Un second contrôle précède la suppression.
- CI : service PostGIS ajouté au flux, avec des identifiants propres à la CI.

## Conséquences

- Positives : base de développement intacte, passages reproductibles, migrations vérifiées à chaque passage.
- Négatives : environ deux secondes de plus par passage (recréation et migrations) ; un seul passage à la fois sur une même base de test (deux passages simultanés se supprimeraient mutuellement la base).
- L'isolement par le temps (`instant_isole`) reste en place ; il n'est plus nécessaire mais ne gêne pas. Le retirer est une simplification possible, non faite.
- Le compte de connexion doit avoir le droit de créer des bases (c'est le cas du compte du conteneur de développement et de celui de la CI).
