# Sorties en mer (lot 11, ADR-016)

## Objectif

Situer une pirogue même sans trace GPS, à partir de sa déclaration de sortie (port
ou point de départ, heure de retour prévue, secteur visé), signaler une sortie non
rentrée, et proposer au pêcheur un lieu de pêche tiré de la trace de sa sortie.

## Endpoints

| Méthode | Chemin | Rôles | Description |
|---------|--------|-------|-------------|
| POST | `/api/v1/sorties` | pêcheur (ses embarcations), administrateur | Déclaration idempotente par `client_id` ; un renvoi complète le retour. 201 à la création, 200 au renvoi |
| POST | `/api/v1/sorties/{id}/retour` | pêcheur propriétaire, agent de contrôle, administrateur | Retour déclaré ou constaté au port ; auteur conservé |
| GET | `/api/v1/sorties?statut=&embarcation_id=&depuis=&jusqu_a=&limit=` | pêcheur, organisation, agent, autorité, administrateur | Liste selon le périmètre ; `en_retard` triées du plus ancien retard |
| GET | `/api/v1/sorties/{id}` | idem | Détail, dernière position connue depuis le départ |
| GET | `/api/v1/sorties/lieu-de-peche?embarcation_id=&avant=` | pêcheur (ses embarcations), agent, autorité, administrateur | Point proposé ; jamais inscrit d'office sur une capture |

Codes d'erreur : `SORTIE_DEJA_EN_COURS`, `SORTIE_DEJA_TERMINEE`, `SORTIE_CLIENT_ID_REUTILISE` (409),
`SORTIE_INVALIDE` (422), `SORTIE_NOT_FOUND` et `EMBARCATION_NOT_FOUND` (404, y compris hors périmètre).

## Règles (statut Proposé)

Paramétrage `backend/app/data/regles/sorties.json` : tolérance de retard, gravité de
l'alerte, durée maximale, avance tolérée sur l'heure du téléphone, fréquence de
vérification, calcul du lieu proposé (fenêtre, rayon de regroupement, intervalle,
vitesse, nombre minimal de relevés).

- **En retard** : sortie sans retour, heure prévue dépassée de la tolérance.
- **Alerte** `anomalie`, règle `sortie_non_rentree` : une seule par sortie, émise par
  la tâche de fond du serveur (`verifier_retards`), avec la dernière position connue
  ou, à défaut, le point de départ, et l'en-tête du paramétrage appliqué.
- **Lieu proposé** : relevé autour duquel le temps cumulé (intervalles qui commencent
  à moins du rayon) est le plus long, hors abords des ports du référentiel.
- **Cloisonnement** : périmètre du compte (`perimetre_de`) et filtre géographique des
  lectures (`perimetre.filtre`) sur le point de départ ; un agent sans zone affectée ne
  voit aucune sortie.

## Tester

```bash
cd backend && .venv/bin/pytest app/tests/test_lot11_sorties.py -q
```
