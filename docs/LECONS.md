# Leçons d'erreurs : CBM-PIGAP

Une leçon par erreur significative : ce qui s'est passé, la cause racine, la règle qui en découle.

## 2026-11-24 : une règle de style globale annulait l'affichage adapté aux téléphones

- **Constat :** sur un écran de 375 px, la page d'accueil mesurait 761 px de large ; les deux boutons d'en-tête restaient affichés et le bouton de menu sortait du champ. Le même mécanisme laissait le bouton de menu visible sur grand écran.
- **Cause racine :** la règle `button:has(> svg:first-child)` de `ui-kit.css`, ajoutée pour aligner icône et libellé, impose `display: inline-flex` avec une spécificité supérieure à celle des règles `display: none` des largeurs réduites.
- **Pourquoi le défaut est passé :** le contrôle à 375 px portait sur la page modifiée, pas sur la page d'accueil ; le portail n'a aucun test d'interface.
- **Règles :** une règle globale ne fixe jamais `display` ; après tout changement de style global, contrôler à 375 px la page d'accueil et une page du portail ; mesurer la largeur réelle du document (`scrollWidth`) plutôt que regarder la capture ; installer un test d'interface qui échoue si une page dépasse la largeur de l'écran (lot 1).

## 2026-11-24 : une hauteur de carte mesurée pendant une animation

- **Constat :** la carte de la Cartographie s'arrêtait 8 px au-dessus du bas de l'écran.
- **Cause racine :** la position du bloc était lue à l'écran (`getBoundingClientRect`) pendant l'animation d'entrée de la page, qui le translate de 8 px.
- **Règle :** mesurer une position de mise en page par `offsetTop`, qui ignore les transformations.
