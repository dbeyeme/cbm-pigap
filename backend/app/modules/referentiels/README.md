# Référentiels métier

Listes partagées par le web et le mobile, chargées depuis
`data/open-data/gabon/referentiels_peche.json` (copié dans l'image par `scripts/sync_data.py`) :
espèces avec groupe officiel et production 2024, espèces protégées, engins, types de pirogue,
matériaux, filières, strates, sites de débarquement, nationalités, catégories d'infraction,
barèmes (autorisation annuelle, taxe à la production), prix moyens 2024, repères 2024 du Grand
Libreville. Source : tableurs de l'administration décrits dans le rapport NTSAGUI-2026-PGH-001 ;
`a_valider_dgpa: true` tant que la DGPA n'a pas validé.

`GET /api/v1/referentiels`, `/referentiels/especes`, `/referentiels/baremes` (authentifié).
Les anciens codes MVP (`barracuda`, `filet`, `ligne`, `senne`) restent acceptés comme alias.
