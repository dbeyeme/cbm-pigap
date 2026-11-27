# JOURNAL — CBM-PIGAP

Journal de réalisation du MVP. Format imposé par le cahier technique §11.
Chaque module terminé = une entrée. Langage clair pour le porteur de projet.

---

## [2026-11-27] Portail affectation agents + LogAcces élargi

**Ce qui a été construit :**
- Page Périmètre : panneau admin pour affecter les zones aux agents (API déjà en place)
- Helper `app/core/log_acces.py` ; journalisation login échoué, dossier licence, trajectoire staff, liste alertes
- Correctif remplacement zones agent (delete + flush avant insert)
- Tests `test_log_acces_securite.py` ; `tsc` portail OK

**Pourquoi :** §7 journalisation + UX pour la vue agent par zone

**Tests réalisés :** pytest log_acces + agent_zones → 6 passed ; `npx tsc --noEmit` web OK

**Points ouverts :** GFW_API_TOKEN Railway ; consultation live flotte (LogAcces) encore partielle

---

## [2026-11-27] Sécurité — vue agent par zone et écriture GPS

**Ce qui a été construit :**
- Écriture GPS limitée à pêcheur + admin (agent/autorité/chercheur : lecture)
- Table `agent_zones` + API admin `PUT /perimetre/agents/{id}/zones` et `GET /perimetre/moi/zones`
- Lectures positions/alertes filtrées pour l'agent : intersection zones affectées ∩ zones actives (§7)
- Tests `test_agent_zones.py` ; migration `a1b2c3d4e580`

**Pourquoi :** cahier §7 (agent voit sa zone) ; clôture réserves gate sécurité (vue agent, écriture staff)

**Tests réalisés :** `pytest` agent_zones + lot8 + m2 + security_redblue → 35 passed

**Points ouverts :** UI portail pour affecter les zones aux agents ; LogAcces

---

## [2026-11-27] Sécurité red/blue — docs prod, FO, chercheur GPS

**Ce qui a été construit :**
- `/docs` et OpenAPI désactivés si `app_env=production`
- Chercheur : lecture GPS seule (plus d'écriture POST/batch)
- Rate-limit FO (30/min/IP) sur demandes licence et inscription client

**Tests réalisés :** `pytest app/tests/test_security_redblue.py` → 17 passed

**Points ouverts :** vue agent par zone ; écriture GPS agent/autorité encore autorisée (ops MVP)

---

## [2026-11-27] Lots 7 et 8 : commandes et périmètre (ADR-014, ADR-015)

**Ce qui a été construit :**
- ADR-014 et ADR-015 acceptés (écarts cahier §2.2)
- Lot 7 : rôle `client`, module `/api/v1/commandes` (inscription, réservation, acceptation, double validation, annulation), prix facultatif, aucun paiement ; portail client + onglet Commandes (Pêches) ; vitrine pêcheurs pour le client
- Lot 8 : table `perimetre_zones` (6 zones seedées), API admin, filtre PostGIS sur trajectoires / live / alertes ; désactivation masque aussi l'historique ; page Administration
- Migrations `e4a7b8c9d260`, `f5b8c9d0e371`

**Pourquoi :** décisions du porteur du 2026-11-27 (1b, 2a prix facultatif, 3a, 4b, 5b)

**Tests réalisés :** `pytest` lot 7 et lot 8 : 9 verts ; `npx tsc --noEmit` portail OK

**Points ouverts :** `GFW_API_TOKEN` à poser sur Railway avant `GFW_ENABLED=true` ; écran mobile pêcheur pour accepter / confirmer les commandes ; APK à reconstruire ; commit / déploiement après GFW local + production OK

---

## [2026-11-27] Tableaux étroits : plus de mots coupés lettre à lettre

**Ce qui a été construit :**
- `overflow-wrap: anywhere` retiré des cellules de tableau : cette règle autorisait une colonne large comme une lettre (TYPE et Pirogue affichés à la verticale dans Signaux)
- Rail du tableau de bord et listes de la carte : une fiche libellée par ligne (embarcation, type, état, régularité, âge)
- Dates d'alertes en format court `24/11 15:39`, sans coupure
- Pictogrammes de formulaire : un sujet plein par action (poisson, jauge, quittance, épingle), lisibles à 44 px

**Pourquoi :** le porteur a signalé le tableau Signaux et les dates tronquées ; la même cause existait partout où un tableau tenait dans un panneau étroit

**Tests réalisés :** `npx tsc --noEmit` ; contrôle navigateur du rail Signaux / Alertes (mots entiers, dates lisibles)

**Points ouverts :** lots 7 et 8 reportés ; Global Fishing Watch à l'arrêt en production (ADR-011)

---

## [2026-11-27] Formulaires illustrés, épingles d'alertes cliquables

**Ce qui a été construit :**
- Panneau de formulaire unique (`FormPanel`) : scène + titre sur captures, quotas, contrôles, redevances, demandes, alertes, organisations, équipe, profil, import de zones, prix de vente
- Scènes ajoutées : contrôle (QR) et redevance (quittance) ; connexion, demande de licence, appareils et choix pêcheur / organisation illustrés
- Épingles rouges du tableau de bord : clic possible, fiche, ouverture de la page Alertes (les clics étaient ignorés)

**Pourquoi :** le porteur a demandé d'uniformiser les formulaires avec plus d'illustrations, puis de pousser et redéployer ; les points rouges en ligne ne répondaient pas

**Tests réalisés :** `npx tsc --noEmit` sans erreur

**Points ouverts :** lots 7 et 8 reportés ; Global Fishing Watch toujours à l'arrêt en production (ADR-011)

---

## [2026-11-26] Contrôle global tableaux / débordements / typo

**Ce qui a été construit :**
- Suppression du `display: block` sur `.ds-table` (≤768 px) qui cassait hauteur et alignement des lignes
- Densité globale : polices tableaux 0.78 / en-têtes 0.65, pastilles 0.64, boutons compact 30 px (28 px dans les tableaux)
- Quittances : 5 colonnes, note paiement sous le titulaire, actions en icônes ; grille Encours | Quittances avec `minmax(0, 1fr)`
- Conteneurs `.table-defile` / filet `:has(> .ds-table)` pour le défilement horizontal

**Pourquoi :** chevauchements et débordements persistants malgré le premier correctif Quittances

**Tests réalisés :** `npx tsc --noEmit` sans erreur

**Points ouverts :** lots 7 et 8 reportés ; APK 0.2.0 non publiée

---

## [2026-11-26] Correctif affichage Quittances + mise en ligne

**Ce qui a été construit :**
- Tableau Quittances : une ligne par quittance, actions compactes (« Payer », PDF, Annuler), colonnes à largeurs fixes, défilement horizontal sans casser la hauteur des lignes

**Pourquoi :** les boutons primaires trop hauts et le `white-space: nowrap` mobile faisaient chevaucher les actions entre lignes

**Tests réalisés :** `tsc -b` via build Vercel réussi ; déploiement production READY

**Points ouverts :** lots 7 et 8 reportés ; APK 0.2.0 non publiée

---

## [2026-11-26] Fusion de `fix/lot-0-fonds-de-carte` dans `main`

**Ce qui a été construit :**
- Branche poussée vers GitHub, puis fusionnée dans `main` (avance rapide)

**Pourquoi :** demande explicite du porteur (« pousse et fusionne »)

**Tests réalisés :** aucun test supplémentaire à la fusion ; les 27 tests lots 4, 6, 9 et tableau de bord étaient verts avant le commit

**Points ouverts :** lots 7 et 8 reportés ; `GFW_ENABLED` hors commit ; APK 0.2.0 non publiée

---

## [2026-11-26] Ajustements portail : prix sur Captures, tableaux, déploiement

**Ce qui a été construit :**
- Courbes de prix et carnet aussi sur Pêches (l'agent n'a pas Rapports) ; bouton « Voir les rapports » masqué hors rôle
- Liste des captures en tableau défilant, actions en icônes, formulaire collé en haut
- CompactList retiré des pages restantes (quotas, contrôles, organisations, redevances, trajets)

**Pourquoi :** finir les lots du chantier avant 8 h, sans inventer les lots 7 (commandes) et 8 (multi-zones)

**Tests réalisés :** `pytest` lots 4, 6, 9 et tableau de bord : 27 verts ; `npx tsc --noEmit` sans erreur ; navigateur 1280 px, compte agent, page Pêches (champ prix, panneau Prix de vente). API production `/health` et routes `/prix/courbes`, `/alertes/etats` en ligne. Portail production : https://cbm-pigap-web.vercel.app (déploiement Vercel du 26 nov. avant 8 h)

**Points ouverts :** lots 7 et 8 reportés ; `GFW_ENABLED` hors commit ; APK 0.2.0 non publiée ; fusion `main` non demandée ; dates aberrantes et « Hors liste » viennent des jeux de test locaux (année isolée, liste pêcheurs limitée à 200)

---

## [2026-11-26] Lot 6 : prix de vente, courbes et carnet des déclarations

**Ce qui a été construit :**
- Prix de vente au kilo facultatif sur une capture (`prix_fcfa_kg`), plafond et anonymat lus dans `prix_marche.json` (Proposé)
- Courbes agrégées (globale pondérée et par espèce), masquées sous 5 déclarations et 3 pêcheurs ; carnet par embarcation et par jour, sans charges ni rentabilité calculées
- Portail : champ prix sur Captures, courbes et carnet sur Rapports et Pêches ; mobile : champ prix et onglet Carnet
- Valeur estimée du tableau de bord : prix déclaré s'il existe, sinon référence 2024

**Pourquoi :** lot 6 du chantier de novembre 2026 ; aucun prix collecté jusqu'ici ; pas d'invention de formule de rentabilité ni de carnet de sortie (départ / retour reportés)

**Tests réalisés :** `pytest app/tests/test_lot6_prix.py` (6 verts, dont prix masqué pour le chercheur) ; `pytest` lots 4 et 9 + tableau de bord : 27 verts au total ; `npx tsc --noEmit`. Seuils d'anonymat, prix facultatif et formule de rentabilité : statut « Proposé »

**Points ouverts :** lots 7 et 8 bloqués (ADR / Kimba Connect, multi-zones)

---

## [2026-11-26] Portail : lots 4 et 9 (carte des présomptions, traitement des alertes)

**Ce qui a été construit :**
- Lot 4 : régularité dans les flux de la carte (losange « navire à contrôler », carré « à vérifier »), filtre « À contrôler », âge en clair, tableau des embarcations suivies, légende, libellés des alertes AIS ; aucun mot « pirate » ni « infraction » sur la carte
- Lot 9 : page Alertes branchée sur les états de traitement, la description lisible, le commentaire obligatoire et le journal (auteur, date, état avant / après)

**Pourquoi :** lots 4 et 9 du chantier de novembre 2026, à mener ensemble ; serveur déjà présent ; portail encore limité à l'anneau GPS et aux boutons Traiter / Ignorer

**Tests réalisés :** typage du portail ; essai navigateur carte Navires et page Alertes (compte agent). Seuils AIS et liste des états : statut « Proposé »

**Points ouverts :** lots 6, 7 et 8 ; CompactList encore sur Captures, Quotas, Contrôles, Organisations, Redevances ; rien n'est commité

---

## [2026-11-26] Portail : lots 5, 2 et insuffisances du lot 1

**Ce qui a été construit :**
- Lot 5 : panneau « Heures d'activité » sur la Cartographie (filtre jour, semaine, mois, plage, légende, détail d'une maille, captures) ; mailles dessinées sur la carte ; rapport de zone en tableaux et PDF depuis la Cartographie et les Rapports ; tableaux d'essai Global Fishing Watch (heures, navires, radar) hors carte
- Lot 2 : sept informations d'inscription dans l'assistant de demande de licence ; page de profil de l'organisation ; page publique `/profil/<jeton>` (404 affiché « Page indisponible »)
- Lot 1 : file des demandes, équipe, signaux et alertes du tableau de bord, liste des zones en tableaux ; fenêtres « Nouveau compte » et « Enregistrer la zone » en deux colonnes ; menu déplié (libellé + sous-titre lisibles) ; `--hero-bg` et `media.ts` pointent vers les photographies du porteur, plus vers `landing-hero-gabon.png`

**Pourquoi :** poursuivre le chantier de novembre (lots 5 et 2 côté portail, restes du lot 1) et corriger les écrans encore en cartes

**Tests réalisés :** `npx tsc --noEmit` ; `npm test` (fonds de carte + illustrations présentes) ; `npm run test:e2e` : 12 tests Playwright verts (accueil, assistant, profil 404, 375 / 768 / 1280 px). Cartographie et Rapports non contrôlés à l'écran : le port 8000 ne sert plus l'API PIGAP

**Points ouverts :** CompactList encore sur Navires, Captures, Quotas, Contrôles, Organisations, Redevances ; anciennes règles de `styles.css` (landing-hero, fo-hero) non purgées ; rien n'est commité

---

## [2026-11-24] Essai Global Fishing Watch : points cliquables sur la carte

**Ce qui a été construit :**
- Les épisodes de pêche apparente de l'éditeur sont demandés par `POST /v3/events` (un `GET` avec identifiant de zone est refusé) ; la réponse `201 Created` est lue comme un succès
- Portail : points violets sur la carte (taille selon le zoom), panneau Couches, fiche au clic (durée, lieu, MMSI, avertissement « indice », mention « Powered by Global Fishing Watch. ») ; l'identité des registres n'est demandée que si l'agent ouvre l'onglet
- Rôles : autorité, agent de contrôle, administrateur. Aucune alerte n'est déclenchée

**Pourquoi :** les points de la carte ne répondaient pas au clic : l'essai ne renvoyait que des totaux sans lieu, puis la recherche d'épisodes échouait (422 puis 201 traité comme une erreur)

**Tests réalisés :** 23 tests GFW passés (simulateur, sans réseau) ; essai réel local : 552 épisodes, 400 affichés ; navigateur 1280 px, compte agent : clic sur un point (ALICANTE, pavillon MAR) ouvre la fiche

**Points ouverts :** `GFW_ENABLED=true` local seulement, hors commit, en attente d'accord écrit de l'éditeur (ADR-011) ; heures d'activité, rapport de zone et tableaux GFW hors carte encore à faire ; rien n'est commité ; `ais_zee_snapshot.geojson` restauré

---

## [2026-10-01] — Dossier de soumission et présentation, version 2.0

**Ce qui a été construit :**
- `docs/soumission/` : réponse au défi Kimba Connect actualisée (Word, 25 pages) et présentation native de 13 diapositives, remplaçant l'export en images
- Mises à jour : prototype réalisé et en ligne, extensions, suivi temps réel (ADR-009, triangulation écartée), sécurité et loi 001/2011 modifiée, modèle économique version 3, chiffres du secteur sourcés, annexes (démonstration, questions du jury)
- Corrections : plan de paiement de la présentation réaligné sur le dossier (15 / 45 / 25 / 15), pile technique conforme au projet, chiffres non sourcés retirés

**Pourquoi :** répondre à l'évaluation du comité par l'état réel du projet, en cohérence stricte avec `docs/modele-economique.md` et `docs/STATUS.md`.

**Tests réalisés :** validation structurelle des deux fichiers, rendu PDF et contrôle visuel page par page.

**Points ouverts :** pièces administratives à insérer ; nom du présentateur de la diapositive de sommaire à confirmer ; déploiement de la version du jour à lancer manuellement.

---

## [2026-10-01] — Ingestion des balises satellitaires `source=balise` (ADR-009, données fictives)

