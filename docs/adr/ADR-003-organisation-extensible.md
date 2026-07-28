# ADR-003 — Organisation / société extensible (JSONB + colonnes stables)

- **Statut :** Accepté
- **Date :** 2026-07-27
- **Décideurs :** Christian BEYEME

## Contexte

Le cahier §4 référence `organisation_id` sans détailler l'entité. Il faut une table **Organisation / société** assez robuste pour absorber des informations futures sans recréer le schéma à chaque besoin métier.

## Options envisagées

1. Table minimale (`id`, `nom`) — trop fragile.
2. Colonnes métier stables + sac `attributs` JSONB pour l'inconnu — extensible sans migration à chaque champ.
3. EAV / table de propriétés séparée — trop complexe pour le MVP.

## Décision

**Option 2** : colonnes d'identité / contact / adresse / cycle de vie + `attributs JSONB` (clé→valeur libre) + `notes`.

## Conséquences

- Positives : nouveaux besoins (agrément, contacts multiples, labels) → `attributs` sans migration ; requêtes courantes sur colonnes indexables.
- Négatives / dettes : pas de typage SQL sur `attributs` ; conventions de clés à documenter au fil de l'eau.
- Impact cahier : précise §4 (entité Organisation).

## Liens

- Modules : M1 (+ futurs)
- Migration : `organisations_robustes_m1`
