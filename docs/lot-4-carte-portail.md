# Lot 4, partie portail : régularité sur la carte

- **Statut :** compte rendu interne, projet soumis à validation humaine
- **Date :** 2026-11-26
- **État :** présent en code dans `web/`, non commité, non déployé ; le serveur du lot 4 était déjà dans l'arbre

## 1. Compréhension

La carte ne distinguait les embarcations que par la fraîcheur du GPS. La régularité n'apparaissait qu'à l'ouverture d'une fiche. Le filtre « à contrôler », l'âge en clair et les alertes AIS automatiques manquaient côté portail.

Vocabulaire : « navire à contrôler », jamais « pirate » ni « infraction » avant le constat d'un agent (cahier §3.1). Les seuils restent dans `carte_suivi.json`, au statut « Proposé ».

## 2. Ce qui est livré

| Sujet | Avant | Après |
|-------|-------|-------|
| Marqueurs GPS | Anneau de fraîcheur seulement | Losange (à contrôler) ou carré (à vérifier) en plus de l'anneau |
| Navires AIS | Silhouette selon le statut de navigation | Même losange ou carré, titre avec âge et régularité |
| Filtre | Absent | Bouton « À contrôler » sur la barre de la carte et case dans Couches |
| Liste Navires | Blocs | Tableau : embarcation, régularité, âge |
| Légende | Fraîcheur et AIS | Losange et carré expliqués |
| Notifications | Libellés AIS absents | Règles AIS nommées (hors registre, zone interdite, signal éteint) |

## 3. Vérification

Typage du portail, tests d'accueil Playwright, essai navigateur sur la carte Navires (compte agent). Les seuils d'alerte AIS restent à valider.
