# Redevances — taxe à la production, quittances, paiement

Ajout du 2026-10-01 (exploitation du rapport NTSAGUI-2026-PGH-001).

## Règles

- Chaque capture déclarée reçoit une taxe = poids × taux du barème de son espèce
  (sardine 5 FCFA/kg, autres pélagiques 10, démersaux 25, crustacés 78 ; taux observés
  dans les tableurs 2024 de l'administration, à valider par la DGPA). Espèce sans
  barème : statut `sans_bareme`.
- La taxe est calculée **une seule fois** à l'insertion ; une capture rattachée à une
  quittance est figée (poids, espèce, titulaire) tant que la quittance n'est pas annulée.
- Une quittance (`QT-AAAA-NNNNNN`) regroupe les taxes dues d'un pêcheur ou de tous les
  membres d'une organisation (paiement groupé). Elle se règle par Mobile Money depuis le
  numéro enregistré de l'acteur (module abonnements, pawaPay en mode live).
- Aucune répartition des recettes : aucun texte ne fixe de clé (constat du rapport).

## Endpoints

| Méthode | Chemin | Rôles |
|---|---|---|
| GET | `/api/v1/redevances/baremes` | tous |
| GET | `/api/v1/redevances/encours?pecheur_id|organisation_id` | pêcheur (soi), organisation (membres), agents |
| GET | `/api/v1/redevances/synthese` | agents, autorité, admin, chercheur |
| GET / POST | `/api/v1/redevances/quittances` | idem périmètre |
| GET | `/api/v1/redevances/quittances/{id}` et `/pdf` | idem |
| POST | `/api/v1/redevances/quittances/{id}/payer` | idem (dépôt depuis le numéro de l'acteur) |
| POST | `/api/v1/redevances/quittances/{id}/annuler` | idem |
| POST | `/api/v1/redevances/paiements/{id}/confirmer-demo` | mode démo |
| GET | `/api/v1/public/verif/quittance/{numero}` | public (QR code) |

## Tester

```bash
cd backend && .venv/bin/python -m pytest app/tests/test_redevances.py -q
```
