# ADR-010 : Fonds de carte du portail, service sans clé et cible auto-hébergée

- **Statut :** Accepté (option retenue par Christian le 2026-11-24)
- **Date :** 2026-11-24
- **Décideurs :** Christian BEYEME (+ agent)

## Contexte

L'ADR-002 a retenu MapLibre GL et laissé le fournisseur de tuiles « à figer ». Le style du portail (`web/src/geo/mapStyle.ts`) reposait sur trois services tiers utilisés sans clé :

| Élément | Service | Constat du 2026-11-24 |
|---------|---------|-----------------------|
| Fond et noms de lieux (tuiles raster) | CARTO | Une clé est exigée depuis le 25 septembre 2026 ; sans clé, la tuile est servie en HTTP 200 avec la mention « API KEY REQUIRED » ([FAQ](https://docs.carto.com/faqs/carto-basemaps), [conditions](https://www.carto.com/legal/basemap-terms/)) |
| Polices des étiquettes | Serveur de démonstration de MapLibre | « Open Sans Regular » répond 404 ; MapLibre dessine alors le texte localement et journalise une erreur par caractère |
| Imagerie satellitaire | Esri World Imagery | Fonctionne ; conditions d'usage sans clé non confirmées, la voie documentée passe par une clé |

Le défaut CARTO était masqué sur les postes déjà utilisés : le navigateur y conservait d'anciennes tuiles valides. Une requête contournant le cache reçoit le filigrane, comme tout nouveau visiteur. C'est « l'anomalie de l'API de la carte » signalée par le porteur.

## Options envisagées

1. **Fond vectoriel OpenStreetMap servi par OpenFreeMap.** Sans clé ni inscription, usage commercial admis, aucune limite annoncée ; aucune garantie de disponibilité (« may discontinue it at any time without notice ») ; auto-hébergeable ([site](https://openfreemap.org/), [conditions](https://openfreemap.org/tos/)).
2. **Clé CARTO.** Gratuite ; en usage commercial, plafond d'un million de requêtes de tuiles par mois, puis formule à 500 USD par mois ([conditions](https://www.carto.com/legal/basemap-terms/)). Suppose la création d'un compte par le porteur et maintient la dépendance.
3. **Auto-hébergement immédiat** d'un extrait vectoriel (golfe de Guinée). Aucune dépendance ; effort supérieur à une correction.

## Décision

**Option 1 dès maintenant, option 3 comme cible** avant l'ouverture large de la phase pilote.

- Source vectorielle unique `osm` : eau et terre sous l'imagerie (fond de secours), noms de lieux au-dessus, en français quand le nom existe (`name:fr`).
- Polices du même service (`Noto Sans`), exportées par `MAP_FONT_REGULAR`, `MAP_FONT_BOLD`, `MAP_FONT_ITALIC` ; toute couche de texte du portail les utilise.
- Adresse du service surchargeable par `VITE_MAP_TILES_URL` : la bascule vers une copie hébergée par la plateforme ne demandera aucun changement de code.
- Imagerie Esri conservée à titre provisoire.
- Garde-fou `web/scripts/verifier-fonds-carte.mjs`, exécuté avant chaque construction (`prebuild`) : il échoue si un hôte interdit réapparaît, si une couche de texte n'a pas de police, ou si une police est écrite en dur hors du style.

## Conséquences

- **Positives :** plus de filigrane ni d'erreur de police ; libellés en français ; un seul point de configuration ; la régression est bloquée à la construction.
- **Négatives, dettes :**
  - service public sans garantie : en cas d'indisponibilité, l'imagerie et les couches métier restent affichées, les noms de lieux disparaissent et le texte métier est dessiné localement ;
  - imagerie Esri à régulariser (clé ou autre fournisseur) : décision et création de compte reviennent au porteur ;
  - la carte de l'application mobile (`TileTrajectoryMap`) utilise encore un fond raster Esri sans clé ;
  - une tuile vectorielle complète pèse plus qu'une tuile de noms raster.
- **Impact cahier :** aucun écart. Précise l'ADR-002 et le §3.2 (cartographie open source, sans dépendance payante).

## Liens

- Modules : M2, M3, M6 (cartes du portail)
- ADR-002 (MapLibre), ADR-004 (masque d'eau)
- Journal : 2026-11-24 ; chantier : [`../chantier-evolutions-2026-11.md`](../chantier-evolutions-2026-11.md)
