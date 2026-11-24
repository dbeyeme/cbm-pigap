# Fiche d'identité à deux volets (lot 2 du chantier de novembre 2026)

## Objectif

Réunir, pour un pêcheur et ses embarcations, ce que dit le registre d'un côté
et ce que les embarcations émettent de l'autre :

- **registre** : identité, licence et validité, organisation, caractéristiques
  de chaque embarcation (dont les informations d'inscription complémentaires) ;
- **suivi** : source et âge du dernier relevé, période observée, nombre de
  relevés par source. Aucune position n'est renvoyée.

Lecture seule.

## Points d'accès (`/api/v1/identite`)

| Méthode | Chemin | Rôles | Périmètre |
|---------|--------|-------|-----------|
| GET | `/moi` | pêcheur | Sa propre fiche |
| GET | `/pecheurs/{pecheur_id}` | autorité, agent de contrôle, administrateur, pêcheur, organisation | Toute la flotte pour les trois premiers ; sa fiche pour le pêcheur ; ses membres pour l'organisation |

Hors périmètre, la fiche répond 404 comme si elle n'existait pas. Une
organisation désactivée ne lit plus la fiche de ses membres. Le chercheur
n'y a pas accès (registre nominatif). Toute consultation par un tiers est
inscrite au journal des accès (`ressource = fiche_identite`).

Contrat détaillé et exemples : `docs/lot-2-profil-serveur.md`.

## Tester

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_lot2_identite.py -q
```