**Ce qui a été construit :**
- `embarcations.balise_id` (unique, nullable) + migration `e7a1c2d3f405` ; champ exposé dans les schémas Embarcation (M1)
- `POST /api/v1/positions/balises/ingest` : lot de messages au format pivot, clé partagée `X-Balise-Ingest-Key` (`BALISE_INGEST_KEY`), sur le modèle de `POST /ais/ingest`
- Service `ingest_balises` : rapprochement par `balise_id`, filtre à terre, anti-doublon, règles M7 appliquées, alerte critique `detresse_balise` sur bouton de détresse (`signaler_detresse`)
- Script `scripts/simulate_balises_nemo.py` : identifiants `BAL-FICTIF-000n`, lots périodiques le long des corridors open data
- Portail : libellé « Balise satellitaire » dans la fiche embarcation

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §3.3 point d'extension `source=balise` prévu au cahier, sans IoT propre (§2.2)
- ADR-009 : le flux réel existe (balises de l'État) ; l'entrée est prête pour un adaptateur dès l'accès obtenu
- §7 : aucune donnée réelle, numéros de série et trajets inventés

**Technologies / principes utilisés :**
- FastAPI + clé partagée (`hmac.compare_digest`), Pydantic v2, SQLAlchemy async, PostGIS (`is_on_water`)
- Traçabilité : `declencheur.origine = balise:<fournisseur>:<balise_id>`

**Tests réalisés :**
- `pytest app/tests/test_balises_ingest.py` : 4 passed (clé, trajectoire, doublons, inconnue, hors eau, détresse, unicité)
- Régression M1 / M2 / M7 / AIS / fiche / présence ports : 46 passed ; `tsc --noEmit` (web) : OK
- Lot fictif de bout en bout sur l'API locale : 5 intégrées, 1 alerte de détresse

**Points ouverts / dette technique :**
- Adaptateur du format réel (export ou API du centre de surveillance) à écrire après accès aux données
- `balise_id` non encore saisissable depuis le formulaire web du registre (API seulement)
- Vitesse et cap reçus mais non stockés (modèle Position inchangé)

---

## [2026-10-01] — Étude : suivi temps réel, triangulation GSM/GPS écartée (ADR-009)

**Ce qui a été construit :**
- `docs/adr/ADR-009-suivi-temps-reel-sources-position.md` (statut Proposé) : faisabilité de la triangulation GSM/GPS depuis São Tomé, Oyem et Tchibanga, puis sources de position retenues par couche
- Calcul des distances (haversine) entre les trois villes et des lieux de pêche types : 498 à 602 km, contre 35 km de portée GSM maximale

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §3.3 temps réel et point d'extension `source=balise` ; §7 données personnelles et consentement
- Un récepteur GPS n'émet rien ; la localisation GSM relève des opérateurs et de la loi 001/2011 modifiée : la piste est écartée pour des raisons physiques et juridiques
- Fait structurant sourcé : l'État équipe déjà la flotte artisanale de balises CLS NEMO (objectif 1 000 pirogues, plus de 300 installées, émission toutes les 30 min, satellite Kinéis). Le flux temps réel existe ; il faut en obtenir l'accès

**Technologies / principes utilisés :**
- Aucune modification de code ; recommandation d'un endpoint d'ingestion `source=balise` sur le modèle de `POST /ais/ingest`, à réaliser après validation

**Tests réalisés :**
- Sans objet (documentation)

**Points ouverts / dette technique :**
- Décision de Christian sur l'ADR-009 et démarche de Kimba Connect auprès du ministère de la Pêche pour l'accès aux données NEMO
- Présence du Gabon dans les quatorze marchés Airtel Africa / Starlink Direct to Cell à confirmer

---

## [2026-10-01] — Exploitation du rapport PêcheGabon Hub : référentiels, redevances, contrôles, alertes, indicateurs

**Ce qui a été construit :**
- Référentiel métier (`referentiels_peche.json`, module `referentiels`) : 26 espèces avec groupe officiel et production 2024, espèces protégées, 9 engins observés, types de pirogue, matériaux, strates, sites de débarquement, nationalités, catégories d'infraction, barèmes d'autorisation et de taxe à la production, prix moyens 2024, repères 2024 du Grand Libreville ; captures validées contre le référentiel (anciens codes acceptés en alias) ; catalogue enrichi pour le web et le mobile (sélecteurs par groupe, engins nommés, sites proposés)
- Redevances (module `redevances`) : taxe à la production calculée une fois par capture (poids × taux), quittances numérotées regroupant les taxes dues d'un pêcheur ou de tous les membres d'une organisation, paiement Mobile Money depuis le numéro enregistré (paiement partagé avec les abonnements, démo ou pawaPay), captures figées après quittance, annulation, synthèse, PDF avec QR code de vérification ; onglet Redevances du web, écran « Mes redevances » du mobile
- Contrôles (module `controles`) : missions de surveillance, contrôles d'embarcation (licence lue par QR code, engin déclaré contre engin trouvé, pêcheurs à bord, infraction, saisies, sanction), alerte critique sur infraction, vérification complète pour les agents et page publique de vérification sans donnée personnelle (`/verif/licence/{numero}`, `/verif/quittance/{numero}`) ; QR code et validité sur la licence PDF ; page Contrôles du web
- Alertes : espèce protégée, autorisation annuelle expirée ou pêcheur suspendu, retour au port sans déclaration (reconstitution des séjours port et mer depuis le GPS), infraction constatée
- Registre : nationalité du propriétaire (barème national ou étranger, montant d'autorisation calculé à l'approbation), type de pirogue, matériau, puissance moteur, site d'attache, strate ; préfixes d'immatriculation observés (OW, L, AK, CC, KG)
- Tableau de bord : débarquements, jours de pêche, kg par jour, valeur estimée (prix moyens 2024), taxe due et encaissée, licences valides et expirées, contrôles et infractions, répartitions par groupe, engin et site
- Migration `d0f3c8b57899` ; note d'analyse `docs/benchmark-pechegabon-hub.md`

**Pourquoi :**
- Rapport d'étude NTSAGUI-2026-PGH-001 transmis par le porteur : données réelles de l'administration (espèces, engins, sites, barèmes, effort 2024) et chaîne de contrôle à couvrir ; ses défauts (taxes recalculées, données personnelles publiées, barèmes sans texte) ont guidé les garde-fous

**Tests réalisés :**
- `test_redevances.py`, `test_controles.py`, `test_alertes_metier.py` ; suite complète 149 verts (deux tests connus sensibles à la base partagée) ; type-check et build web, type-check mobile

**Points ouverts :**
- Barèmes, classements d'espèces, sites et strates à valider par la DGPA (`a_valider_dgpa`) ; aucune répartition des recettes sans texte
- Feuille de route : attribut institution sur les comptes, workflows inter-institutions, objectifs par pirogue, pêche industrielle, rappels SMS, interface mobile en anglais

---

## [2026-10-01] — Offre commerciale et modèle économique, version 2

**Ce qui a été construit :**
- `docs/modele-economique.md` réécrit en réponse à l'évaluation Kimba Connect : catalogue en cinq composantes (section 11 des termes de référence), marché et redevances officielles sourcés (ministère, FAO, ARCEP), coûts de plateforme sourcés (Railway, Vercel, pawaPay), scénarios encadrants, point mort, indicateurs commerciaux du pilote, risques, hypothèses à valider
- Grille tarifaire inchangée, donc catalogue code inchangé
- Version 3 (même jour) : offre en une page, section « pourquoi maintenant » (déficit halieutique, objectif 50 000 tonnes, bilan Gab Pêche), TVA 18 % et prix HT/TTC, voie de commande publique (seuil 35 millions TTC, procédures réservées aux PME gabonaises), conformité loi n° 001/2011, référence Abalobi, scénarios recalculés hors taxes et nets de frais, trajectoire à trois ans, plan commercial à douze mois

**Pourquoi :**
- Commentaire du jury : « offre commerciale et modèle économique à approfondir » (offre commerciale 6/10)

**Points ouverts :**
- Consentement à payer et prix Flotte par rapport au B2C à tester en pilote ; devis matériels et régime fiscal à obtenir ; document soumis à validation avant diffusion

---

## [2026-10-01] — Écarts fonctionnels TDR : limites, concentration, équipements, GPS hors-ligne, CORS

**Ce qui a été construit :**
- Alerte « dépassement d'une limite géographique » (TDR §5.3) : nouveau type de zone `autorisee` (zones de pêche autorisées, limites territoriales) ; une position maritime hors de toute zone autorisée active déclenche une alerte critique, une fois par embarcation et par jour ; sans zone autorisée, la limite est la ZEE élargie ; positions fluviales ignorées
- Alerte « concentration excessive de pêcheurs dans une zone » (TDR §5.7) : embarcations distinctes dans un rayon (2 km) et une fenêtre (± 60 min) autour de chaque position ; seuil 10 par défaut (`ALERTE_CONCENTRATION_*`), alerte d'attention au niveau de la zone, une par cellule et par heure
- Équipements utilisés (TDR §5.1) exposés dans les formulaires : engins, moteur, sécurité et navigation, longueur ; formulaire agent (Licences), formulaire public de demande de licence (transmis à l'embarcation à l'approbation), saisie mobile ; affichés dans la fiche embarcation
- File hors-ligne des positions GPS (TDR §5.2, contrainte §10) : chaque relevé est écrit en SQLite avant envoi, synchronisation par lot et par embarcation, conservation en cas de coupure réseau, rejet définitif des positions refusées par le serveur (hors eau), indicateur « N positions conservées sur le téléphone »
- CORS fermé : `CORS_ORIGINS` (liste) et `CORS_ORIGIN_REGEX` (aperçus Vercel) ; joker toléré en développement seulement, avertissement en production
- Migration `c9e2b7a46788` (valeur d'enum `autorisee`, colonnes longueur et équipements sur les demandes), légende et couleur de zone autorisée sur les cartes web

**Pourquoi :**
- Mise en conformité avec les termes de référence du défi (points relevés dans l'analyse du 2026-10-01) et réserve sécurité CORS ouverte depuis la revue M1 à M7

**Tests réalisés :**
- `test_alertes_limite_concentration.py` (limite positive et négative, anti-doublon ; concentration sous et au-dessus du seuil), `test_equipements_demande.py` (transmission demande → embarcation, JSON invalide refusé), suites M2, M3, M7 et demandes de licence vertes ; type-check web et mobile, build web

**Points ouverts :**
- Seuils de concentration et polygones des zones autorisées à calibrer avec la DGPA (aucune zone autorisée chargée par défaut)
- La file GPS hors-ligne se synchronise au relevé suivant et à l'ouverture de l'écran ; pas encore de tâche d'arrière-plan

---

## [2026-09-21] — Paiement Mobile Money initié depuis le numéro enregistré de l'acteur

**Ce qui a été construit :**
- Audit du circuit PawaPay : le dépôt (`POST /v2/deposits`, payeur MMO Airtel Gabon) était bien un dépôt initié vers le téléphone du payeur, mais le numéro était libre et non rattaché à l'acteur
- Règle métier (`resoudre_msisdn_paiement`) : numéro omis → téléphone enregistré du pêcheur (compte utilisateur) ou de l'organisation ; numéro différent → refusé pour l'acteur lui-même et pour un agent sans autorisation explicite (`numero_tiers_autorise`), accepté et tracé sinon (`payeur_tiers`, `msisdn_acteur` dans les métadonnées du paiement)
- `GET /abonnements/payeur` : numéro enregistré attendu (pêcheur connecté, organisation connectée, ou ciblé par un agent)
- Web : champ payeur pré-rempli depuis le titulaire et verrouillé ; case « Autoriser un payeur tiers » ; mobile : numéro enregistré affiché en lecture seule, bouton de paiement bloqué si aucun téléphone valide
- Tests : `test_paiement_msisdn.py` (défaut, refus d'un autre numéro, même numéro écrit autrement, payeur tiers agent, absence de téléphone) ; tests existants alignés

**Pourquoi :**
- Demande porteur : vérifier que les paiements sont des dépôts Mobile Money initiés depuis le numéro de téléphone de l'acteur

**Tests réalisés :**
- Suites abonnements, PawaPay, modules et paiement : vertes

**Points ouverts :**
- Le téléphone enregistré doit être fiable : le formulaire de demande de licence et la fiche pêcheur restent la source ; prévoir une vérification du numéro par code SMS ou premier paiement réussi

---

## [2026-09-20] — Fiche embarcation PIGAP au clic et infobulles en portail

**Ce qui a été construit :**
- `GET /positions/embarcations/{id}/fiche` (`geolocalisation/fiche.py`) : titulaire, licence et statut, couverture d'abonnement, dernière position et signal, statut au port (à quai, en manœuvre, en mer), trajectoire 24 h, zones réglementées touchées, alertes récentes, captures 30 jours, verdict conforme / à vérifier / alerte avec motifs
- Web : tiroir `PirogueDetailDrawer` ouvert au clic sur un marqueur GPS, une ligne de la liste temps réel ou une ligne de présence au port ; trace 24 h dessinée sur la carte ; exclusion mutuelle avec la fiche AIS
- `HelpTip` rendu en portail (`document.body`, position fixe, repositionnement automatique) : les bulles passent au-dessus de la carte et ne sont plus rognées par le panneau défilant

**Pourquoi :**
- Retour porteur en production : le clic sur un navire n'affichait rien (seule la couche AIS, vide en production, ouvrait une fiche) ; les infobulles étaient cachées par la carte

**Tests réalisés :**
- `pytest` fiche (à quai à Owendo, trajectoire, 404) + géolocalisation : 19 passed ; `tsc -b` + `vite build` OK ; vérification visuelle

**Points ouverts :**
- Aucun

---

## [2026-09-20] — Météo-marine : bulletin, zones calculées, alertes automatiques, aides contextuelles

**Ce qui a été construit :**
- Module `meteo_marine` (ADR-008) : houle et maximum 24 h, période, courant de surface, vent et rafales, pluie, visibilité, température de surface, hauteur d'eau et tendance de marée par secteur (8 secteurs du littoral), débit et tendance des fleuves (4 stations GloFAS) ; sources Open-Meteo CC BY 4.0, sans clé, réponse en 0,5 s
- Croisements : captures déclarées 30 jours par secteur, quotas des zones réglementées (pression 75 %, surexploitation 90 %), zones interdites → classes danger / prudence / favorable / surexploitée / ordinaire avec motifs et conseil en langage clair ; risque distinct pirogues / navires
- Alertes automatiques (`anomalie`, règles `meteo_marine`, `crue_fleuve`) par bloc de 6 h, notifications ; `GET /meteo/bulletin`, `/meteo/zones`, `/meteo/avis?lon&lat`
- Web : panneau « État de la mer et des fleuves » (Surveillance / Navires), couche carte « Zones calculées » colorée avec étiquettes, bandeau « Bulletin de mer » du tableau de bord, libellés des nouvelles alertes ; composant `HelpTip` (infobulles pédagogiques et encarts « Comment exploiter ») posé sur le tableau de bord, le panneau mer et les calques
- Mobile : carte « Avis de mer » sur l'accueil pêcheur (niveau, conseil, conditions clés, fleuve proche)

**Pourquoi :**
- Demande porteur : signaler automatiquement risques et opportunités (état de mer, courants, niveaux), présenter zones de danger / favorables / surexploitées par croisement de données, édifier les utilisateurs par des aides contextuelles

**Tests réalisés :**
- `pytest` : 129 passed (9 tests météo : Douglas, risque, opportunité, crue, endpoints, alertes idempotentes) ; instabilité connue de `test_predictions` sur base partagée
- Bulletin réel vérifié : Cap Lopez classé danger (zone interdite de test), sud du littoral en prudence (houle 1,8 à 2 m), estuaire favorable
- `tsc -b` + `vite build` web, `tsc --noEmit` mobile OK

**Points ouverts :**
- Station Komo retirée (cellule GloFAS irréaliste) ; recaler les cellules avec la Direction de la météorologie
- **Correctif déploiement** : l'image Docker du backend ne contenait pas `data/open-data/gabon/` (ZEE, masque d'eau, ports, secteurs) : en production le filtre ZEE rejetait tout et le bulletin était vide. Copie embarquée dans `backend/app/data/gabon/` (`scripts/sync_data.py`), résolution par `app/core/datafiles.py`, test de synchronisation `test_datafiles.py`
- Pas de chlorophylle ni de validation locale des modèles : afficher comme aide à la décision (fait) et comparer avec les observations des pêcheurs en Phase 3

---

## [2026-09-20] — Ergonomie : icônes, abonnements, sidebar repliable, modales, illustrations, responsive, navires

**Ce qui a été construit :**
- Icônes sur tous les boutons et onglets (`HubTabs` exige une icône ; 25 icônes d'action ajoutées ; injection automatique par libellé sur 14 fichiers)
- Page Abonnements refondue : « Licences pêcheurs / Abonnements organisations / Modules par organisation » à la place de B2C / B2B ; indicateurs, filtre et recherche, cartes par contrat (titulaire, formule, montant, échéance, statut lisible), activation en modale, résolution des titulaires hors liste paginée
- Sidebar repliable (bouton, état mémorisé) n'affichant que les icônes ; dépliage temporaire au survol sur écran large
- Formulaires de création en modales illustrées : pêcheur, compte d'équipe, organisation, activation d'abonnement ; en-têtes de page illustrés (Acteurs, Rapports, Équipe, Organisations, Navires, Surveillance) et états vides illustrés ; composant `Illustration` (15 scènes SVG maritimes)
- Responsive tablette et mobile : sidebar en tiroir, vue carte empilée (panneau puis carte), grilles en une colonne, onglets défilants, tiroir navire en bas d'écran, tableaux défilants
- Navires : silhouettes vues de dessus par type (cargo, pétrolier, pêche, passagers, remorqueur, plaisance, pirogue), orientées par le cap, dimensionnées par la longueur, colorées par statut, sillage si en route, étiquette pavillon + nom + statut ; correctif de positionnement des marqueurs et resynchronisation du canevas au redimensionnement ; libellés métier des alertes sur le tableau de bord

**Pourquoi :**
- Retour porteur : boutons et onglets sans icône, vocabulaire B2B/B2C inadapté, onglet Abonnements dégradant la qualité, sidebar à replier, formulaires et filtres à réorganiser, plateforme à illustrer, responsive manquant, navires peu réalistes

**Tests réalisés :**
- `tsc -b` + `vite build` OK ; vérification visuelle desktop (Acteurs, Abonnements, Rapports, Navires, sidebar repliée) et mobile (375 px)

**Points ouverts :**
- Icônes injectées d'après le libellé : à relire ponctuellement (un libellé inhabituel reçoit l'icône par défaut du mot-clé)
- Formulaires Quotas et Zones encore en ligne (pas en modale) : à traiter dans un second lot

---

## [2026-09-20] — Fiche navire AIS, veille golfe de Guinée, navires en approche

**Ce qui a été construit :**
- `GET /ais/vessels/{mmsi}` : fiche navire complète (identification, pavillon UIT via `flags.py`, correspondance registre PIGAP, zones réglementées PostGIS, statut, route récente, position estimée) avec verdict conforme / à vérifier / alerte et motifs
- Zone de veille élargie au golfe de Guinée (`AIS_WIDE_BBOX`) et extrapolation de route (`navigation.py`) : navires hors ZEE annoncés dans `approches` avec heure et point d'entrée prévus (réponse à la question du porteur sur le croisement des signaux nord / sud du golfe)
- Web : fiche navire au clic (marqueurs et listes), trace jaune du navire sélectionné, couche « approche » avec route pointillée jusqu'au point d'entrée, bascule d'emprise Eaux gabonaises / Golfe de Guinée, panneau AIS enrichi (pavillon, approches)
- Carte : fond Carto continu sous l'imagerie Esri (tuiles « Map data not available » en pleine mer au zoom 8 sur le golfe), emprise navigable étendue au golfe de Guinée, vue carte bornée à la hauteur de l'écran (le panneau latéral étirait la carte sur 2 900 px)
- Déployé : backend Railway (route `/ais/vessels/{mmsi}`) et web Vercel ; `AIS_INGEST_KEY` de développement ajoutée au `.env` local pour tester l'ingestion

**Pourquoi :**
- Demande porteur après consultation de Copernicus Marine In Situ : cliquer sur un navire et voir identification, régularité, localisation ; représenter plus largement l'espace maritime gabonais et le golfe ; utiliser les signaux lointains pour anticiper les entrées. Précision apportée : Copernicus In Situ montre des plateformes océanographiques (flotteurs, bouées, navires d'opportunité), pas la flotte de pêche

**Tests réalisés :**
- `pytest` : 121 passed (nouveaux : pavillon MMSI, estime, entrée prévue depuis le Nigeria, approches séparées, fiche navire hors / dans registre, 404)
- `tsc -b` + `vite build` OK ; vérification locale avec trois navires injectés par `/ais/ingest`

**Points ouverts :**
- `test_predictions::test_intrusion_zone_la_plus_frequente_en_tete` instable sur la base de développement partagée (passe isolé), indépendant de ce lot
- Rapprochement registre limité au nom, à l'indicatif et au MMSI : ajouter un champ MMSI / IMO sur les embarcations enregistrées pour une correspondance certaine

---

## [2026-09-20] — Présence au port calculée depuis le GPS PIGAP (sans matériel)

**Ce qui a été construit :**
- `geolocalisation/presence.py` + `GET /positions/presence-ports` : à quai / en manœuvre / en mer / sans signal par embarcation, arrivées et départs sur la fenêtre, rapprochement des déclarations de captures (point de débarquement → port) avec la présence GPS (`coherente` / `incoherente` / `non_verifiable`)
- Référentiel ports partagé AIS / flotte PIGAP ; `port_from_text` (texte libre → port) ; `rayon_quai_km` et correction du port môle de Libreville sur le littoral (9,418 E / 0,387 N)
- Masque d'eau : acceptation des positions GPS dans le rayon de quai des ports hors polygone ZEE (Port-Gentil, Libreville, Mayumba…) — auparavant refusées (`POSITION_HORS_EAU`), ce qui rendait toute présence au port impossible
- Web : `PortPresencePanel` dans la vue Surveillance / Navires (puces par port, liste à quai avec durée, embarcations en mer avec port de départ, déclarations à vérifier), rafraîchi avec le polling live

**Pourquoi :**
- Recommandation retenue par le porteur : pallier l'absence de couverture AIS par le croisement des données déjà détenues (GPS mobile, déclarations), avant tout capteur (Bluetooth, LoRa, radar)

**Tests réalisés :**
- `pytest` : 116 passed (5 nouveaux : quais hors ZEE acceptés, texte → port, à quai / en manœuvre / en mer / départ, déclaration incohérente signalée, auth)
- `tsc -b` + `vite build` OK

**Points ouverts :**
- Rade intérieure de Port-Gentil au-delà de 2,5 km du quai encore hors masque d'eau (polygone portuaire dédié à ajouter)
- Étape suivante de la recommandation : pointage géorepéré et journal de connectivité dans l'application mobile, puis pilote balises Bluetooth / Meshtastic (`source=balise`)

---

## [2026-09-20] — AIS temps réel (ports), numérotation automatique, couche design

**Ce qui a été construit :**
- `ais_gabon` : connexion AISStream permanente + état de flotte accumulé (`fleet.py`, TTL 30/180 min), marge côtière sur la ZEE (Port-Gentil et Owendo inclus), référentiel `ports.json`, statut opérationnel par navire (à quai, au mouillage, en route, en pêche), `GET /ais/ports`, `GET /ais/status`, `POST /ais/ingest` (récepteurs AIS locaux, AIS-catcher JSON ou NMEA via `pyais`)
- Numérotation automatique à l'approbation définitive : table `compteurs` (incrément atomique), `numero_licence_attribue` / `immatriculation_attribuee` sur les demandes, formats paramétrables (`GA-PA-{annee}-{seq:05d}`, `GA-{zone}-{annee}-{seq:04d}`), champ numéro devenu optionnel (web, mobile, API) avec reprise possible d'un numéro papier — migration `b8f2a7d35677`
- Web : couche design `styles/ui-kit.css` (système de boutons unique, suppression des conflits de survol hérités du `button:hover` global et des teintes ocre / turquoise, barre latérale par sections avec état système, transitions de page, modales, toasts, tableaux), panneau `AisPanel` (état du flux, présence par port), libellés professionnels (plus de « semis », « simulateur », « Module Mx », codes bruts d'alerte)

**Pourquoi :**
- Mesure 2026-09-20 : clé AISStream valide (Manche : 64 navires en 15 s) mais 0 message sur le Gabon en 150 s et Open Waters vide → aucune station communautaire sur le littoral gabonais ; la fenêtre de 25 s ne pouvait de toute façon pas voir les navires à quai (émission toutes les 3 min)
- Demande porteur : identifiants attribués automatiquement à l'approbation ; interface jugée non professionnelle (survols, boutons, barre latérale, transitions)

**Tests réalisés :**
- `pytest` backend : 111 passed (18 tests AIS, 7 tests numérotation dont concurrence)
- `tsc -b` + `vite build` web OK ; vérification visuelle (tableau de bord, surveillance, demandes)

**Points ouverts :**
- Raccorder un récepteur AIS physique à Owendo et à Port-Gentil (`AIS_INGEST_KEY`) — sans lui, la présence au port reste vide et l'interface le dit
- Valider les formats de numérotation et les coordonnées des ports avec la DGPA / OPRAG
- ~~Mobile : erreur TypeScript `AbonnementScreen.tsx`~~ corrigée (type `paiement.operateur` ajouté dans `mobile/src/api.ts`) ; test `test_m1_pecheurs` rendu indépendant du volume de la base partagée (nom unique)
- ~~Déployer~~ **Déployé le 2026-09-20** : backend Railway `cbm-pigap` (migration `b8f2a7d35677` exécutée, `pyais` dans l'image, variables `AISSTREAM_API_KEY`, `AIS_INGEST_KEY`, `AIS_COASTAL_BUFFER_DEG` posées) ; web Vercel `cbm-pigap-web` en production. Flux AISStream connecté en prod, 0 message Gabon (attendu sans récepteur local)

---

## [2026-09-18] — PawaPay live (Airtel Money Gabon)

**Ce qui a été construit :**
- Client `pawapay.py` : dépôt `/v2/deposits`, check statut, normalisation MSISDN `241…`
- Mode `MOBILE_MONEY_MODE=live` : init B2C/B2B → push PIN Airtel (AIRTEL_GAB / XAF)
- Webhook `POST /abonnements/webhook/pawapay/deposits` + `POST …/paiements/{id}/synchroniser`
- `GET /abonnements/paiement-config` ; mobile + web attendent le PIN puis poll
- Token `PAWAPAY_API_TOKEN` en env (local + Railway)

**Pourquoi :**
- Paiements réels abonnement / licence au Gabon (hors MVP cahier, demandé porteur)

**Tests réalisés :**
- `pytest test_pawapay.py test_abonnements.py` — 10 passed
- Token prod validé antérieurement (AIRTEL_GAB)

**Points ouverts :**
- Configurer l’URL callback dans le **dashboard PawaPay** :
  `https://cbm-pigap-production.up.railway.app/api/v1/abonnements/webhook/pawapay/deposits`
- Moov Money non couvert par PawaPay Gabon (Airtel seul)

---

## [2026-09-15] — Fix paiement démo B2C (« Paiement introuvable »)

**Ce qui a été construit :**
- `abonnements/service.py` : `await db.commit()` après init / confirmer / webhook / annuler / modules / activer (la session `get_db` ne committait jamais → rollback après 201)
- Mobile Abonnement : licence optionnelle pour le pêcheur (JWT) ; CTA « Payer et activer (demo) »

**Pourquoi :**
- pecheur1 : init OK puis confirmer-demo 404 Paiement introuvable

**Tests réalisés :**
- Local : init + confirmer-demo → abonnement `actif`
- Prod Railway (déployé depuis `backend/`) : même parcours OK

**Points ouverts :**
- Aucun

---

## [2026-09-15] — Mobile multi-rôles (pêcheur / agent)

**Ce qui a été construit :**
- Login → `fetchMe` → shells distincts : PecheurHome vs AgentHome
- BottomNav par rôle ; Captures / Tracking en mode `pecheur` | `agent`
- Refus des rôles web-only (admin, autorité, organisation) avec message clair
- Pas de rebuild Docker (Expo ; API `/auth/me` déjà en place)

**Pourquoi :**
- Demande porteur : pêcheurs et agents doivent avoir des fonctionnalités distinctes sur mobile

**Tests réalisés :**
- `tsc` mobile OK
- Login API local : agent → `agent_controle`, pecheur1 → `pecheur`, admin → refus côté app

**Points ouverts :**
- Persistance SecureStore ; parcours org mobile si besoin Phase 3

---

## [2026-09-15] — Crash mobile + admin B2C + modules B2B + portail org

**Ce qui a été construit :**
- Fix mobile : espaces Unicode / locale / ErrorBoundary / transition sans `exiting` (crash iOS)
- Admin Abonnements : suivi B2C (filtres, activer/annuler), onglet Modules B2B (superadmin)
- Rôle `organisation` + `utilisateurs.organisation_id` ; compte créé à l’approbation personne morale
- Portail org : inscription validée → paiement B2B démo → modules inclus
- Migration `a7e1f6c24566`

**Pourquoi :**
- Demande porteur : crash mobile + gestion B2C + modules par formule + espace org

**Tests réalisés :**
- `pytest` catalog + modules : 6 passed
- `tsc` web + mobile OK

**Points ouverts :**
- Brancher SingPay live ; déployer migration Railway ; UX org élargie (liste pêcheurs détaillée)

---

## [2026-09-15] — Abonnements B2C/B2B + Mobile Money (démo)

**Ce qui a été construit :**
- Module backend `abonnements` : catalogue tarifs, initier B2C/B2B, confirmer-demo, webhook, couverture flotte (anti double facturation), garde optionnelle `ABONNEMENT_ENFORCE`
- Migration Alembic `f6d0e5b13455` ; UI web Acteurs → Abonnements ; mobile écran Abonnement
- ADR-007 (écart cahier §2.2) ; tests catalogue unitaires verts ; tests API PostGIS non exécutés (Docker local down)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Demande explicite monétisation ; réf. `docs/modele-economique.md` ; écart §2.2 documenté ADR-007

**Technologies / principes utilisés :**
- Mobile Money mode `demo` (Airtel/Moov live via webhook plus tard) ; FastAPI + Alembic

**Tests réalisés :**
- `pytest app/tests/test_abonnements_catalog.py` — 3 passed
- `npx tsc --noEmit` (web) OK
- `test_abonnements.py` (API) — bloqué : PostGIS local indisponible

**Points ouverts / dette technique :**
- Brancher SingPay/PViT ; HT/TVA ; activer enforce en Phase 4 ; relancer tests API quand DB up

---

## [2026-09-15] — Modèle économique : abonnements B2C & licences B2B

**Ce qui a été construit :**
- Document [`docs/modele-economique.md`](modele-economique.md) : offre B2C pêcheurs (3 000 FCFA/mois · 30 000 FCFA/an via Mobile Money), grilles B2B Autorité (2,5 M/mois · 25 M/an) et Flotte/Coop (150 k/mois · 1,5 M/an + extras embarcation), packs balises, structure de coûts, scénarios CA, parcours paiement cible V2

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Préparer Phase 3–4 commerciale ; paiement / facturation / abonnement restent **hors MVP** (§2.2) — analyse seule, pas d’implémentation code
- Calibrer le B2B pour absorber balises, sat, hébergement et support dans le contexte gabonais (coexistence NEMO, ADR-005 AIS open)

**Technologies / principes utilisés :**
- Agrégateurs Mobile Money Gabon (cible) : SingPay / PViT / E-Billing ; anti double facturation pêcheur flotte vs indépendant

**Tests réalisés :**
- non exécutés (livrable documentaire)

**Points ouverts / dette technique :**
- Confirmer HT/TTC avec expert-comptable ; partenariat NEMO ; monétisation réelle reportée Phase 4 / V2

---

## [2026-09-15] — Flotte démo allégée + carte / filtres

**Ce qui a été construit :**
- Semis maritime : **1 corridor / bateau** (Espoir, Mondah, Ogooué, Chaloupe Cap Lopez, Mayumba) — plus de téléports multi-scénarios ni `entree_etranger` / `ntem_fleuve` en GPS mobile
- Espacement horodatage **distance-aware** (~12–15 km/h) ; Chaloupe typée `chaloupe` (icône navire)
- Live fleet limitée à 5 routes ; AIS carte : silhouette + badge distincts des pirogues PIGAP
- UI : barre période compacte (dashboard / rapports), toggles carte allégés, FO sans chiffres / carte démo factices

**Pourquoi :**
- Corriger anomalies de position (téléports) et densité de flotte pour une démo lisible côte gabonaise

**Tests réalisés :**
- `npx tsc --noEmit` (web) OK
- Purge DB locale : à relancer quand PostGIS est up (`seed_production_demo` puis `seed_maritime_scenarios`)

**Points ouverts :**
- Docker/PostGIS local indisponible au moment du semis — relancer les scripts seed

---

## [2026-09-10] — Refonte UX FO + Admin (design thinking / PNL)

**Ce qui a été construit :**
- Design system : tokens unifiés, `styles/motion.css`, focus-visible, pulses limités (3 cycles), fond BO calme
- FO : hero épuré (marque + CTA), demande licence en primaire, connexion autorités en secondaire, nav mobile drawer, chiffres démo, skip link, focus trap modal
- Admin : topbar épurée (titre + search + notif, logout sidebar seul), hubs sans double titre
- Dashboard carte-first : KPIs → map+rail (Signaux/Alertes) → Analyse (prédictions, tendances, espèces, journal)

**Pourquoi :**
- Réduire la charge cognitive (chunking PNL), ancrer un signal primaire par écran, motion d’état plutôt que décoration

**Tests réalisés :**
- `npx tsc --noEmit` (web) OK

**Points ouverts :**
- Validation humaine visuelle (Christian) avant gel UI Phase 3

---

## [2026-07-27] — Phase 0 : socle agents, règles, skills et suivi

**Ce qui a été construit :**
- `AGENTS.md` : contrat de travail pour tout agent Cursor
- Sous-agents projet dans `.cursor/agents/` : `module-builder`, `module-verifier`, `backend-geospatial`, `mobile-offline`, `web-dashboard`, `security-auditor`, `journal-keeper`
- Règles Cursor dans `.cursor/rules/` (core, discipline de phase, backend, mobile, web, sécurité, documentation)
- Skills projet : `start-module`, `finish-module`, `update-journal`, `write-adr`, `pigap-status`
- Documents de suivi : `docs/STATUS.md`, ce `JOURNAL.md`, index ADR, checklists Phase 0/DoD
- Hooks Cursor : injection du statut en début de session + rappel de journalisation en fin de tour

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §0 et §11 : le cahier est le contrat agent ↔ porteur ; le journal et le suivi module par module sont obligatoires
- §9 Phase 0 : création du `JOURNAL.md` et amorçage de la discipline avant le code
- §3.1 / §8 : modularité, DoD et commits conventionnels encodés dans les règles et agents

**Technologies / principes utilisés :**
- Cursor Rules (`.mdc`), Skills (`SKILL.md`), Subagents (`.cursor/agents/*.md`), Hooks (`hooks.json`)
- Séparation des responsabilités : construire / vérifier / sécuriser / documenter

**Tests réalisés :**
- Non applicables (pas encore de code applicatif). Vérification structurelle : arborescence créée.

**Points ouverts / dette technique :**
- ~~Initialiser le monorepo (§3.4), docker-compose PostGIS, squelette FastAPI `/health`, CI~~ → traité dans l'entrée suivante
- Décisions Expo vs bare et MapLibre vs Leaflet à trancher en Phase 1 (ADR)

---

## [2026-07-27] — Phase 0 : monorepo, PostGIS, FastAPI `/health`, CI

**Ce qui a été construit :**
- Structure monorepo §3.4 : `backend/`, `mobile/`, `web/`, `infra/`, `.github/workflows/`
- `infra/docker-compose.yml` : PostgreSQL 15 + PostGIS 3.4 (`pigap-db`) + service API optionnel
- Squelette FastAPI (`backend/app/`) : config, logging structlog, session SQLAlchemy async, route `GET /health` → 200
- Tests : `pytest` (`test_health_returns_200` vert) ; lint `ruff` + format `black`
- Pipeline CI GitHub Actions : lint + tests à chaque push/PR sur `main` et `feature/**`
- Dépôt Git local initialisé à la racine du projet ; `.env.example` + `.gitignore`
- Placeholders `mobile/` et `web/` (README) en attendant Phase 1 / M6

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 0 : monorepo, docker-compose PostGIS, squelette `/health`, CI
- §3.2 / §3.4 : stack et arborescence retenues pour le dossier Kimba Connect
- §3.1 sobriété : pas de logique métier avant Phase 1 / M1

**Technologies / principes utilisés :**
- FastAPI, Pydantic Settings, structlog, SQLAlchemy 2 async, GeoAlchemy2 (prêt), Alembic (dossier réservé)
- Docker Compose + image `postgis/postgis:15-3.4`
- GitHub Actions (`actions/setup-python`, ruff, black, pytest)

**Tests réalisés :**
- `ruff check app` : OK
- `black --check app` : OK
- `pytest` : 1 passed (`GET /health` → 200 / `{"status":"ok"}`)
- PostGIS local : `SELECT PostGIS_Version()` → 3.4 (GEOS/PROJ actifs)
- Curl manuel : `http://127.0.0.1:8000/health` → 200

**Points ouverts / dette technique :**
- Écart §3.4 : workflows CI placés en `.github/workflows/` (racine) car GitHub n'exécute pas `infra/.github/workflows/` — pointeur documenté dans `infra/`
- Image PostGIS forcée `platform: linux/amd64` (émulation sur Apple Silicon) — à revoir si une image multi-arch stable convient
- Alembic non initialisé (prévu Phase 1) ; auth JWT pas encore branchée (dès le premier endpoint métier)
- Validation humaine Phase 0 recommandée avant Phase 1

---

## [2026-07-27] — Phase 1 : schéma DB, contrats API, maquettes, ADR

**Ce qui a été construit :**
- Modèles SQLAlchemy §4 : Utilisateur, Pêcheur, Embarcation, Position, ZoneReglementee, Capture, Quota, Alerte (+ `Organisation` minimale pour la FK, + `LogAcces` §7)
- Migration Alembic `34280c301303_initial_schema_phase1` appliquée sur PostGIS local (extension PostGIS créée dans `env.py`)
- Contrats Pydantic M1–M7 + auth/commun (`docs/api-contracts.md`)
- Maquettes basse fidélité : `docs/maquettes/mobile-pecheur.md`, `docs/maquettes/web-dashboard.md`
- ADR-001 (Expo, Proposé) et ADR-002 (MapLibre, Proposé)
- Tests : health + import modèles/contrats (3 passed)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 1 : schéma Alembic, contrats API avant code métier, maquettes, décision mobile
- §4 / §6 / §7 : modèle de données, conventions API, journal d'accès
- §3.1 sobriété : pas de routes métier encore (Phase 2 / M1)

**Technologies / principes utilisés :**
- SQLAlchemy 2 + GeoAlchemy2 (Point/Polygon SRID 4326), Alembic + psycopg
- Pydantic v2 (contrats), UUID comme clés (préparation sync offline M4)
- Filtre Alembic pour ignorer tables système PostGIS/Tiger à l'autogenerate

**Tests réalisés :**
- `alembic upgrade head` : OK (tables métier créées)
- `pytest` : 3 passed
- `ruff` / `black` : OK

**Points ouverts / dette technique :**
- **Validation humaine obligatoire** avant Phase 2 (ADR-001/002, maquettes, liste d'espèces)
- `Organisation` non détaillée au §4 — table minimale `id, nom, date_creation` ajoutée pour la FK
- `NiveauGravite` (`info|attention|critique`) et `ESPECES_MVP` inventés provisoirement — à confirmer
- Auth JWT / hash argon2 : dès le premier endpoint M1
- Index spatiaux créés automatiquement par GeoAlchemy2 (pas de doublon dans la migration)
---

## [2026-07-27] — Phase 1 clôturée + Module M1 : pêcheurs & embarcations

**Ce qui a été construit :**
- Validation humaine Phase 1 : ADR-001 Expo, ADR-002 MapLibre, maquettes, espèces et gravités — **Acceptés**
- ADR-003 : Organisation / société extensible (colonnes stables + `attributs` JSONB)
- Migration `b7e4a1c90211_organisations_robustes_m1`
- Auth JWT + argon2 (`/api/v1/auth/login`, `/me`) + `require_role` sur routes M1
- CRUD organisations, pêcheurs (licence obligatoire), embarcations + recherche `GET /pecheurs?q=`
- App Expo (agent) : login, création pêcheur+embarcation, recherche
- Seed agent fictif : `python scripts/seed_agent.py` (`agent@example.com`)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 1 validation + démarrage Phase 2
- §5.1 acceptation : créer pêcheur + embarcation et retrouver par nom/licence
- §6 / §7 : rôles sur endpoints, hash mots de passe dès le premier endpoint métier
- Demande porteur : organisation extensible sans recréer le schéma (ADR-003)

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy async, Alembic, argon2-cffi, PyJWT, Expo (blank-typescript)
- Erreurs API `{detail, code}` via handler `ApiError`

**Tests réalisés :**
- `pytest` : 6 passed (health, contrats Phase 1, acceptation M1 §5.1, auth 401)
- `ruff` / `black` : OK
- `tsc --noEmit` (mobile) : OK

**Points ouverts / dette technique :**
- Token mobile en mémoire (SecureStore à brancher)
- CI GitHub pas encore exécutée sur dépôt distant
- Parcours pêcheur (hors agent) et offline : M4
- Revue `module-verifier` / `security-auditor` recommandée avant M2

---

## [2026-07-27] — Module M2 : géolocalisation & suivi GPS

**Ce qui a été construit :**
- API positions : `POST /positions`, `POST /positions/batch`, `GET /positions/trajectory` (ordre chrono), filtre période, `GET /geoloc/config` (`gps_interval_minutes`)
- Filtrage d’accès par rôle (pêcheur = ses embarcations ; agent/autorité/admin/chercheur = plus large)
- Tests §5.2 : trajectoire 10 points GPS chronologiques (même si batch désordonné)
- Mobile Expo : écran « Suivi GPS » (permission + envoi périodique + historique)
- Web MapLibre : page trajectoire (filtre embarcation) — ADR-002
- CORS API pour le portail local

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2 envoi périodique paramétrable, historique carte, acceptation 10 points chrono
- §3.2 / ADR-002 MapLibre ; point d’extension `source=balise` déjà au schéma
- §7 filtrage géoloc par rôle

**Technologies / principes utilisés :**
- PostGIS `ST_AsGeoJSON` + WKT Point 4326, FastAPI, Expo Location, MapLibre GL JS, Vite React

**Tests réalisés :**
- `pytest` : 10 passed (régression M1 + M2)
- `tsc` mobile : OK

**Points ouverts / dette technique :**
- Style tuiles démo MapLibre (remplacer en staging)
- Intervalle GPS en minutes entières (pas de sous-minute en MVP)
- Carte native mobile non embarquée (historique liste + carte web autorités)

---

## [2026-07-27] — M2 (complément) : données open source Gabon

**Ce qui a été construit :**
- Jeux open data sous `data/open-data/gabon/` : ZEE Marine Regions, fleuves OSM, `water_mask.geojson`, corridors `demo_routes_opendata.json`
- `gabon_routes.py` charge le masque réel (plus de polygones inventés) ; script `fetch_gabon_opendata.py` (+ sync web/mobile)
- Attribution / licences : `SOURCES.md` ; décision **ADR-004**
- Dépendance `shapely` pour construction du masque

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Réalisme terrain §5.2 / préparation M3 ; données publiques (pas de secrets, pas de PII)

**Technologies / principes utilisés :**
- Marine Regions EEZ v12 (CC-BY-4.0), OpenStreetMap Overpass (ODbL 1.0), Shapely, GeoJSON

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 11 passed
- `tsc --noEmit` web + mobile : OK

**Points ouverts / dette technique :**
- Overlay EEZ/fleuves sur la carte web (optionnel)
- Enrichir le masque avec polygones `natural=water` si Overpass/miroir stable
- Relancer `seed_maritime_scenarios.py` après redémarrage API pour revoir les trajets

---

## [2026-07-27] — Gate M2 → M3 : revue experts + démarrage M3

**Ce qui a été construit :**
- Revue trajectoires (maritime) : **SATISFAIT** — 13/13 corridors en eau, rejet GPS ville/simulateur OK, Go M3
- Revue pêche artisanale (halieutique) : **RÉSERVES** non bloquantes — Go M3
- Démarrage module **M3** (zones réglementées) : STATUS mis à jour, branche suggérée `feature/m3-zones`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Discipline de phase : ne pas avancer sans validation métier / trajectoire
- §5.3 / §9 : prochain sous-jalon Phase 2

**Technologies / principes utilisés :**
- Sous-agents `maritime-trajectory` + `fisheries-halieutique` ; ADR-004 comme référentiel masque eau

**Tests réalisés :**
- Revue manuelle experts (pas de nouveau run pytest dans cette entrée)

**Points ouverts / dette technique :**
- ~~**Ogooué** : labels / tronçon OSM trop à l’est (près Franceville) au lieu de Lambaréné / embouchure — corriger `_longest_named` / échantillonnage ouest~~ → corrigé (fenêtre lon 8.9–11.3 + Cap Lopez dans UI)
- ~~Exposer `rade_port_gentil` (Cap Lopez) dans le picker mobile/web (`UI_IDS`)~~ → fait
- Buffer fluvial ~4 km un peu permissif en ville berge (MVP acceptable)

---

## [2026-07-27] — Correctif Ogooué / Cap Lopez (dette M2)

**Ce qui a été construit :**
- Sélection Ogooué par fenêtre de longitude (aval Lambaréné ~9–10.3°E, intérieur ~10–11°E) au lieu du plus long segment amont
- Labels UI alignés ; `rade_port_gentil` ajouté au picker mobile/web
- Regen `--offline` des corridors + sync TS

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Réalisme trajectoires §5.2 / revue halieutique avant M3

**Technologies / principes utilisés :**
- Script `fetch_gabon_opendata.py`, OSM Ogooué, Shapely

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 11 passed

**Points ouverts / dette technique :**
- Buffer fluvial ~4 km (MVP)

---

## [2026-07-28] — Correctif UX : carte zones M3 + CRUD licences M1 (web)

**Ce qui a été construit :**
- Page Zones refondue (`web/src/pages/ZonesPage.tsx`) : layout carte MapLibre, polygones colorés par type, création bbox, PATCH actif, clic → détection
- Overlay optionnel « Afficher zones » sur la carte trajectoires
- Page Licences (`web/src/pages/LicencesPage.tsx`) : recherche, création pêcheur+licence, embarcation, dossier/trajectoires (écart §5.1)
- API client enrichi (`list/create/update/delete` pêcheurs, embarcations, create/patch zones)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 : zones exploitables pour autorités/agents (pas seulement liste + textarea)
- §5.1 : création pêcheur + embarcation via l’interface en moins de 2 min

**Technologies / principes utilisés :**
- React/TS, MapLibre GL (ADR-002), styles existants

**Tests réalisés :**
- `pytest app/tests/test_m1_pecheurs.py app/tests/test_m3_zones.py -q` : OK
- `npx tsc --noEmit` dans `web/` : OK

**Points ouverts / dette technique :**
- Pas d’éditeur graphique de polygones (bbox + GeoJSON secondaire suffisent MVP)
- M4 non démarré

---

## [2026-07-28] — UX zones : dessin carte, libellés, superpositions

**Ce qui a été construit :**
- Modes **Voir / Dessiner / Tester** (plus de saisie minLon/maxLat en premier)
- Dessin rectangle en 2 clics + aperçu ; libellés sur carte ; pastilles décalées si zones superposées
- Badge « superposée », centrage liste→carte, popup au clic polygone
- Filtre « actives seulement »

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur : anomalies d’affichage (zones empilées invisibles), prise en main difficile

**Technologies / principes utilisés :**
- MapLibre symbol/fill, React modes UX

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Éditeur polygone libre (N points) hors MVP
- M4 non démarré

---

## [2026-07-28] — Zones ciblées : purge + 3 presets métier

**Ce qui a été construit :**
- `seed_zones_demo.py --reset` : purge test/démo, recrée Mondah (sensible), Cap Lopez (interdite), Lambaréné/Ogooué (protégée) — secteurs séparés
- UI : rappel règle métier, chips presets, « Charger 3 presets », « Purger doublons », refus bbox ≥ ~90 km

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 / zone pilote : polygones ciblés, pas pavage côte + intérieur

**Technologies / principes utilisés :**
- PostGIS zones, MapLibre presets UX

**Tests réalisés :**
- Script `--reset` : 6 purge / 3 créées ; `tsc` web OK

**Points ouverts / dette technique :**
- Validation « sur eau » à la création (optionnel)
- ~~M4 non démarré~~ → démarré (entrée suivante)

---

## [2026-07-28] — Démarrage M4 + rehausse design portail

**Ce qui a été construit :**
- Démarrage module **M4** (déclarations captures, offline-first) — branche `feature/m4-captures`
- Lancement polish UX/UI portail web (login brand-first, tokens, accueil, chrome) en parallèle du build M4

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.4 / §9 : prochain sous-jalon Phase 2
- Retour porteur : plateforme à réhausser avant d’enchaîner

**Technologies / principes utilisés :**
- start-module ; web-dashboard (design) ; module-builder + mobile-offline (M4)

**Tests réalisés :**
- Non encore (démarrage)

**Points ouverts / dette technique :**
- Liste fermée d’espèces à confirmer si absente du cahier (question métier si besoin)
- Sync idempotente mobile ↔ API

---

## [2026-07-28] — Rehausse design portail web

**Ce qui a été construit :**
- Tokens océan (Fraunces + Sora), login brand-first, accueil rail M1–M4, nav pill, sidebars/empty states
- Motion légère (`rise-in`, hover) avec `prefers-reduced-motion`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur UX/UI avant / pendant M4

**Technologies / principes utilisés :**
- CSS tokens, React (pas de lib UI lourde)

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Appliquer la même langue visuelle au mobile M4

---

## [2026-07-28] — Module M4 : Déclaration & suivi des captures

**Ce qui a été construit :**
- API `/api/v1/captures` (catalog, CRUD, `POST /sync` idempotent via id client)
- Mobile offline-first : SQLite `pending`/`synced`, `CapturesScreen`, badges sync
- Portail web : page lecture Captures
- README module + contrats API

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.4 formulaire + offline + sync sans doublon/perte
- §4 entité Capture ; §9 sous-jalon M4

**Technologies / principes utilisés :**
- FastAPI, PostGIS Point optionnel, Expo SQLite, sync batch

**Tests réalisés :**
- `pytest` M1–M4 + phase1 + health : **30 passed** (dont sync idempotente §5.4)
- module-verifier : **PASS**
- `tsc` mobile + web : OK (annoncé builder)

**Points ouverts / dette technique :**
- Listes espèces/méthodes MVP à valider zone pilote
- Pas de suite Jest mobile (preuve sync côté API)

---

## [2026-07-28] — Gate multi-experts M1–M4 + correctifs

**Ce qui a été construit :**
- Revues : sécu, mobile-offline, halieutique, maritime, design — synthèse **Go M5** (réserves)
- Sécu Haute : anti-IDOR captures, dossier licence filtré pêcheur, DELETE GPS restreint + tests
- CRUD captures web (POST/PATCH/DELETE) pour agents/autorités
- Cache SQLite embarcations mobile (déclaration offline à froid)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §7 filtrage rôles ; §5.4 offline-first terrain ; validation croisée avant M5

**Technologies / principes utilisés :**
- Sous-agents projet ; pytest anti-IDOR ; Expo SQLite cache

**Tests réalisés :**
- `test_security_gate_m1_m4.py` + M2/M4 : verts
- M4 captures (incl. patch/delete) : verts (builder CRUD)

**Points ouverts / dette technique :**
- Valider liste espèces (eau douce Ogooué) avant quotas pilote
- LogAcces, CORS origins, JWT secret non-dev (Moyennes sécu)
- Sync captures encore manuelle ; labels espèces UX
- Buffer fluvial ~4 km

---

## [2026-07-28] — UX landing + illustrations + listes compactes

**Ce qui a été construit :**
- Landing publique (hero Gabon, mockup mobile/web, grille modules illustrés + connexion)
- Icônes modules M1–M4 sur accueil web, nav, en-têtes de pages ; mêmes assets sur accueil mobile
- `CompactList` (« Voir plus ») sur trajectoires, licences, zones, captures, dossier

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur : listes trop longues, manque d’illustrations / page d’accueil produit

**Technologies / principes utilisés :**
- Assets `web/public/illustrations` + `mobile/assets/illustrations` ; CSS landing ; React CompactList

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Compresser / retailler les PNG icônes (~1 Mo) pour perf mobile
- Landing encore côté SPA (pas de route marketing séparée)

---

## [2026-07-28] — Module M5 : Gestion des quotas

**Ce qui a été construit :**
- API `/api/v1/quotas` (CRUD, `GET /alertes`) ; recalcul `volume_consomme_kg` à chaque capture
- Alertes `depassement_quota` à 90 % / 100 % avec `declencheur` JSON obligatoire
- Portail `QuotasPage` (barres de progression, listes compactes, alertes)
- Fond hero local + polish glass (web) ; ImageBackground mobile
- Icône M5 ; contrats API + README module

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.5 seuils espèce/zone/période, consommation auto, alerte 90 %
- §4 entités Quota + Alerte

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy async, PostGIS `ST_Intersects` (quota zoné), React QuotasPage

**Tests réalisés :**
- `pytest` M1–M5 + sécu + health : **37 passed** (dont acceptation §5.5)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Liste alertes sur page Quotas (M6 dashboard complet plus tard)
- Quota zoné exige position_capture sur la capture

---

## [2026-07-28] — Module M6 : Tableau de bord de pilotage

**Ce qui a été construit :**
- API `GET /api/v1/dashboard` (période) : pêcheurs actifs, volume exact, répartition espèces, alertes nouvelles, zones à forte activité (`ST_Intersects`)
- Portail `DashboardPage` : KPI, barres espèces, alertes, carte MapLibre des foyers
- Design Gabon/Afrique : accents okoumé, motif tressage, copy autorités / Estuaire
- Icône Pilotage ; contrats + README

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.6 indicateurs minimums + acceptation chiffres exacts
- Utilisateurs cibles : autorités et agents (Gabon)

**Technologies / principes utilisés :**
- FastAPI agrégats SQL exacts, MapLibre, CSS tokens okoumé/earth

**Tests réalisés :**
- `pytest` suite : **42 passed** (dont 3 M6 §5.6)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Foyers d’activité = zones réglementées intersectées (pas grille hex libre)
- M7 alertes règles restantes (intrusion auto, tendance 7j)

---

## [2026-07-28] — Module M7 : Alertes intelligentes + shell command-center

**Ce qui a été construit :**
- Règles auto : zone interdite (`ST_Intersects`), dépassement quota (M5), tendance 7j > 2× moyenne hist.
- API `GET/PATCH /api/v1/alertes` ; hooks positions + captures ; `declencheur` obligatoire
- Page Alertes (traiter / ignorer)
- Design réf. command-center : rail icônes desktop, bottom nav mobile, accents or / glass

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.7 trois règles explicites (positif + négatif) ; fin Phase 2 MVP modules

**Technologies / principes utilisés :**
- FastAPI, PostGIS, React rail CSS, Expo BottomNav glass

**Tests réalisés :**
- `pytest` suite : verts (dont 3 M7 §5.7)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Anti-doublon alertes 12 h (fingerprint)
- Dashboard map-first plein écran encore perfectible (panels flottants)

---

## [2026-07-27] — Module M3 : Cartographie des zones réglementées

**Ce qui a été construit :**
- Modèle `ZoneReglementee` + index GIST Alembic ; module `backend/app/modules/zones/`
- API CRUD `/api/v1/zones`, import GeoJSON, détection `POST .../detect/intersection` via PostGIS `ST_Intersects`
- UI web « Zones réglementées » (liste, import, test lon/lat)
- Seed démo fictif Estuaire / Cap Lopez ; contrats dans `docs/api-contracts.md`
- README module

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 polygones + intersection PostGIS ; préparation intrusion zone → M7
- §4 entité ZoneReglementee ; §9 sous-jalon M3

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy 2 async, GeoAlchemy2, PostGIS `ST_Intersects`, React/TS (admin simple)

**Tests réalisés :**
- `pytest` M1+M2+M3+phase1+health : **23 passed** (dont 6 M3 inside/outside §5.3)
- module-verifier : **PASS**

**Points ouverts / dette technique :**
- Pas d’éditeur graphique de polygones (import GeoJSON suffisant §5.3)
- Alertes / `declencheur` réservés à M7
- Filtre période début/fin appliqué après intersection géométrique


## [2026-07-30] — Front office : landing + demandes de licence

**Ce qui a été construit :**
- Landing FO redesignée : hero carousel (3 slides), typo display, fond maritime, structure claire (outils / demande / modules / connexion)
- Formulaire public demande de licence (personne physique ou morale) → `POST /api/v1/demandes-licence`
- Back-office : pages Demandes (liste, approuver, refuser, supprimer) et Organisations (CRUD personnes morales)
- Migration `demandes_licence` ; rail portail « Demandes » / « Organis. »

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Extension M1 (§5.1) : entrée FO pour inscription pêcheurs / orgs avant attribution licence
- Portail autorités (§5.6) : traitement des dossiers côté agents

**Technologies / principes utilisés :**
- FastAPI public + JWT staff ; React landing glass ; CSS FO dédié

**Tests réalisés :**
- `pytest app/tests/test_demandes_licence.py` : **4 passed**
- `tsc` web : OK
- Alembic `upgrade head` : OK (`d4b8e3f91233`)

**Points ouverts / dette technique :**
- Approbation org + pêcheur : commits séparés (risque org orpheline si échec pêcheur)
- Pas de suivi public du statut de demande (n° de dossier)
- Captcha / rate-limit sur POST public à prévoir en Phase 3

## [2026-07-30] — Charte logo, wizard modal & justificatifs

**Ce qui a été construit :**
- Logo CBM-PIGAP intégré (header FO + portail) ; tokens charte marine / bleu / sage
- Demande licence en **wizard modal** (5 étapes) ; connexion autorités en modale
- Upload justificatifs (PDF/JPG/PNG, max 5×5 Mo) via `POST /demandes-licence/with-files`
- BO : téléchargement des pièces jointes sur la fiche demande

**Pourquoi (lien avec le cahier des charges / ce document) :**
- UX FO accessible (§ utilisateurs non experts) ; extension M1 inscription

**Technologies / principes utilisés :**
- Multipart FastAPI, stockage local `uploads/`, JSONB `pieces_jointes`

**Tests réalisés :**
- `pytest app/tests/test_demandes_licence.py` : 4 passed
- `tsc` web : OK

**Points ouverts / dette technique :**
- Stockage local (pas S3) ; antivirus / rate-limit Phase 3

## [2026-07-30] — Notifications temps réel portail

**Ce qui a été construit :**
- API `GET /notifications/summary` + `GET /notifications/stream` (SSE)
- Hub in-process poussé à chaque nouvelle demande / alerte
- Cloche header + badges rail Demandes / Alertes ; pulse sur items en attente
- Correctif FO 404 : `VITE_API_URL` local vide (proxy Vite → :8000) au lieu de Railway obsolète

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Pilotage autorités (§5.6 / §5.7) — file d’attente visible sans rafraîchir

**Technologies / principes utilisés :**
- SSE + poll 12 s de secours ; badges sage charte

**Tests réalisés :**
- `pytest` notifications + demandes : **5 passed**
- `tsc` web : OK

**Points ouverts / dette technique :**
- Hub mono-process (pas Redis) — suffisant MVP / un worker uvicorn

## [2026-07-30] — Messages clairs + notifs + gate experts déploiement

**Ce qui a été construit :**
- Erreurs API FR (backend validation + parseApiError web/mobile) — plus de JSON brut
- Toasts opérations web ; badges notifications exacts ; purge alertes/demandes démo
- FO wizard licence + pièces ; MIME upload durci (type ET extension)
- Mobile : validation MDP 8 car. + messages clairs tous écrans

**Pourquoi :**
- UX non experts (§ utilisateurs) ; préparation publication Phase 3

**Tests réalisés :**
- `pytest` suite : **58 passed**
- Gate experts : Sécurité / Mobile / Web = **GO réserves** (majorité)

**Points ouverts :**
- JWT_SECRET + rate-limit + CORS prod (ops)

## [2026-07-30] — Publication & déploiement

**Ce qui a été construit :**
- Push `main` (`8587241`) sur GitHub
- Web prod Vercel : https://cbm-pigap-web.vercel.app
- API prod Railway redeploy SUCCESS : https://cbm-pigap-production.up.railway.app (`/health` ok ; erreurs validation en string FR)

**Pourquoi :**
- Gate experts majorité GO réserves → publication autorisée

**Tests réalisés :**
- Smoke prod : `/health` ok ; `VALIDATION_ERROR` FR sur login / demandes-licence
- Suite locale antérieure : **58 passed**

**Points ouverts :**
- Renforcer JWT_SECRET, rate-limit POST public, CORS (réserves sécu)

## [2026-09-09] — Refonte UI/UX maquettes + neuroscience

**Ce qui a été construit :**
- Design system FO/BO (tokens navy/primary, sidebar, topbar, KPI, status, hubs)
- Landing FO fidèle maquette (hero, services ×6, mission, chiffres démo, footer)
- Shell BO : IA stricte (Acteurs / Navires / Pêches / Surveillance / Alertes / Rapports / Cartographie / Admin)
- Dashboard dense (KPI, carte, secteurs, alertes, raccourcis, table)
- Hubs Acteurs & Pêches ; Rapports stub KPIs ; Surveillance = carte + zones

**Pourquoi :**
- Alignement maquettes produit + charge cognitive réduite (hiérarchie alertes → carte → KPI)

**Tests réalisés :**
- `npx tsc --noEmit` (web) : OK
- Maritime (routing carte) : **GO** — pas de régression trajectoires à terre

**Points ouverts :**
- Chiffres FO = placeholders démo (pas d’API publique stats)
- Export CSV rapports Phase 3
- Harmoniser titres internes des pages métier (doubles stage-head dans hubs)

---

## [2026-09-09] — Circulation near-live (côte + fleuves)

**Ce qui a été construit :**
- API `GET /api/v1/positions/live` : dernière position par embarcation (eau only, secteur côte/bras/fleuve, statut actif/recent/silence)
- Portail : polling 20 s sur Navires/Surveillance + carte dashboard « temps réel »
- Semis : ping live en fin de corridor ; script `simulate_live_fleet.py` pour avancer la flotte

**Pourquoi :**
- Avant : trajectoires historiques chargées à la demande, pas de vue flotte en circulation
- MVP réaliste sans AIS/IoT (§ hors périmètre) : GPS mobile + corridors open data

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 12 passed
- `tsc --noEmit` (web) : OK

**Points ouverts :**
- Pas de WebSocket positions (polling volontaire)
- AIS / balises = point d’extension `source=balise` seulement

---

## [2026-09-09] — Couche AIS ZEE Gabon (open data)

**Ce qui a été construit :**
- Module `ais_gabon` : poll Open Waters + filtre polygone ZEE Marine Regions
- API `GET /api/v1/ais/live` (rôles autorités) · marqueurs distincts sur Navires
- `AIS_DEMO_WHEN_EMPTY` si flux réel vide (couverture AIS faible au Gabon)
- ADR-005

**Pourquoi :**
- Demande : agréger des données open temps réel limitées au Gabon, sans confondre avec GPS pêcheurs

**Tests réalisés :**
- `pytest` AIS + M2 : 16 passed
- `tsc` web : OK

**Points ouverts :**
- Densifier via AISStream (clé) ou partenariat GFW/CLS
- Pas d’AIS sur pirogues / fleuves (limite physique du signal)

---

## [2026-09-10] — AIS réel : AISStream + snapshot

**Ce qui a été construit :**
- Ingest AISStream (WebSocket) + Open Waters WS/REST, filtre ZEE, snapshot disque
- `AIS_DEMO_WHEN_EMPTY=false` par défaut ; CTA UI si 0 navire
- Script `collect_ais_gabon.py` ; semis GPS live rafraîchi

**Pourquoi :**
- Open Waters REST renvoie 0 sur le Gabon ; besoin d’une source live réelle (clé gratuite AISStream)

**Tests réalisés :**
- `pytest app/tests/test_ais_gabon.py` : 5 passed

**Points ouverts :**
- Christian doit créer `AISSTREAM_API_KEY` sur aisstream.io

---

## [2026-09-10] — Graphiques KPI + moteur de prédiction (ADR-006)

**Ce qui a été construit :**
- `GET /api/v1/dashboard/series` : volumes / espèces / alertes par jour, semaine ou mois (somme = dashboard)
- Module `predictions` : sklearn Ridge / Poisson, horizon 7 ou 30 j — pêches, pénuries, intrusions, zones d’incidents
- Portail : Recharts sur le tableau de bord et page Rapports (saisons sèche / pluies, carte des risques)
- Seed `scripts/seed_series_saisonnieres.py` : 12 mois fictifs + graphe d’intrusions + baisse sardine
- ADR-006 (écart cahier §2.2, prédictions consultatives, pas d’alerte M7 auto)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.6 : indicateurs exacts, désormais aussi en série temporelle
- §2.2 / §5.7 : le ML stocks restait hors MVP ; itération post-MVP actée (ADR-006)

**Technologies / principes utilisés :**
- PostgreSQL `date_trunc`, sklearn Ridge + PoissonRegressor, Recharts, `justification` analogue à `declencheur`

**Tests réalisés :**
- `pytest app/tests/test_dashboard_series.py app/tests/test_predictions.py` : 6 passed
- Régression M1–M7 (dont M2 live, M6, M7) : OK
- `tsc --noEmit` (web) : OK
- Page Rapports : documents PDF/CSV conservés + graphiques saisonniers

**Points ouverts / dette technique :**
- Courbes saisonnières du seed **fictives** — à valider expert halieutique
- Calendrier juin–septembre / octobre–mai : labels d’affichage seulement
- Pas d’export CSV ; pas de prévision AIS (pas d’historique)


---

## [2026-09-10] — Documents officiels (licence, fiche, bilan, rapport)

**Ce qui a été construit :**
- Module `documents` : PDF A4 (bandeau Gabon) pour licence de pêche, fiche d’enregistrement (pêcheur ou demande FO), bilan d’activité, rapport de pilotage
- Export CSV du rapport (dette « export Phase 3 »)
- Portail : page Rapports (4 cartes) ; boutons PDF sur Acteurs → Licences et Demandes
- Journal d’accès `LogAcces` à chaque export

**Pourquoi (lien avec le cahier des charges / ce document) :**
- M1 §5.1 : licence associée au pêcheur — pièce imprimable pour l’agent
- M6 §5.6 : indicateurs exacts du tableau de bord dans un rapport périodique
- §7 : traçabilité des consultations de données nominatives
- Pas un 8ᵉ module métier : génération à partir des données déjà en base

**Technologies / principes utilisés :**
- ReportLab (PDF) ; CSV UTF-8 BOM pour tableur
- Rôles identiques au registre (licence/fiche) et au dashboard (bilan/rapport)
- Période par défaut = 31 jours si non précisée (évite un export de tout l’historique)

**Tests réalisés :**
- `pytest app/tests/test_documents.py` : 5 passed
- Régression M1 / M6 / demandes : 15 passed (avec documents)
- `tsc` : erreurs préexistantes `TrendCharts` / recharts (hors périmètre)

**Points ouverts / dette technique :**
- Les PDF ne sont pas des actes ministériels : mention « usage officiel soumis à validation »
- Modèle graphique à caler avec Kimba Connect (cachet, QR, photo)
- Si l’API locale ne répond plus : relancer `uvicorn` (un export trop large peut bloquer le worker unique)

---

## [2026-10-02] — Mobile : écrans allégés, parcours par étapes, repères visuels

**Ce qui a été construit :**
- Bibliothèque `mobile/src/components/ui/` : `ScreenHeader`, `Segmented`, `StepBar`, `Chip`, `ListRow`, `StatTile`, `Notice`, `IconBadge`, `SectionTitle`, `ActionTile`, `AppIcon` (Ionicons, Material Community, FontAwesome 6 via préfixes `mci:` et `fa6:`)
- Captures : parcours en 4 étapes (bateau, espèce, engin, détails), un choix fait avance l'étape ; espèces regroupées par famille avec icône ; onglet Historique séparé (3 chiffres clés, bouton d'envoi, une ligne par déclaration)
- Suivi GPS : bateaux en pastilles, carte sans légende technique, tuiles points / dernier envoi / en attente, relevés compacts (5 visibles, « voir tout »), démo repliée
- Accueils pêcheur et agent : grille de tuiles 2 colonnes, textes d'accroche réduits à une ligne, avis de mer en pastilles chiffrées
- Recherche licence : chiffres clés du dossier, statut en pastille, panneau de recherche masqué quand un dossier est ouvert
- Nouveau dossier : 2 étapes (pêcheur, embarcation), équipements avec icônes
- Abonnement et Redevances : en-tête unique, formules en cartes, récapitulatif total, lignes de quittances avec statut
- `tones` dans `theme.ts` (info, ok, warn, error, muted) pour tous les messages et badges

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §10 : public terrain peu digital, écrans utilisés au soleil ; moins de texte, plus de repères visuels, moins de défilement
- Retour porteur du 2026-10-02 : écrans trop chargés, trop de texte, éléments sans icône

**Technologies / principes utilisés :**
- Aucune dépendance ajoutée : `@expo/vector-icons` déjà présent fournit les trois jeux d'icônes
- Logique métier et appels API inchangés ; seule la présentation évolue
- Note constante `note_infractions` de l'API (cadre M2/M7) non affichée sur mobile : texte technique sans valeur pour l'agent

**Tests réalisés :**
- `tsc --noEmit` (mobile) : OK
- Vérification visuelle sur simulateur iPhone 16 Pro, Expo Go SDK 57, API Railway : accueil agent, captures (4 étapes + historique), GPS (sans et avec parcours), licences (liste et dossier), nouveau dossier, accueil pêcheur, abonnement, redevances
- Enregistrement local d'une déclaration de test (non envoyée au serveur)

**Points ouverts / dette technique :**
- Pas de tests Jest mobile (réserve déjà connue)
- `note_infractions` : l'API renvoie une phrase constante ; à remplacer par une note réelle par dossier ou à supprimer côté backend
- Le bouton flottant de développement d'Expo Go recouvre le coin supérieur droit en mode dev uniquement


---

## [2026-10-02] — Numéro Mobile Money du pêcheur, écran de bienvenue, APK Android

**Ce qui a été construit :**
- `PATCH /api/v1/auth/me/telephone` : le pêcheur connecté met à jour son numéro Mobile Money ; normalisation gabonaise (`+241…`), unicité entre comptes, rôle pêcheur uniquement (403 sinon)
- Mobile, écran Abonnement : champ téléphone saisissable, bouton « Enregistrer ce numéro », paiement bloqué tant que le numéro saisi n'est pas enregistré
- Mobile, écran de bienvenue à la première ouverture : trois volets (déclarer, naviguer, régler), numéro en filigrane, barre de progression segmentée, « Passer » ; mémorisé dans SQLite (`app_settings`)
- APK Android : identifiant `com.kimbaconnect.cbmpigap`, `expo prebuild` + `gradlew assembleRelease` (JDK 17 ; les JDK 24 et 25 font échouer l'étape CMake), API de production lue dans `mobile/.env` ; APK produit le 2026-10-02 (`mobile/dist/CBM-PIGAP-0.1.0.apk`, hors git, 95 Mo, URL de production vérifiée dans le bundle) ; procédure dans `mobile/README.md`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Paiement depuis le numéro de l'acteur (journal 2026-10-01) : le pêcheur doit pouvoir corriger ce numéro sans passer par un agent
- §10 : première prise en main par un public peu digital ; l'écran de bienvenue explique l'application en trois promesses
- Phase 3 : installation directe sur les téléphones de la zone pilote

**Technologies / principes utilisés :**
- Réutilisation de `normalize_gabon_msisdn` (module abonnements) ; aucun nouveau modèle ni migration
- Génération native continue : `android/` reste hors git, régénéré à chaque build

**Tests réalisés :**
- `pytest app/tests/test_paiement_msisdn.py app/tests/test_phase1_contracts.py` : 8 passed (2 nouveaux)
- Régression backend complète : 99 passed, 1 failed (`test_m6_dashboard::test_dashboard_alertes_actives_et_zone_activite`) ; échec identique sur le commit précédent sans ces changements : le tableau de bord limite `alertes_actives` à 50 et la base de développement partagée a accumulé des alertes de tests. Dette d'environnement, pas de régression
- `tsc --noEmit` (mobile) : OK
- Simulateur : lecture du réglage de bienvenue vérifiée (journal Metro), écran Abonnement avec saisie du numéro

**Points ouverts / dette technique :**
- L'API de production doit être redéployée (push `main` → Railway) pour que la modification du numéro fonctionne depuis l'APK
- APK signé avec la clé de débogage : prévoir une clé de signature propre avant publication
- Carte Android sans clé Google Maps : fond vide ; clé à fournir par le client dans `app.json`
- Test M6 `alertes_actives` : purger la base de test ou filtrer les alertes par période pour rendre le test indépendant des données accumulées

---

## [2026-10-04] — Correctif Android : plantage de l'écran GPS sans clé Google Maps

**Ce qui a été construit :**
- Diagnostic sur émulateur Android (journal système) : `IllegalStateException: API key not found` à la création de la vue carte ; Google Maps exige une clé d'API dans le manifeste, et l'application se fermait à l'ouverture de l'onglet GPS
- `TrajectoryNativeMap` : sur Android sans clé (`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` absente au build), affichage du tracé schématique `TrajectoryMap` (SVG, sans fond de carte, aucun service externe) ; iOS inchangé (Apple Plans)
- `TrajectoryMap` repris dans le thème clair : départ, étapes et dernière position différenciés
- `app.config.js` : injecte la clé Google Maps dans le manifeste Android quand la variable est définie ; le fond de carte s'active alors sans autre changement
- APK 0.1.1 (`versionCode` 2) recompilé

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2 : le suivi GPS doit rester utilisable sur le terrain ; un plantage bloquant est inacceptable, le tracé schématique conserve l'information de parcours
- Aucune clé Google Maps n'est disponible côté client à ce jour ; l'application ne doit pas en dépendre

**Technologies / principes utilisés :**
- Variable publique Expo lue au build, même source pour le manifeste (`app.config.js`) et pour le garde-fou JavaScript
- Vérification par `adb logcat -b crash` et `pidof` après ouverture de l'écran GPS

**Tests réalisés :**
- Émulateur Android 16 (API 36.1) : APK initial, plantage reproduit ; APK corrigé, bienvenue, connexion et GPS sans exception, processus vivant
- `tsc --noEmit` (mobile) : OK

**Points ouverts / dette technique :**
- Fond de carte Android : fournir une clé Google Maps (`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` dans `mobile/.env`) puis relancer `expo prebuild` et la compilation
- L'émulateur de développement était presque plein (93 %) : désinstaller l'ancienne version avant d'installer un nouvel APK


---

## [2026-10-04] — Android : fond de carte par tuiles raster sur l'écran GPS

**Ce qui a été construit :**
- `TileTrajectoryMap` : fond de carte assemblé à partir de tuiles raster (images positionnées en projection Web Mercator), parcours superposé en SVG, marqueur navire sur la dernière position, zoom choisi pour contenir toute la sortie, attribution affichée
- Fournisseur par défaut : fond routier Esri (ArcGIS Online, sans clé). Constaté sur émulateur : openstreetmap.org renvoie 403 aux applications (politique d'usage) et CARTO sert un filigrane « API key required » ; URL et attribution configurables par variables de build
- Repli schématique seulement si toutes les tuiles échouent (une tuile manquante n'efface pas la carte)
- Hors réseau (échec de chargement d'une tuile) : repli sur le tracé schématique
- Utilisé sur Android sans clé Google Maps ; iOS conserve la carte native ; une clé Google réactive la carte native sur Android
- APK 0.1.2 (`versionCode` 3)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur du 2026-10-04 : le tracé schématique seul ne permet pas de situer la sortie ; §5.2 exige une lecture géographique réelle
- Aucune clé Google disponible ; OpenStreetMap ne demande ni clé ni SDK natif

**Technologies / principes utilisés :**
- Image RN par tuile, projection calculée dans l'application, aucun module natif supplémentaire
- Image RN par tuile, gabarit d'URL avec `{s}`, `{z}`, `{x}`, `{y}` ; conditions d'usage Esri à confirmer et fournisseur contractualisé à prévoir avant déploiement large

**Tests réalisés :**
- `tsc --noEmit` (mobile) : OK
- Émulateur Android 16, APK 0.1.2 : écran GPS avec fond Esri, parcours de démonstration situé au large de Port-Gentil, processus vivant, aucune exception

**Points ouverts / dette technique :**
- Pas de déplacement ni de zoom tactile sur ce fond de carte (vue cadrée automatiquement sur la sortie)
- Fournisseur de tuiles à contractualiser pour la Phase 3 élargie

---

## [2026-10-08] — Portail web : téléchargement de l'application Android depuis l'accueil

**Ce qui a été construit :**
- Section « Application mobile » sur la page d'accueil publique (`#application`) : présentation de l'application, bouton « Télécharger l'application », version, taille et version Android minimale, trois étapes d'installation (téléchargement, autorisation d'installation par le navigateur, installation et connexion)
- Accès depuis le menu d'en-tête, le menu mobile, le pied de page et un bouton secondaire dans le bandeau d'accueil
- APK 0.1.2 publié en pièce jointe de la version GitHub `v0.1.2-mobile` (dépôt public) sous le nom `CBM-PIGAP.apk` ; le bouton vise l'adresse « dernière version », qui suivra les publications futures sans modifier le portail ; adresse surchargeable par `VITE_APK_URL`
- Styles dans `web/src/styles/ui-kit.css` ; procédure de diffusion dans `mobile/README.md`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Demande porteur du 2026-10-08 : permettre aux utilisateurs d'installer l'application directement sur leur téléphone Android depuis la plateforme
- Hébergement hors du site et hors de git : l'APK (95 Mo) approche la limite de 100 Mo par fichier de GitHub et alourdirait chaque déploiement du portail

**Technologies / principes utilisés :**
- Lien de téléchargement direct (attribut `download`), aucun service tiers ajouté
- Android 7.0 minimum : `minSdk` 24 de React Native (`mobile/node_modules/react-native/gradle/libs.versions.toml`)

**Tests réalisés :**
- `npm run build` (web) : OK
- Rendu vérifié en largeur bureau et mobile (375 px), sans défilement horizontal
- `https://github.com/dbeyeme/cbm-pigap/releases/latest/download/CBM-PIGAP.apk` : HTTP 200, type `application/vnd.android.package-archive`, 95 145 940 octets (identique à `mobile/dist/CBM-PIGAP-0.1.2.apk`, SHA-256 `57a6c700…3ded3`)

**Points ouverts / dette technique :**
- APK toujours signé avec la clé de débogage : une clé de signature propre reste à prévoir avant diffusion large (une mise à jour signée avec une autre clé imposera de désinstaller l'ancienne version)
- Version et taille affichées sur l'accueil à mettre à jour à chaque nouvel APK

---

## [2026-11-24] Lot 0 : fond de carte sans clé, polices, comptes de démonstration (ADR-010)

**Ce qui a été construit :**
- Diagnostic de l'anomalie de carte signalée par le porteur : le fournisseur du fond et des noms de lieux exige une clé depuis le 25 septembre 2026 et couvre chaque tuile neuve de la mention « API KEY REQUIRED » ; le cache du navigateur masquait le défaut sur les postes déjà utilisés ; la police des étiquettes répondait 404 sur un serveur de démonstration
- `web/src/geo/mapStyle.ts` : fond vectoriel OpenStreetMap sans clé (eau et terre sous l'imagerie, noms de lieux au-dessus, en français), polices du même service exportées par `MAP_FONT_*`, adresse surchargeable par `VITE_MAP_TILES_URL` ; imagerie satellitaire inchangée
- `web/src/App.tsx` et `web/src/geo/zoneMap.ts` : les couches de texte utilisent `MAP_FONT_REGULAR`
- `web/scripts/verifier-fonds-carte.mjs`, lancé avant chaque construction (`npm test`, `prebuild`) : échoue si un hôte de tuiles interdit réapparaît, si une couche de texte n'a pas de police ou si une police est écrite en dur
- `web/src/pages/LandingPage.tsx` : le rappel des comptes de démonstration n'apparaît plus qu'en développement, ou avec `VITE_DEMO_ACCOUNTS=true` ; champ de saisie sans adresse d'administrateur suggérée
- `docs/adr/ADR-010-fonds-de-carte-sans-cle.md`, `docs/chantier-evolutions-2026-11.md` (cadrage des évolutions demandées le 2026-11-24, décisions du porteur, lots 0 à 5)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2, §5.3, §5.6 : les cartes du portail doivent rester lisibles pour tout utilisateur, pas seulement sur un poste dont le cache est rempli
- §3.2 : cartographie open source, sans dépendance payante ; l'ADR-002 laissait le fournisseur de tuiles à figer
- §7 : aucun identifiant affiché sur une page publique

**Technologies / principes utilisés :**
- MapLibre GL, source vectorielle unique au schéma OpenMapTiles, noms `name:fr` avec repli sur le nom latin
- Contrôle statique sans dépendance (Node), exécuté par le crochet `prebuild` de npm, donc aussi à chaque construction de l'hébergeur
- Variables de construction Vite ; le code mort des comptes de démonstration est éliminé du paquet de production

**Tests réalisés :**
- Garde-fou sur l'ancien code : échec attendu, 4 défauts signalés (2 hôtes interdits, 1 couche sans police, 1 police en dur) ; sur le nouveau code : réussite
- `tsc --noEmit` (web) : OK ; `npm run build` : OK
- Paquet de production : aucun mot de passe de démonstration ; seuls hôtes de carte présents : imagerie et service vectoriel
- Navigateur, instance locale, page Surveillance : polices en 200, aucune requête vers les deux hôtes retirés, aucune mention de clé sur une zone jamais mise en cache (Nigeria et Cameroun), libellés français ; rendu contrôlé à 1280, 768 et 375 px, sans défilement horizontal
- Sonde du flux AIS communautaire (2026-11-23, 23 h 30 UTC) : 10 navires en 15 s sur la Manche (témoin), 1 navire en 180 s sur tout le golfe de Guinée, aucun message dans les eaux gabonaises
- Tests backend : non exécutés (aucun fichier backend modifié)

**Points ouverts / dette technique :**
- Non commité, non déployé : fusion et mise en ligne reviennent au porteur
- Service de tuiles public sans garantie de disponibilité ; cible : copie hébergée par la plateforme (ADR-010)
- Imagerie satellitaire utilisée sans clé, conditions non confirmées ; même fond raster dans `TileTrajectoryMap` du mobile
- Comptes de démonstration : leurs mots de passe sont lisibles dans le dépôt public (`backend/scripts/seed_production_demo.py`, vérifié sans authentification) ; leur présence en ligne n'a pas été testée, la décision revient au porteur
- Le navire AIS affiché à Owendo provient d'une observation du 2026-09-20 rechargée depuis `ais_zee_snapshot.geojson`, sans indication d'âge : à traiter dans le lot 2
- Attribution de la carte sur quatre lignes à 375 px ; l'API locale réécrit le fichier suivi `ais_zee_snapshot.geojson` à chaque lancement

---

## [2026-11-24] Lot 0 bis : carte plein cadre, bannières et arrière-plans, affichage sur téléphone ; lecture de l'API Global Fishing Watch (ADR-011)

**Ce qui a été construit :**
- Carte plein cadre sur les pages Navires, Surveillance et Cartographie : la carte occupe toute la surface sous l'en-tête ; barre d'outils flottante (`MapToolbar`), panneaux à la demande (`MapPanel`) et passage en plein écran ; hauteur mesurée par `useMapStage` et non plus codée en dur
- Page Navires : l'ancienne colonne fixe est répartie en quatre panneaux (Couches, Navires, Mer, Ports), un seul ouvert à la fois, aucun à l'arrivée
- Cartes secondaires bornées : tableau de bord entre 380 et 520 px, rapports entre 300 et 420 px
- Images fournies par le porteur, rognées et allégées (`web/public/photos/`, 59 à 78 ko, variante de 800 px pour les téléphones) : arrière-plan d'ouverture de l'accueil, bandeau Services, bloc Application, bande de la fenêtre de connexion ; bannière `PageBanner` sur huit pages principales du portail
- Correctifs d'affichage sur téléphone : en-tête de l'accueil (page large de 761 px pour un écran de 375 px), en-tête du portail (titre tronqué, cloche superposée), 84 px vides sous chaque page
- Libellés du panneau des zones passés au vouvoiement et débarrassés du vocabulaire de développement ; icônes sur les trois onglets de mode
- `docs/adr/ADR-011-global-fishing-watch-source-differee.md` (statut Proposé) ; section 5.3 et plan de lots révisé dans `docs/chantier-evolutions-2026-11.md` ; `docs/LECONS.md`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2, §5.3, §5.6 : la carte est l'outil de travail des pages de suivi ; elle n'occupait que 60 % de l'écran
- Demandes du porteur du 2026-11-24 : carte presque en plein écran, images en arrière-plan et en bannières, portail adapté à toutes les largeurs, exploitation de la clé Global Fishing Watch
- §3.2 et §7 : aucune dépendance tierce n'entre en service sans conditions d'usage vérifiées

**Technologies / principes utilisés :**
- Mise en page par superposition (carte en fond, barre et panneaux au-dessus), API Fullscreen du navigateur, variables CSS posées par composant (`photoVars`, `--stage-top`)
- Standards du porteur appliqués quand ils s'y prêtent : icône et libellé sur chaque bouton, cibles tactiles de 44 px sur téléphone, pas de flou d'arrière-plan sur un conteneur d'infobulles, panneaux bornés à la hauteur de l'écran, vérification à 375, 768 et 1280 px, construction de production avant clôture
- Écart assumé : la section 11.4 des standards écarte la photographie décorative des outils de travail ; les bannières du portail répondent à la demande expresse du porteur, restent basses et sans animation, et tiennent en un composant retirable

**Tests réalisés :**
- `tsc --noEmit` (web) : OK ; `npm test` (garde-fou des fonds de carte) : OK ; `npm run build` : OK
- Navigateur, instance locale, 1280 × 800 px : carte de la page Navires passée de 842 × 734 px à 1202 × 725 px, sans défilement de page ; quatre panneaux ouverts et refermés ; carte du tableau de bord à 439 px
- 768 × 1024 px et 375 × 812 px : carte, panneau en bas d'écran, bannières, accueil ; aucune page plus large que l'écran
- Photographies servies en 200, 26 à 77 ko selon la variante
- Essai en lecture seule de l'API Global Fishing Watch sur la ZEE du Gabon (2026-08-01 au 2026-11-01) : 4 158 heures de pêche apparente, 10 navires, 1 110 détections radar ; jeton jamais affiché
- Non vérifiés à l'écran : bannière de l'espace organisation (aucun compte d'essai local de ce rôle), bouton « Plein écran » (non essayé dans le volet de prévisualisation)
- Tests backend : non exécutés (aucun fichier backend modifié)

**Points ouverts / dette technique :**
- Non commité, non déployé ; lots 0 et 0 bis dans le même arbre de travail (copie de l'état du lot 0 conservée pour deux commits distincts)
- Global Fishing Watch : usage non commercial seulement ; aucune intégration avant décision du porteur (ADR-011) ; la ligne ajoutée au fichier d'environnement porte un nom qu'aucun réglage ne lit
- Le portail n'a pas de tests d'interface rejouables : les correctifs d'affichage ne sont prouvés que par mesures et captures ; à installer au lot 1
- Images non intégrées à l'application mobile ; illustrations des embarcations, menu et formulaires à reprendre (lot 1)
- Règles de style de l'ancien panneau latéral et anciennes illustrations de 0,9 à 2,6 Mo restées dans le dépôt
- Les quatre images sont des captures de 1 384 px de large : un fichier d'origine plus grand donnerait un rendu plus net sur très grand écran

---

## [2026-11-25] Lot 1, première tranche : marqueurs, fiches, interaction avec la carte, recherche

**Ce qui a été construit :**
- Décisions du porteur consignées (commandes sans paiement en ligne, page de profil visible des comptes connectés et ouvrable au public par l'acteur, Global Fishing Watch à l'essai hors service, bannières conservées) ; lots sans conflit de fichiers lancés en parallèle : portail ici, mobile et serveur dans deux sessions déléguées
- `web/src/geo/vesselMarkers.ts` : nouveaux dessins des embarcations. Médaillon posé sur la position pour les pirogues et les navires de pêche suivis (pictogramme de profil, anneau d'état lisible sans la couleur) ; silhouette orientée pour les navires AIS (vecteur de vitesse, sillage, cercle en tirets à quai) ; médaillon chiffré pour les embarcations qui se chevauchent
- `web/src/geo/mapEffects.ts` : regroupement à l'écran recalculé à chaque fin de zoom ; liste des embarcations d'un même endroit ; aucune reconstruction des marqueurs quand les données n'ont pas changé
- `web/src/App.tsx` : la carte n'est plus recadrée à chaque rafraîchissement des positions ; centre utile décalé quand un panneau ou une fiche est ouvert ; session conservée le temps de l'onglet
- `web/src/components/Fiche.tsx`, `PirogueDetailDrawer.tsx`, `VesselDetailDrawer.tsx` : fiche synthétique (quatre chiffres clés, constats regroupés avec compteur, onglets, listes repliées, tableaux)
- `web/src/components/GlobalSearch.tsx` : recherche globale avec suggestions par catégorie (embarcations, navires AIS, pêcheurs, zones) et critères avancés ; une sélection ouvre la fiche, le registre ou la zone
- `web/src/components/MapLegend.tsx` : légende des marqueurs dans le panneau Couches
- `web/src/styles/ui-kit.css` : échelle d'empilement documentée ; mise en page de la carte selon la largeur réelle de la zone de carte (requêtes de conteneur)
- Numéro de licence annoncé comme automatique dans le formulaire de création (`LicencesPage.tsx`)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2 et §5.3 : la carte est l'outil de suivi ; elle doit rester lisible et stable pendant le travail de l'agent
- Demandes du porteur des 2026-11-24 et 25 : illustrations des embarcations, fiches synthétiques, interaction et empilement, tableaux préférés aux blocs, recherche avec suggestions, numéros de licence automatiques, aides contextuelles
- Standards du porteur, sections 9 et 11 : pas d'animation en boucle ni de transformation animée sur un marqueur, aucun long défilement, icône et libellé, échelle d'empilement documentée

**Technologies / principes utilisés :**
- SVG produits par le code, marqueurs HTML de MapLibre, regroupement glouton en coordonnées d'écran
- Requêtes de conteneur CSS : les surcouches de la carte réagissent à la largeur de la scène, pas à celle de la fenêtre
- `sessionStorage` pour le jeton, à défaut de jeton de renouvellement côté serveur ; jamais `localStorage`
- Recherche : listes chargées à l'ouverture et gardées une minute, registre interrogé côté serveur après une pause de saisie

**Tests réalisés :**
- `tsc --noEmit` : OK ; `npm test` (garde-fou des fonds de carte) : OK ; `npm run build` : OK
- Navigateur, instance locale : 51 embarcations d'essai regroupées en trois médaillons (28, 16, 7) ; liste d'un groupe ouverte au-dessus des marqueurs ; fiche ouverte depuis la liste et depuis la recherche ; scène étroite (673 px) et large (1202 px) ; session retrouvée après rechargement
- Recherche : « pir » renvoie 6 embarcations sur 51 ; critères affichés et alignés ; sélection menant à la fiche
- Non vérifiés à l'écran : médaillon isolé sur la carte (les données d'essai sont toutes regroupées ; dessin contrôlé dans la légende), sélection d'un pêcheur et d'une zone depuis la recherche, clavier dans la liste de suggestions, largeur de 375 px pour la fiche et la recherche
- Tests backend : non exécutés ici (lots serveur menés dans une session séparée)

**Points ouverts / dette technique :**
- Reste du lot 1 : aides contextuelles sur les pages, menu, formulaires, tableaux à la place des blocs, tests d'interface rejouables, passe complète à 375, 768 et 1280 px
- Anciennes règles de style des marqueurs (`.ship-marker`, `.ais-marker`, `.vessel-marker`) devenues inutiles, à retirer
- La liste de suggestions est rendue dans l'en-tête et non dans un portail sur `document.body` (écart à la section 9 des standards, sans effet constaté)
- L'expiration du jeton en cours de session ne ramène pas encore à la connexion
- Données d'essai : horodatages postérieurs à l'heure actuelle (affichés « date à venir »), embarcations toutes au même endroit
- Nouvelles demandes inscrites au plan sans être traitées : périmètre de suivi activable (lot 8), traitement des alertes avec journal de traçabilité (lot 9)
- Rien n'est commité ; trois chantiers écrivent dans le même arbre de travail

---

## [2026-11-25] Lot 1, deuxième tranche : aides contextuelles, page Alertes en tableau, menu replié

**Ce qui a été construit :**
- Aides contextuelles : encarts repliés à l'arrivée (`HelpTip`), aide à côté du titre des pages Acteurs, Pêches et ressources, Alertes et Rapports (`PageBanner`), aide sur l'état d'une fiche, légende des marqueurs
- `web/src/pages/AlertesPage.tsx` : tableau filtrable par état, type, gravité et texte ; pagination par dix ; détail déplié sous la ligne, en clair, sans identifiant technique ; lignes empilées sous 640 px
- Menu replié : un mot sous chaque icône (`court` dans `web/src/nav.ts`)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Demandes du porteur : aides pour guider au besoin, tableaux et listes préférés aux blocs, alertes mieux décrites
- Standards, section 11.2 : aide discrète, icône toujours accompagnée d'un libellé, listes longues paginées et filtrées

**Technologies / principes utilisés :**
- Filtrage par état et par type côté serveur (paramètres existants), gravité et texte côté navigateur
- Tableau adaptatif en CSS : les colonnes secondaires disparaissent sous 900 px, les lignes s'empilent sous 640 px

**Tests réalisés :**
- `tsc --noEmit` : OK ; `npm test` : OK ; `npm run build` : OK
- Navigateur, instance locale : page Alertes à 1280 px et à 375 px (aucun débordement, détail lisible) ; menu replié complet sans défilement à 800 px de haut
- Non vérifiés à l'écran : actions « Traiter » et « Ignorer » depuis le tableau (non déclenchées pour ne pas modifier les données), filtres autres que l'état par défaut, pages Acteurs, Pêches et Rapports avec leur aide

**Points ouverts / dette technique :**
- Le serveur renvoie au plus 100 alertes : la page l'annonce, la pagination porte sur ces 100 ; pagination côté serveur à prévoir
- Le traitement en plusieurs états avec commentaire, auteur et journal de traçabilité relève du lot 9 (modèle serveur)

---

## [2026-11-25] Lot 10, cadrage : un appareil, un seul compte pêcheur (ADR-012)

**Ce qui a été construit :**
- `docs/adr/ADR-012-un-appareil-un-pecheur.md` : règle demandée par le porteur, constats dans le code, règles R1 à R6, contrat entre l'application et le serveur, limites
- Consignes transmises aux deux sessions déléguées : partie serveur (lot 10, après le lot 5 et avant le lot 2), partie mobile (ajoutée au lot 3)
- Aucun code écrit dans la session principale pour ce lot

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2 et §7 : une position doit être attribuable sans ambiguïté ; demande du porteur du 2026-11-25 contre les tricheries entre pêcheurs
- Constat : le serveur vérifiait l'appartenance de l'embarcation, pas l'appareil ; un même téléphone pouvait servir successivement plusieurs comptes pêcheurs

**Technologies / principes utilisés :**
- Contrôle côté serveur (l'application ne protège jamais seule), identifiant conservé sous forme d'empreinte, paramètres dans un fichier de règles versionné, échec fermé

**Tests réalisés :**
- Aucun : lot au stade du cadrage. Lecture de `geolocalisation/service.py`, des modèles `Utilisateur` et `Position`, de `mobile/src/offline/db.ts`

**Points ouverts / dette technique :**
- Règles R2 à R6 à valider par le porteur ; fenêtre d'exclusivité de 30 minutes proposée
- La règle n'empêche ni de laisser le téléphone à terre ni de le confier à un tiers (balises, AIS et contrôle restent nécessaires)
- L'identifiant Android dépend de la clé de signature : fixer la clé définitive avant la mise en service
- Consignes mises en file dans les deux sessions, prise en compte à vérifier à leur retour

---

## [2026-11-25] Lot 1, troisième tranche : assistant de demande de licence

**Ce qui a été construit :**
- `web/src/components/DemandeLicenceWizard.tsx` et `ui-kit.css` : bande photographique en tête de fenêtre, étapes reliées par une barre de progression (étape faite cochée, étape courante pleine), choix du type en deux grandes cases dont la retenue porte une coche

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.1 : la demande de licence est la porte d'entrée publique du registre ; demande du porteur sur des formulaires plus marquants, professionnels et institutionnels
- Standards, section 11.3 : la progression ne s'anime que par transformation ; l'état ne repose jamais sur la seule couleur

**Technologies / principes utilisés :**
- Variables CSS posées par le composant (`--etapes`, `--avancement`), aucune bibliothèque ajoutée

**Tests réalisés :**
- `tsc --noEmit` : OK ; `npm test` : OK ; `npm run build` : OK
- Navigateur, instance locale : étapes 1 et 2 à 1280 px, étape 1 à 375 px (une colonne, aucun débordement)
- Non vérifiés à l'écran : étapes 3 à 5, parcours de l'organisation, envoi d'une demande

**Points ouverts / dette technique :**
- Fenêtres de création du portail (pêcheur, embarcation, zone, compte) non reprises

---

## [2026-11-24] Lot 5, partie serveur : activité par zone et essai Global Fishing Watch

**Ce qui a été construit :**
- Heures d'activité par maille en GeoJSON (`GET /api/v1/activite/mailles`), calculées depuis les positions de la plateforme, filtrables par période, emprise, secteur, zone, embarcation et source
- Captures par zone ou par secteur (`GET /api/v1/activite/captures-par-zone`) : volumes par espèce, captures sans lieu de pêche comptées à part
- Rapport de zone à la demande, en JSON et en PDF (`/activite/rapport-zone`, `/documents/rapport-zone`) : activité, embarcations présentes, captures, alertes ; consultation inscrite au journal des accès
- Module `gfw` (ADR-011) à l'arrêt par défaut : pêche apparente par mois et par pavillon, navires observés, détections radar, fiche d'identité ; cache, verrou d'un rapport à la fois, budget de requêtes
- Paramétrages versionnés `backend/app/data/regles/` : règle « heures d'activité » au statut Proposé, paramètres de l'essai

**Pourquoi :** compléments 12 et 13 du porteur (chantier de novembre 2026) ; les données de la plateforme sont les seules à couvrir les pirogues, celles de l'éditeur complètent le tableau pour les navires industriels.

**Principes :** règle hors du code et hors de l'environnement ; périmètre par rôle, 404 hors périmètre, échec fermé ; rien n'est attribué à une zone par supposition ; les données de l'éditeur ne déclenchent aucune alerte.

**Tests réalisés :** 39 tests nommés (acceptation, périmètre par rôle, règle paramétrée, éditeur simulé sans réseau) ; essai réel lancé à la main sur la ZEE du Gabon (4 157,61 h, 10 navires, 1 110 détections, quatre requêtes).

**Points ouverts :** validation de la règle par le porteur et l'expert halieutique ; accord écrit de l'éditeur avant toute mise en service ; partie portail après le lot 1.

---

## [2026-11-24] Lot 10, partie serveur : un appareil, un seul compte pêcheur (ADR-012)

**Ce qui a été construit :**
- Table `appareils` (empreinte seule, compte rattaché, première et dernière utilisation, état actif ou libéré, auteur, date et motif de la libération), `positions.appareil_id`, `pecheurs.appareils_autorises` ; migration additive `f8b2d3e4a516`
- Connexion : l'en-tête `X-Appareil-Id` rattache l'appareil au compte pêcheur ou fait refuser la connexion (409 `APPAREIL_DEJA_RATTACHE`, 409 `COMPTE_RATTACHE_AUTRE_APPAREIL`)
- Envoi de positions, unitaire et par lot : 403 `APPAREIL_NON_RATTACHE`, 409 `SUIVI_DEJA_ASSURE` avec alerte `suivi_double_appareil`, référence de l'appareil sur chaque position
- Points d'accès des agents et des administrateurs : liste des appareils d'un pêcheur, libération motivée, autorisation d'un appareil supplémentaire
- Paramétrage versionné `backend/app/data/regles/appareils.json` : fenêtre de 30 minutes, un appareil par défaut, obligation de l'en-tête désactivée

**Pourquoi :** demande du porteur du 2026-11-24, pour éviter les conflits de suivi GPS et les tricheries entre pêcheurs.

**Principes :** seule une empreinte calculée avec un secret du serveur est conservée ; les messages ne disent jamais à qui un appareil est rattaché ; les autres rôles et l'ingestion des balises ne sont pas concernés ; le modèle des alertes n'est pas modifié.

**Tests réalisés :** 19 tests nommés, un par ligne du tableau de l'ADR, périmètre par rôle, absence de valeur brute, fenêtre paramétrée.

**Points ouverts :** règles R2 à R6 à valider ; secret d'empreinte et clé de signature à fixer avant la mise en service ; accès du pêcheur au portail une fois l'en-tête obligatoire.

---

## [2026-11-24] Lot 2, partie serveur : fiche d'identité et page de profil

**Ce qui a été construit :**
- Informations d'inscription complémentaires de l'embarcation, toutes facultatives : MMSI, numéro OMI, indicatif radio, jauge, année de construction, propriétaire, exploitant ; saisies au registre comme à la demande de licence ; migration additive `a9c3e4f5b627`
- Page de profil d'un acteur (`/api/v1/profils`) : présentation courte, espèces tirées des captures déclarées, tarifs facultatifs au kilo ou à l'unité, ouverture au public par lien et QR code, désactivée au départ
- Fiche d'identité à deux volets (`/api/v1/identite`) : registre (identité, licence, organisation, embarcations) et suivi (source et âge du dernier relevé, période observée, nombre de relevés)
- Paramétrage versionné `backend/app/data/regles/profil_acteur.json`

**Pourquoi :** compléments 10 et 11 du porteur (chantier de novembre 2026) et décisions du 2026-11-24 sur la visibilité de la page et les tarifs.

**Principes :** aucun champ de coordonnée sur la page, dans aucune vue, et présentation contrôlée à la saisie ; espèce protégée ou non reconnue jamais affichée, échec fermé sans référentiel ; lien public tiré au hasard ; fiche d'identité cloisonnée par rôle, 404 hors périmètre, consultation par un tiers inscrite au journal des accès ; règles non décidées marquées « Proposé ».

**Revue indépendante :** un bloquant (espèces protégées affichées si le référentiel manquait sur le serveur) et dix points secondaires, corrigés et protégés par des tests.

**Tests réalisés :** 24 tests nommés (acceptation, périmètre par rôle, paramétrage, échec fermé, saisie) ; suite complète : 235 passés, 5 échecs anciens sans lien avec le lot.

**Décisions du porteur (2026-11-24) :** contrôle des coordonnées dans la présentation et son seuil validés ; page d'un acteur suspendu, désactivé ou à la licence expirée fermée aux comptes connectés comme au public.

**Points ouverts :** règles « Proposé » restantes à valider (espèces, vitrine publique, informations d'inscription, avec la DGPA) ; coordonnée affichable et modération à décider ; partie portail à suivre.

---

## [2026-11-24] Lot 3 : socle mobile fiable sur le terrain

- Session conservée dans le stockage sécurisé, restaurée sans réseau, effacée à la déconnexion et au premier 401 avec message à l'écran de connexion ; pas de renouvellement silencieux (demande au serveur S1)
- Déclaration de capture : étape « Lieu de pêche » (position à la saisie, corrigeable, retirable), envoyée dans `position_capture` ; envoi automatique des saisies en attente
- Suivi GPS en arrière-plan : service de premier plan Android avec notification, démarrage et arrêt par le pêcheur après explication, autorisation « pendant l'utilisation » seulement ; relevés versés dans la file hors ligne, état d'envoi visible ; un suivi coupé par le téléphone ne reprend pas en silence
- Carte professionnelle du pêcheur consultable hors ligne avec QR de vérification publique ; lecteur de QR par caméra pour l'agent, saisie du numéro en secours
- Photographies du porteur en arrière-plan de la bienvenue et de la connexion et en bannière des écrans principaux ; libellés accentués, aucun tiret cadratin ; logo du portail en icône de l'application, à la place de celle du gabarit Expo
- Compléments du porteur : numéro de licence attribué automatiquement à la création d'un dossier, aides contextuelles (composant unique), un téléphone pour un seul compte pêcheur (ADR-012, part application)
- Défauts corrigés : file de positions perdue à l'expiration du jeton, positions réelles écartées par le masque d'eau de l'application, file de captures bloquée par une seule saisie refusée, heure de capture décalée d'une heure, saisies en attente visibles d'un autre compte, suivi relancé sans notification après un arrêt de l'application par le téléphone, relevé de départ enregistré deux fois
- Vérifié : typage à zéro erreur, 77 tests, contrôle Expo (20 sur 21, l'échec tient à la version de Xcode du poste), export de production, garde https, APK construite avec le JDK 17, parcours complet sur émulateur Android 16 contre un serveur d'essai à données fictives ; relecture indépendante, aucun bloquant ouvert
- Non vérifié : relevés périodiques à l'intervalle réel de 5 minutes (seul le relevé de départ arrive sur l'émulateur ; à vérifier en premier sur téléphone), lecture d'un QR par une vraie caméra, serveur réel, téléphone réel, essai croisé avec le lot 10, iOS (`docs/lot-3-mobile-socle.md`, section 2.4)
- APK 0.2.0 en deux versions dans `mobile/dist/`, terrain (sans aides de démonstration) et démonstration (code 4, quatre architectures, même signature que la 0.1.2), non publiées ; une première construction reprenait l'adresse du serveur d'essai depuis le cache de Metro : écartée, reconstruite, contrôle ajouté au README
- Non commité, non déployé

---

## [2026-11-24] Tests du serveur sur une base dédiée (ADR-013)

**Ce qui a été construit :**
- `backend/app/tests/base_de_test.py` et `conftest.py` : les tests visent une base `pigap_test` (ou `TEST_DATABASE_URL`), supprimée, recréée et migrée à chaque passage ; garde-fou en échec fermé si le nom de la base ne finit pas par `_test` ou désigne la base de développement
- `test_base_de_test.py` (cinq tests du garde-fou) ; `test_predictions.py::test_penurie_serie_decroissante` rendu déterministe (série datée fixe)
- `.github/workflows/ci.yml` : service PostGIS et variables de base pour la CI ; `.env.example` : nom de la variable
- `docs/adr/ADR-013-base-de-test-dediee.md` (Proposé), `docs/tests-base-dediee.md`

**Pourquoi :** les tests écrivaient dans la base de développement sans purge ; huit tests anciens échouaient ou vacillaient, et la flotte de l'outil de travail était faussée (standards, section 16.1 : base dédiée nommée `*_test`).

**Tests réalisés :** deux passages complets consécutifs, 246 passés et 0 échoué à chaque fois ; base de développement identique avant et après ; garde-fou vérifié avec une adresse visant `pigap` (arrêt immédiat).

**Points ouverts :** ADR-013 à valider ; CI présente en code, non exécutée ; `ruff` signale une variable inutilisée dans `test_m2_geoloc.py` (antérieure), la CI échouera sur ce point tant qu'il n'est pas corrigé.

---

## [2026-11-25] Commits des lots du chantier de novembre et mise en ligne du portail

**Ce qui a été fait :**
- Cinq commits sur `fix/lot-0-fonds-de-carte`, un par lot : `a8b8bb4` (lot 0), `6f546c9` (lot 0 bis), `989642e` (serveur : lots 5, 10 et 2, base de test dédiée), `7a33218` (mobile : lot 3), `d7f1843` (portail : lot 1 et documents) ; branche ni fusionnée dans `main`, ni poussée
- Portail mis en ligne sur Vercel (production, adresse `cbm-pigap-web.vercel.app`) depuis le poste, comme les mises en ligne précédentes
- Serveur non mis en ligne : `railway up` refusé par le mode automatique de Claude Code (cas prévu par les standards, section 5.3) ; commande remise au porteur
- APK 0.2.0 non publiée : la version de démonstration propose des comptes d'essai partagés, que la règle « un appareil, un seul compte pêcheur » (lot 10) rattacherait au premier téléphone une fois le serveur à jour ; décision demandée au porteur

**Pourquoi :** demande du porteur du 2026-11-25 (« commit les modifications effectuées puis déploie »). Standards, section 5.1 : commit et déploiement ne valent pas fusion vers `main` sans mention explicite.

**Tests réalisés :**
- Avant les commits : serveur 246 tests passés, 0 échoué (base de test dédiée) ; mobile 77 tests passés, typage sans erreur ; portail : garde-fou, typage et construction réussis
- Fouille des secrets sur l'ensemble des lignes ajoutées : aucun secret ; les seuls identifiants trouvés sont ceux de démonstration, déjà publics avant ces commits
- Production : paquet servi identique à la construction locale (`index-DfXvc80u.js`), nouveautés présentes, ni ancien fournisseur de tuiles ni identifiant de démonstration, photographies et pages publiques en 200, API en ligne saine (`/health` 200, ancienne version)

**Points ouverts :**
- Mise en ligne du serveur par le porteur, puis vérification (migrations `f8b2d3e4a516` et `a9c3e4f5b627` jouées au démarrage, `/health`, bulletin à 8 secteurs)
- Publication de l'APK 0.2.0 et choix du traitement des comptes de démonstration
- Fusion dans `main` et envoi sur le dépôt distant à décider par le porteur
- Lint du serveur déjà rouge avant ce chantier (CI) ; `web/tsconfig.tsbuildinfo` et l'étude du 2026-10-30 laissés hors commit (fichiers tiers)


---

## [2026-11-26] Correctifs d'affichage carte et lots portail (avant 8 h)

**Ce qui a été construit :**
- Panneau Navires : la flotte GPS n'est plus écrasée par le bloc AIS (`flex-shrink`) ; titre « Flotte GPS · N » ; libellés AIS « dans les eaux gabonaises » / « en approche » ; fiche et panneau exclusifs en scène étroite
- Cartographie : ZEE masquée en mode contexte, pastilles de zones, légende carte, pastilles de type dans la liste
- Note AIS : compte des observations périmées retirées (lot 4) ; tests lot 4 verts
- Lots présents en code prêts à commit : 1, 2, 4, 5, 9 portail ; 6 prix partiel ; appareils (lot 10 portail)

**Pourquoi :** anomalies signalées par le porteur (masquage des navires, indexation AIS vs GPS, zones vs côte) ; mandat d'avancer jusqu'à 8 h avec commit et déploiement.

**Tests réalisés :**
- `npx tsc --noEmit` et `npm run build` web : OK
- `pytest` lots 4, 6, 9 : verts (lot 4 après correctif de note)
- Capture navigateur locale : panneau Navires montre « Flotte GPS · 100 » avec la liste défilante, AIS à part

**Décisions prises à la place du porteur (jusqu'à 8 h) :**
- Committer et déployer le code présent (portail + serveur)
- Ne pas démarrer les lots 7 (commandes, ADR Kimba) ni 8 (multi-zones, écart cahier)
- Ne pas fusionner dans `main` (non demandé)
- Ne pas publier l'APK 0.2.0 (exemption démo déjà décidée, publication reportée)

**Points ouverts :**
- Noms de démo répétés (« Pirogue out / c0 / c1 / c2 ») : données de seed, pas un bug de binding
- Rentabilité calculée (lot 6) et commandes (lot 7) : règles « Proposé »

---

## [2026-11-27] Sécurité red/blue — correctifs Haute (abonnements)

**Ce qui a été construit :**
- Agent / skill `security-redblue` (attaque-défense : revue + correctifs, sans exploits)
- Contrôle d'appartenance sur `confirmer-demo` et `synchroniser` (IDOR pêcheur/org → 404)
- Accusés webhook Mobile Money / PawaPay sans MSISDN (`WebhookAckRead`)
- Auth Bearer PawaPay aussi dès qu'un jeton/secret est configuré en mode démo
- Suite audit : plafond batch GPS (500), fail-closed `MOBILE_MONEY_MODE=live` sans secret/jeton, JWT prod min 32 car., rate-limit login (20/min/IP)
- Tests défensifs : `test_security_redblue.py` (+ alignement pawapay / abonnements)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §7 sécurité par conception ; suite exploration + audit `security-auditor` (GO réserves)
- CORS joker et JWT défaut déjà refusés en production (`assert_production_security`)

**Technologies / principes utilisés :**
- Filtrage serveur (pas seulement UI) ; 404 hors périmètre ; hmac.compare_digest ; limiteur mémoire

**Tests réalisés :**
- `pytest app/tests/test_security_redblue.py` (+ abonnements / pawapay précédemment verts)

**Points ouverts / dette technique :**
- FO public (demandes licence, inscription commande, profil public, vérif quittance) : volontaire MVP
- Écriture GPS staff encore large ; vue agent par zone (H3/H5) reportée
- LogAcces incomplet ; `/docs` ouvert hors prod

---

## [2026-11-27] Jeu de démonstration réduit (poignée d'acteurs, 12 mois)

**Ce qui a été construit :**
- `backend/scripts/seed_production_demo.py --reset` : 1 admin, 1 agent de contrôle, 1 autorité, 1 organisation (Coopérative des Pêcheurs de l'Estuaire), 5 pêcheurs / 5 embarcations
- Un an de sorties (une tous les 10 jours) le long des corridors open data, mer vers l'intérieur : Estuaire, Mondah, Ogooué jusqu'à Lambaréné et Ogooué moyen, rade de Port-Gentil, Mayumba ; 184 sorties, 1845 positions, 184 captures, 5 alertes, 1 quota crevette (fictif, à valider)
- `seed_series_saisonnieres.py` et `seed_maritime_scenarios.py` : no-op sauf `--force` (le premier créait une capture par jour et des centaines d'alertes ; le second effaçait tout l'historique GPS)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Demande du porteur : limiter la démo à une poignée d'acteurs avec un an d'enregistrements de la côte vers les zones de pêche intérieures
- Les volumes précédents (milliers d'acteurs, noms « Pirogue out / c0 ») venaient de dumps de tests et de graines lourdes, pas du produit

**Technologies / principes utilisés :**
- Corridors `DEMO_ROUTES` (ZEE / OSM) ; points hors eau = 0 sur les sous-échantillons
- Purge SQL (`--reset`) : extra comptes, pêcheurs, navires, organisations, demandes, alertes ; les 5 bateaux du jeu sont ressemés

**Tests réalisés :**
- Seed local PostGIS : 8 comptes (3 staff + 5 pêcheurs), 5 embarcations, 1 organisation, GPS du 2025-11-29 au 2026-11-27 ; Pirogue Ogooué 9,01°E à 11,25°E
- Seed production (base Railway du portail) : mêmes volumes
- API production : 5 pêcheurs, 5 embarcations, 1 organisation, 5 alertes, 5 positions live, 2677 kg de captures sur 12 mois

**Points ouverts / dette technique :**
- Script de seed modifié non commité (demande de commit à part)
- `simulate_live_fleet.py` peut encore être lancé à la main ; il n'ajoute plus de bateaux s'il n'y en a que 5
- Lots 7 et 8 toujours reportés

