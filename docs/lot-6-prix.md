# Lot 6 : prix de vente, courbes, carnet des déclarations

- **Statut :** compte rendu interne, projet soumis à validation humaine
- **Date :** 2026-11-26
- **État :** présent en code (serveur, portail, mobile) ; serveur en production le 2026-11-26 ; portail à redéployer après les ajustements Captures
- **Liens :** [chantier de novembre 2026](chantier-evolutions-2026-11.md)

## 1. Compréhension

Aucun prix de vente n'était collecté à la déclaration. Seuls les prix moyens de référence 2024 alimentaient la valeur estimée du tableau de bord. Le carnet de sortie, le rendement et le seuil de rentabilité n'existaient pas.

Le chantier demande des courbes globale et par espèce, utiles au pêcheur, visibles aussi des administrateurs, des autorités et des organisations.

## 2. Choix retenus

| Sujet | Retenu | Écarté |
|-------|--------|--------|
| Prix à la déclaration | Facultatif, entier en FCFA par kilo | Obligatoire : la règle n'est pas tranchée ; aligné sur les tarifs facultatifs du profil (décision du 2026-11-24) |
| Carnet | Vue regroupant les captures par embarcation et par jour civil (Libreville) | Nouvelle entité Sortie : reportée avec le lot 3, faute de modèle serveur de départ / retour |
| Courbes | Moyenne pondérée par le volume, masquée sous les seuils d'anonymat | Prix nominatif, courbe par site : le seuil d'anonymat par site n'est pas validé |
| Rentabilité | Mention « non renseigné » / formule à valider | Calcul de charges : liste et formule au statut « Proposé » |

Paramétrage versionné : `backend/app/data/regles/prix_marche.json` (statut « Proposé »). Modifier le fichier change le comportement sans toucher au code.

## 3. Ce qui est livré

| Surface | Après |
|---------|-------|
| Serveur | Colonne `captures.prix_fcfa_kg` ; `GET /api/v1/prix/courbes` ; `GET /api/v1/prix/carnet` ; valeur du tableau de bord : prix déclaré, sinon référence 2024 |
| Portail | Prix facultatif sur Captures (liste en tableau) ; courbes et carnet sur Pêches (agent) et Rapports (autorité, administrateur, chercheur) |
| Mobile | Prix facultatif à l'étape Détails ; onglet Carnet (rendement du jour, valeur estimée, rappel d'anonymat) |

Rôles : courbes lisibles par pêcheur, agent, autorité, administrateur, chercheur, organisation. Carnet nominatif : pêcheur (le sien), agent, autorité, administrateur. Chercheur et organisation : refusés (403).

## 4. Vérification

`pytest app/tests/test_lot6_prix.py` : 6 verts (dont prix masqué pour le chercheur). `npx tsc --noEmit` sans erreur. Navigateur, page Pêches, compte agent : champ prix et panneau « Prix de vente ». L'anonymat, le caractère facultatif du prix et l'absence de formule de rentabilité restent à valider.
