# Lots 10, 5, 2 et fin du lot 1 : partie portail (novembre 2026)

- **Statut :** compte rendu interne, projet soumis à validation humaine ; poursuivi le 2026-11-26 (lots 5, 2 et tableaux du lot 1)
- **Périmètre :** `web/` (lots 10, 2, 5, 1) ; correctifs serveur GFW déjà présents. Rien n'est commité ; aucune branche changée.

## 1. Compréhension

Contrats suivis : `lot-10-appareil-unique-serveur.md` (2.3, 2.4), `lot-5-activite-zones-serveur.md` (2.3 à 2.6), `lot-2-profil-serveur.md` (2.2 à 2.4). Toutes les routes ont répondu sur l'instance locale. L'essai Global Fishing Watch a d'abord été vu à l'arrêt (`GFW_DESACTIVE`) ; le 2026-11-24 il a été activé **localement** (`GFW_ENABLED=true`, hors commit) pour poser les points cliquables.

## 2. Exécution

### 2.1 Livré en code

| Sujet | Fichiers | Vérifié |
|-------|----------|---------|
| Appels nouveaux (appareils, activité, rapport de zone, essai GFW, identité, profils) ; erreur `ApiError` qui garde statut et code | `src/api.ts` | typage |
| Lot 10 : appareils d'un pêcheur (liste, empreinte abrégée, dates, état, libération avec motif obligatoire, autorisation supplémentaire, refus traduits sans nommer de titulaire) | `src/components/AppareilsPanel.tsx` | navigateur, 1280 px, compte agent local : liste, libération, message de succès |
| Lot 10 : alerte de suivi double lisible (règle, téléphones, fenêtre, relevés, constat en tête) | `src/pages/AlertesPage.tsx`, `src/api.ts` | typage seulement |
| Registre des pêcheurs refondu : tableau paginé par dix, fiche à onglets Synthèse, Embarcations, Identité, Appareils (agent, administrateur), Profil ; fenêtre « Nouveau pêcheur » en deux colonnes | `src/pages/LicencesPage.tsx`, `ActeursHub.tsx`, `App.tsx` | navigateur, 1280 px |
| Lot 2 : fiche d'identité à deux volets (registre, suivi), aussi dans l'onglet Registre de la fiche d'embarcation de la carte | `src/components/FicheIdentite.tsx`, `PirogueDetailDrawer.tsx` | navigateur, 1280 px (registre des pêcheurs) |
| Lot 2 : sept informations d'inscription facultatives dans la fenêtre « Ajouter une embarcation » | `ComplementsFields.tsx`, `EmbarcationModal.tsx` | typage seulement |
| Lot 2 : vue d'un profil (présentation rendue comme texte, jamais comme HTML) ; 404 affiché « page indisponible » | `ProfilVue.tsx` | navigateur (cas 404) |
| Lot 5 : couche des mailles (classes par quantiles, rampe claire vers foncée, heures écrites dès le zoom 9) | `src/geo/activiteLayer.ts`, `ZonesPage.tsx` | typage ; branchée sur la Cartographie (panneau Heures) |
| Lot 5 : panneau Heures d'activité, captures par zone, rapport de zone (tableaux + PDF) | `ActiviteHeuresPanel.tsx`, `RapportZoneVue.tsx`, `ZonesPage.tsx`, `RapportsPage.tsx` | typage ; Cartographie et Rapports non contrôlés à l'écran le 2026-11-26 (API PIGAP absente du port 8000) |
| Lot 5 : tableaux d'essai GFW hors carte (heures, navires, radar) | `GfwTableaux.tsx`, `RapportsPage.tsx` | typage |
| Lot 5 : points de pêche apparente sur la carte (violet), panneau Couches, fiche au clic (synthèse + identité à la demande) | `src/geo/gfwLayer.ts`, `GfwPanel.tsx`, `GfwFiche.tsx`, `App.tsx` ; serveur : `POST /v3/events`, réponse `201` acceptée | navigateur, 1280 px, compte agent local : 400 points sur 552 épisodes ; clic sur un point (ALICANTE) ouvre la fiche, mention « Powered by Global Fishing Watch. », vocabulaire « pêche apparente » / « indice ». 2026-11-24 : listes du panneau corrigées (plus de cartes vides « Pavillon ») ; un nom de navire ouvre la fiche |
| Lot 2 : sept informations dans l'assistant de demande de licence | `DemandeLicenceWizard.tsx`, `ComplementsFields.tsx` | navigateur : étape Activité, champs MMSI à exploitant |
| Lot 2 : page de profil de l'organisation | `OrgPortalPage.tsx`, `ProfilEditeur.tsx` | typage |
| Lot 2 : page publique `/profil/<jeton>` | `ProfilPublicPage.tsx`, `App.tsx` | navigateur : jeton fictif affiche « Page indisponible » |
| Lot 1 : file des demandes et équipe en tableaux | `DemandesPage.tsx`, `UsersPage.tsx` | typage ; Playwright (accueil public) |
| Lot 1 : signaux et alertes du tableau de bord en tableaux | `DashboardPage.tsx` | typage |
| Lot 1 : liste des zones en tableau ; fenêtre d'enregistrement après tracé | `ZonesPage.tsx` | typage |
| Lot 1 : fenêtre « Nouveau compte » en deux colonnes | `UsersPage.tsx` | typage |
| Lot 1 : menu déplié (libellé + sous-titre, sans chevron décoratif) | `AppSidebar.tsx`, `ui-kit.css` | typage |
| Lot 1 : illustrations manquantes remplacées ; garde-fou | `media.ts`, `styles.css`, `scripts/verifier-illustrations.mjs` | `npm test` |
| Lot 1 : tests d'interface rejouables | `e2e/accueil.spec.ts`, `e2e/largeurs.spec.ts` | 12 tests Playwright verts (375, 768, 1280 px) |
| Styles | fin de `src/styles/ui-kit.css` | |

Contrôles exécutés : `npx tsc --noEmit` sans erreur ; `npm test` réussi ; `npm run test:e2e` : 12 verts. `npm run build` non relancé dans cette session.

### 2.2 Reste à faire

1. CompactList encore sur Navires, Captures, Quotas, Contrôles, Organisations, Redevances ; anciennes règles de `styles.css` (`.landing-hero`, `.fo-hero`) non purgées.
2. Vérification à 1280 px sur Cartographie / Rapports / tableau de bord dès que l'API PIGAP écoute de nouveau le port 8000.
3. Lot 4 (carte des infractions) et lots 6 à 9 : pas commencés côté portail.

### 2.3 Données d'essai écrites en base locale

Un appareil fictif rattaché au compte de démonstration `LIC-DEMO-01` puis libéré (motif « Essai local »), et une connexion refusée consignée au journal.

### 2.4 Demandes au serveur

- `GET /gfw/evenements-peche` doit interroger l'éditeur par `POST /v3/events` (un `GET` avec `region-id` est refusé, 422). L'éditeur répond `201 Created` : le client doit l'accepter.
- Fait en local le 2026-11-24 (`client.py`, `service.py`, tests). `GFW_ENABLED=true` dans le `.env` local : **ne pas committer**.
- `data/open-data/gabon/ais_zee_snapshot.geojson` a été réécrit par l'API locale puis restauré.

### 2.5 Texte proposé pour le journal

> Portail, lots 10, 5, 2 et lot 1 : registre, appareils, profil, heures d'activité, rapport de zone, GFW, assistant de licence, tableaux (demandes, équipe, signaux, zones), menu déplié, Playwright (12 verts). CompactList et anciennes règles CSS encore à purger. Non commité.
