# Chantier : évolutions de novembre 2026 (acteurs, valeur pour le pêcheur, carte, géolocalisation)

- **Statut :** document de cadrage interne, projet soumis à validation humaine
- **Date :** 2026-11-24
- **Auteur :** Christian BEYEME (+ agent)
- **Liens :** [ADR-009](adr/ADR-009-suivi-temps-reel-sources-position.md), [ADR-010](adr/ADR-010-fonds-de-carte-sans-cle.md), [ADR-011](adr/ADR-011-global-fishing-watch-source-differee.md), [ADR-012](adr/ADR-012-un-appareil-un-pecheur.md), [étude du 2026-10-30](etude-localisation-sans-capteur-et-zones-favorables.md), [cahier](../cdc-mvp-pigap.md)

## 1. Compréhension stratégique

### 1.1 Demande du porteur

1. Mêmes actions sur l'application mobile et sur le portail pour les pêcheurs, les grandes compagnies, les associations et les organisations ; chacun choisit son support.
2. Courbes des prix de vente, globale et par espèce ; des fonctions utiles au pêcheur dont la donnée remonte aux administrateurs, aux autorités et aux organisations.
3. Reprise visuelle de l'application mobile et du portail.
4. Suivi d'activité, rendement et seuil de rentabilité pour le pêcheur ; réception de commandes, donc des interfaces clients et revendeurs.
5. QR code du pêcheur (fiche d'identité, portail et mobile) et lecture par les agents.
6. Correction de l'anomalie de la carte ; la carte doit montrer et signaler les navires et pêcheurs en infraction.
7. Géolocalisation en temps réel, effective et fiable.

Compléments du porteur, le 2026-11-24 en cours de séance :

8. Carte presque en plein écran quand elle est l'information principale, de bonne dimension quand elle accompagne d'autres informations.
9. Images fournies par le porteur en arrière-plan et en bannières.
10. Page de profil pour chaque pêcheur, navire, entreprise, association ou organisation : espèces pêchées et, si l'acteur le souhaite, tarifs au kilo ou à l'unité.
11. Fiche d'identité des pêcheurs et des navires à la manière d'un outil public de suivi des navires : ce que dit le registre d'un côté, ce que le navire émet de l'autre ; informations utiles à collecter à l'inscription. Le concept est repris, pas le style.
12. Zones d'heures de pêche consolidées sur la carte, avec filtres temporels ; rapports générables à la demande, avec les captures par zone.
13. Exploitation de l'API Global Fishing Watch, dont le porteur a obtenu une clé.
14. Portail mieux adapté à toutes les largeurs d'écran ; menu, formulaires, icônes et application entière plus marquants, en restant professionnels et institutionnels ; illustrations des pirogues et des navires à reprendre avec finesse.
15. Commandes payantes : formulation reçue à clarifier (section 3).
16. Application des standards techniques du porteur quand ils s'y prêtent.

Demandes reçues pendant l'exécution des lots, les 2026-11-24 et 25 :

17. Numéros de licence toujours attribués automatiquement.
18. Aides contextuelles discrètes (« synapses ») pour guider, dans l'application et sur le portail.
19. Activation et désactivation, à choix multiples, des pays et des zones de suivi (ville, province, côtes, fleuves propices à la pêche), appliquées aux données ; par défaut : Gabon, Estuaire, Libreville, Owendo, Akanda, Cap Estérias.
20. Fiches synthétiques, avec possibilité d'entrer dans le détail, et mieux présentées.
21. Interaction avec la carte : moins de conflits de clic, d'affichage et de chevauchement ; niveaux d'empilement maîtrisés.
22. Listes et tableaux préférés aux blocs et aux cartes quand ils conviennent mieux.
23. Filtres de recherche avec suggestions et critères avancés.
24. Alertes mieux décrites, traitées en plusieurs états avec commentaire, auteur et journal de traçabilité.
25. Un appareil ne doit pas accueillir plusieurs sessions de pêcheurs, pour éviter les conflits de suivi GPS et les tricheries entre pêcheurs (règle appliquée si elle est cohérente).

### 1.2 Constats vérifiés le 2026-11-24

| Sujet | Constat | Preuve |
|-------|---------|--------|
| Rôles sur mobile | Seuls pêcheurs et agents sont admis | `mobile/src/auth/roles.ts` |
| Rôles sur le portail | Le pêcheur est refusé à la connexion ; une organisation ne voit que son inscription et le paiement de sa licence | `web/src/App.tsx` (`onLogin`), `web/src/pages/OrgPortalPage.tsx` |
| Prix | Aucun prix de vente collecté ; seuls des prix moyens de référence 2024 existent | modèle `Capture`, `referentiels_peche.json` |
| Rentabilité, commandes | Ni sortie, ni charges, ni ventes, ni commandes dans le modèle | `backend/app/db/models.py` |
| QR | Présent sur la licence PDF et vérifié côté serveur ; aucune carte à l'écran, aucun lecteur par caméra | `documents/pdf.py`, `controles/router.py`, dépendances mobile et web |
| Carte, fond | Fournisseur du fond exigeant désormais une clé : filigrane sur toute tuile neuve ; police en erreur 404 | ADR-010 |
| Carte, infractions | Seul le silence GPS distingue un marqueur ; la régularité n'est calculée qu'à l'ouverture d'une fiche ; aucun navire AIS ne déclenche d'alerte | `web/src/App.tsx`, `ais_gabon/service.py` |
| Carte, fraîcheur | Le seul navire AIS affiché à Owendo est une observation du 2026-09-20 rechargée depuis un fichier, présentée « à quai » sans âge | `data/open-data/gabon/ais_zee_snapshot.geojson`, `load_snapshot` |
| Suivi GPS mobile | Relevés pris par minuterie tant que l'écran GPS reste ouvert ; pas de tâche d'arrière-plan | `mobile/src/screens/TrackingScreen.tsx` |
| Session mobile | Jeton gardé en mémoire vive, perdu à la fermeture ; pas de renouvellement ; durée par défaut de 60 minutes | `mobile/App.tsx`, `backend/app/core/config.py` |
| Lieu de pêche | Champ prévu, aucun écran ne le renseigne | étude du 2026-10-30 |
| Poids | Application de 95 Mo ; portail livré en un seul fichier de 1,96 Mo ; vidéo de 16 Mo et environ 12 Mo d'illustrations servies par le portail | `mobile/dist`, `web/dist`, `web/public` |
| Portail en ligne | En pause le 2026-11-24 (503), remis en service le même jour par le porteur | mesure HTTP |
| Carte, place à l'écran | Page Navires : carte de 842 × 734 px sur un écran de 1280 × 800 px, soit 60 % de l'écran ; panneau fixe de 360 px portant 1 922 px de contenu à faire défiler | mesure dans le navigateur |
| Cartes secondaires | Tableau de bord : hauteur liée à l'écran sans plafond (`calc(100vh - 320px)`) ; rapports : 280 px fixes | `web/src/styles.css` |
| Accueil sur téléphone | Les deux boutons d'en-tête restaient affichés : page large de 761 px sur un écran de 375 px, bouton de menu hors champ | mesure dans le navigateur ; règle `button:has(> svg:first-child)` de `ui-kit.css` |
| Portail sur téléphone | Titre de page réduit à 21 px de large, cloche superposée ; 84 px vides sous chaque page (réserve d'une ancienne barre d'icônes) | mesure dans le navigateur ; `styles.css` |
| Poids de l'accueil | Image d'ouverture de 2,6 Mo | `web/public/illustrations/landing-hero-gabon.png` |
| Inscription d'une embarcation | Le registre porte nom, immatriculation, type, longueur, puissance, engins, matériau, site d'attache et balise ; il ne porte ni MMSI, ni numéro OMI, ni indicatif radio, ni jauge, ni année de construction, ni distinction entre propriétaire et exploitant | `backend/app/db/models.py`, `web/src/components/EquipementsFields.tsx` |
| Global Fishing Watch, données | Clé valide. ZEE du Gabon, du 2026-08-01 au 2026-11-01 : 4 158 heures de pêche apparente, 10 navires, 1 110 détections radar (détail en 5.3) | essai en lecture seule du 2026-11-24 |
| Global Fishing Watch, usage | API réservées à un usage non commercial ; CBM-PIGAP vend des licences et des abonnements | documentation de l'éditeur ; `docs/modele-economique.md` |

### 1.3 Recadrages

- **Parité :** les mêmes actions sur les deux supports concernent les acteurs de la filière. L'administration (dessin des zones, comptes, rapports) reste sur le portail ; son usage mobile se limite à la consultation et au contrôle.
- **« Pirates » :** l'interface parle de « navire suspect » et de présomption. La qualification d'infraction revient à l'agent assermenté (cahier §3.1, explicabilité).
- **Présences humaines :** aucune localisation de personnes sans consentement (ADR-009, loi n° 001/2011 modifiée). Le suivi porte sur les embarcations qui émettent ou que des capteurs détectent.
- **Commandes :** hors périmètre du cahier (§2.2). ADR et validation de Kimba Connect avant tout développement.

## 2. Décisions du porteur (2026-11-24)

| Sujet | Décision |
|-------|----------|
| Fond de carte | Fond OpenStreetMap sans clé (ADR-010) |
| Commandes | Obsolète, révisée plus bas le même jour. Mise en relation sans paiement en ligne par défaut ; en option, paiement Mobile Money avec acompte de 30 % du prix, solde à la réception ou à la livraison, sous un mécanisme de confirmation entre vendeur et client |
| Parité | Périmètre « acteurs » de la demande initiale, retenu sauf avis contraire |
| Récepteurs AIS | Explorer d'abord les voies gratuites (section 5) |
| Carte | Presque plein écran quand elle est l'information principale ; taille bornée ailleurs |
| Images | Les quatre images du porteur servent d'arrière-plans et de bannières |
| Page de profil | Espèces pêchées ; tarifs facultatifs, au kilo ou à l'unité |
| Fiche d'identité, zones d'heures de pêche, rapports de zone | Concept repris d'un outil public de suivi des navires, sans en copier le style |
| Global Fishing Watch | Clé obtenue par le porteur ; exploitation demandée, sous réserve des conditions d'usage (5.3) |
| Design | Portail et application plus marquants, professionnels et institutionnels ; illustrations des embarcations à reprendre |

Réponses du porteur aux quatre questions du 2026-11-24 (soir) :

| Sujet | Décision |
|-------|----------|
| Commandes | Aucun paiement en ligne : la réservation est gratuite et indique le montant prévu. Le paiement en ligne reste réservé aux abonnements, aux renouvellements et à l'enregistrement avec achat de licence et d'abonnement, étape par étape. L'option d'acompte de 30 % est abandonnée |
| Page de profil | Visible des personnes connectées ; l'acteur peut en plus l'ouvrir au public par un lien ou un QR code, s'il le décide |
| Global Fishing Watch | Essai de faisabilité d'abord, hors service ; le porteur traite de son côté la question des conditions d'usage et en assume la responsabilité |
| Bannières du portail | Conservées en l'état |
| Organisation | Lots sans conflit de fichiers menés en parallèle |

## 3. Règles métier

| Règle | Statut | Valideur |
|-------|--------|----------|
| Acompte de 30 % du prix à la commande, par Mobile Money | Obsolète (abandonnée le 2026-11-24 au soir) | Christian |
| Solde réglé ou confirmé à la réception ou à la livraison | Obsolète (abandonnée le 2026-11-24 au soir) | Christian |
| Forme de la confirmation (code remis au client et saisi par le vendeur, ou double validation) | Proposé | Christian |
| Annulation, remboursement de l'acompte, litiges, délais | Proposé | Christian, Kimba Connect |
| Frais de paiement et éventuelle commission | Proposé | Christian |
| Offre limitée aux captures déclarées et aux espèces autorisées | Proposé | Christian, DGPA |
| Prix de vente saisi à la déclaration, obligatoire ou facultatif | Proposé | Christian |
| Diffusion des prix : agrégation par site et par espèce, seuil d'anonymat | Proposé | Christian, DGPA |
| Formule du seuil de rentabilité et liste des charges d'une sortie | Proposé | Christian, expert halieutique |
| Seuils d'alerte pour les navires AIS (zone, absence au registre, extinction du signal) | Proposé | Christian, DGPA |
| Photo d'identité sur la carte professionnelle | Proposé | Christian (donnée personnelle, consentement) |
| Commande : réservation gratuite, sans paiement en ligne, indiquant le montant prévu | Décidée le 2026-11-24 | Christian |
| Paiement en ligne réservé aux abonnements, aux renouvellements et à l'enregistrement avec achat de licence et d'abonnement, étape par étape | Décidée le 2026-11-24 | Christian |
| Tarifs du profil : facultatifs, par espèce, au kilo ou à l'unité | Décidée le 2026-11-24 | Christian |
| Page de profil : visible des comptes connectés ; ouverture au public par lien ou QR code sur décision de l'acteur, désactivée au départ | Décidée le 2026-11-24 | Christian |
| Contenu de la vitrine publique d'un profil : aucune coordonnée personnelle sans accord de l'acteur | Proposé | Christian (donnée personnelle, consentement) |
| Espèces du profil : tirées des captures déclarées, l'acteur pouvant en masquer | Proposé | Christian, DGPA |
| Informations d'inscription d'un navire à ajouter : MMSI, numéro OMI, indicatif radio, jauge, année de construction, propriétaire et exploitant distincts ; exigées selon la catégorie (pirogue, navire). Déjà collectés : nom, immatriculation, type, longueur, puissance, engins, site d'attache | Proposé | Christian, DGPA |
| Heure de pêche d'une embarcation suivie par l'application : règle de calcul (vitesse, durée, distance au port) et taille de maille | Proposé | Christian, expert halieutique |
| Données Global Fishing Watch | Essai de faisabilité hors service décidé le 2026-11-24 ; mise en service soumise à l'accord de l'éditeur, que le porteur traite de son côté | Christian |
| Un appareil n'accepte qu'un seul compte pêcheur | Décidée le 2026-11-25 (ADR-012, règle R1) | Christian |
| Comptes de démonstration exemptés de la règle d'appareil, par liste dans le fichier de paramètres ; version de démonstration de l'APK derrière le lien public | Décidée le 2026-11-25 | Christian |
| Un compte pêcheur rattaché à un seul appareil, appareil supplémentaire sur autorisation ; une embarcation suivie par un seul appareil à la fois (fenêtre de 30 minutes) ; libération par un agent ou un administrateur avec motif ; identifiant conservé en empreinte ; agents non concernés | Proposé (ADR-012, règles R2 à R6) | Christian, DGPA |

Point de vigilance sur l'option de paiement : la plateforme encaisserait un acompte pour le compte du vendeur. Le cadre applicable aux services de paiement, les possibilités de l'agrégateur (versement au vendeur, remboursement) et les conditions générales sont à vérifier avant l'ADR ; rien n'est supposé ici.

## 4. Exécution

Un lot à la fois, avec tests, journal et mise à jour du statut (`AGENTS.md`). Plan révisé le 2026-11-24 après les compléments du porteur ; l'ancien numéro figure entre parenthèses.

| Lot | Contenu | Prérequis | État |
|-----|---------|-----------|------|
| 0 | Fond de carte sans clé, polices, garde-fou ; rappel des comptes de démonstration retiré des constructions publiques | Aucun | Fait ; commité le 2026-11-25 sur la branche `fix/lot-0-fonds-de-carte` |
| 0 bis | Carte plein cadre (Navires, Surveillance, Cartographie) avec panneaux refermables et plein écran ; cartes secondaires bornées ; images du porteur en arrière-plan de l'accueil et en bannières des pages principales ; correctifs d'affichage sur téléphone | Aucun | Fait ; commité le 2026-11-25 |
| 1 | Reprise visuelle du portail : illustrations des pirogues et des navires, menu, formulaires, icônes, adaptation à toutes les largeurs, allègement des pages ; méthode des standards (spécification par écran, revue, vérification à 375, 768 et 1280 px, tests d'interface rejouables) ; recherche avec suggestions ; aides contextuelles ; tableaux préférés aux blocs | Aucun | Fait en code (CompactList retiré des pages métier) ; trois tranches commitées le 2026-11-25 ; 2026-11-26 : restes tableaux + Playwright |
| 2 | Fiche d'identité et page de profil sur le portail : registre d'un côté, suivi de l'autre ; QR ; espèces ; tarifs facultatifs ; informations d'inscription complétées ; espace acteur ouvert au pêcheur et à l'organisation | Règles « Proposé » de la section 3 (champs d'inscription, espèces) | Partie serveur faite, commitée le 2026-11-25 (`lot-2-profil-serveur.md`) ; partie portail commitée le 2026-11-26 (assistant, profil organisation, page publique) ; mobile : voir `lot-2-profil-mobile.md` |
| 3 (ancien 1) | Socle mobile fiable : session conservée, suivi GPS en arrière-plan, sortie et retour, lieu de pêche ; profil et QR sur mobile, lecteur par caméra pour l'agent ; images et reprise visuelle de l'application | Documentation de la version d'Expo du projet ; ADR pour la déclaration de sortie (écart §5.2) | Fait, commité le 2026-11-25 (`lot-3-mobile-socle.md`) ; APK 0.2.0 construite, non publiée ; sortie et retour reportés, faute de modèle serveur |
| 4 (ancien 2) | Carte des infractions : statut de régularité sur chaque marqueur, filtre « à contrôler », alertes automatiques pour les navires AIS, âge de chaque position, notification | Seuils à valider | Partie serveur déjà dans l'arbre ; partie portail commitée le 2026-11-26 (`lot-4-carte-portail.md`) |
| 5 | Activité par zone : heures de pêche par maille à partir des positions de l'application et des balises, filtre temporel, captures par zone, rapport de zone à la demande ; en complément, navires industriels vus par Global Fishing Watch | Lieu de pêche (lot 3) pour les captures par zone ; Global Fishing Watch à l'essai, hors service (ADR-011) | Partie serveur faite, commitée le 2026-11-25 (`lot-5-activite-zones-serveur.md`) ; partie portail commitée le 2026-11-26 (heures, rapport, tableaux GFW) |
| 6 (ancien 4) | Prix de vente, courbes, carnet de sortie, rendement et rentabilité | Règles de la section 3 | Fait en code (`lot-6-prix.md`) : prix facultatif, courbes anonymes, carnet par jour (pas de Sortie) ; charges et rentabilité non calculées ; API en production le 2026-11-26 |
| 7 (ancien 5) | Commandes, clients et revendeurs : réservation gratuite indiquant le montant prévu, sans paiement en ligne | ADR, validation de Kimba Connect (hors périmètre du cahier) | Reporté : hors cahier, décision du 2026-11-26 (avant 8 h) |
| 8 | Périmètre de suivi : pays et zones (ville, province, côtes, fleuves) activables à choix multiples, appliqués aux données ; par défaut Gabon, Estuaire, Libreville, Owendo, Akanda, Cap Estérias | ADR (le cahier exclut le multi-zones) ; référentiel des zones et de leurs contours ; règle d'application aux données à préciser | Reporté : écart cahier, décision du 2026-11-26 (avant 8 h) |
| 10 | Un appareil, un seul compte pêcheur (ADR-012) : rattachement et contrôles côté serveur, envoi de l'identifiant et messages côté application, liste et libération des appareils sur le portail | Clé de signature définitive de l'application avant la mise en service | Parties serveur (`lot-10-appareil-unique-serveur.md`) et mobile faites, commitées le 2026-11-25 ; partie portail commitée (`AppareilsPanel` sur Licences) |
| 9 | Traitement des alertes : description détaillée, états successifs avec commentaire et auteur, journal de traçabilité consultable | Liste des états à valider (« Proposé ») ; touche le modèle des alertes | Partie serveur dans l'arbre (`lot-9-traitement-alertes-serveur.md`) ; partie portail commitée le 2026-11-26 (`lot-9-traitement-alertes-portail.md`) |

L'ancien lot 3 (espace acteur commun, reprise visuelle, allègement) est réparti entre les lots 1, 2 et 3.

Travail en parallèle décidé le 2026-11-24 : trois chantiers aux dossiers disjoints dans le même arbre de travail, sans commit par les chantiers délégués. La session principale orchestre, tient `docs/JOURNAL.md`, `docs/STATUS.md` et ce document ; chaque session déléguée remet son compte rendu dans un document propre (`docs/lot-3-mobile-socle.md`, `docs/lot-5-activite-zones-serveur.md`, `docs/lot-2-profil-serveur.md`). Une seule suite de tests serveur tourne à la fois : les lots 5 et 2 côté serveur se suivent dans la même session.

### 4.1 Lot 0 bis : ce qui est livré en code, comment le vérifier

| Sujet | Avant | Après | Preuve |
|-------|-------|-------|--------|
| Carte de la page Navires, écran de 1280 × 800 px | 842 × 734 px, 60 % de l'écran | 1202 × 725 px, 85 % de l'écran, sans défilement de page | mesure dans le navigateur |
| Panneau de la carte | Colonne fixe de 360 px, 1 922 px de contenu | Quatre panneaux à la demande (Couches, Navires, Mer, Ports), un seul ouvert, aucun à l'arrivée | captures |
| Plein écran | Absent | Bouton « Plein écran » (masqué sur téléphone, où la carte remplit déjà l'écran) | essai manuel non fait dans le volet de prévisualisation ; à essayer dans un navigateur |
| Cartographie des zones | Même colonne fixe | Même carte plein cadre, panneau « Zones » ouvert à l'arrivée et refermable | capture |
| Carte du tableau de bord | 520 px au minimum, sans plafond | Entre 380 et 520 px selon l'écran (439 px sur 800 px de haut) | mesure |
| Carte des rapports | 280 px | Entre 300 et 420 px | règle de style |
| Accueil | Image d'ouverture de 2,6 Mo | Image du porteur, 68 ko (30 ko sur téléphone) ; bandeau Services et bloc Application sur photographie ; bande photographique sur la fenêtre de connexion | captures, mesure réseau |
| Pages principales du portail | En-têtes illustrés par pictogrammes | Bannière photographique de 124 px (tableau de bord, rapports, acteurs, pêches et ressources, alertes, contrôles, équipe, espace organisation) | captures, sauf espace organisation (aucun compte d'essai local) |
| Accueil sur téléphone | Page large de 761 px pour un écran de 375 px | 375 px, bouton de menu visible | mesure |
| En-tête du portail sur téléphone | Titre tronqué à une lettre | Titre et actions sur une ligne, recherche en dessous | capture |
| Bas de page sur téléphone | 84 px vides | Supprimés | mesure |

Vérification rejouable : `npm test` et `npm run build` dans `web/` (garde-fou des fonds de carte, typage, construction). Les points d'affichage ci-dessus ne sont prouvés que par mesures et captures : le portail n'a pas encore de tests d'interface.

Écart assumé par rapport aux standards (section 11.4, outils de travail sans photographie décorative) : les bannières photographiques du portail répondent à la demande expresse du porteur. Elles sont basses, sans animation, limitées aux huit pages principales et portées par un seul composant (`PageBanner`), donc retirables en un point.

Non fait dans ce lot : images dans l'application mobile (lot 3), illustrations des embarcations, menu et formulaires (lot 1).

### 4.2 Lot 1 : avancement au 2026-11-25

Livré en code, vérifié à l'écran sur l'instance locale :

| Sujet | Avant | Après |
|-------|-------|-------|
| Embarcations suivies sur la carte | Voilier de fantaisie et anneaux animés en boucle, noms toujours affichés, marqueurs empilés | Médaillon posé sur la position (pirogue ou navire de pêche de profil), anneau d'état lisible sans la couleur (plein, tirets, pointillé avec repère), nom au survol ou à fort zoom |
| Embarcations qui se chevauchent | Tas de marqueurs illisible | Médaillon chiffré dont l'anneau donne la répartition des états ; un clic zoome, ou ouvre la liste quand elles sont au même endroit |
| Navires AIS | Silhouette simple | Silhouette affinée orientée selon le cap, vecteur de vitesse, sillage en route, cercle en tirets à quai ou au mouillage |
| Stabilité de la carte | Marqueurs reconstruits et carte recadrée toutes les vingt secondes : le zoom de l'utilisateur était annulé | Aucune reconstruction sans changement de données ; recadrage seulement au changement de page, de mode ou de sélection |
| Fiche d'une embarcation ou d'un navire | Long défilement, vingt lignes identiques, zones énumérées à la suite | Quatre chiffres clés, constats regroupés avec compteur, onglets Synthèse, Registre, Suivi, Alertes ; listes repliées ; tableaux compacts |
| Empilement | Niveaux improvisés ; un marqueur passait au-dessus d'une liste | Échelle unique documentée en tête de `ui-kit.css` |
| Mise en page de la carte | Selon la largeur de la fenêtre | Selon la largeur réelle de la zone de carte (barre latérale dépliée, volet réduit) |
| Fiche et carte | La fiche pouvait recouvrir le navire sélectionné | La carte décale son centre utile ; la barre d'outils et le zoom s'écartent |
| Session du portail | Perdue à chaque rechargement de la page | Conservée le temps de l'onglet (`sessionStorage`, à défaut de jeton de renouvellement côté serveur) |
| Numéro de licence | Champ de saisie dans le formulaire de création | Annoncé comme automatique ; reprise d'un numéro papier en option repliée |
| Recherche | Champ sans effet, qui renvoyait seulement vers le registre | Suggestions par catégorie (embarcations, navires AIS, pêcheurs, zones), critères avancés, sélection menant à la fiche, au registre ou à la zone |
| Aides contextuelles | Trois encarts ouverts en permanence | Encarts repliés à l'arrivée ; aide à côté du titre des pages Acteurs, Pêches et ressources, Alertes, Rapports ; aide sur l'état d'une fiche ; légende des marqueurs |
| Page Alertes | Blocs empilés, alertes à traiter seulement | Tableau filtrable (état, type, gravité, texte), paginé par dix, détail déplié sous la ligne sans identifiant technique ; lignes empilées sur téléphone |
| Menu replié | Icônes seules | Un mot sous chaque icône ; dix entrées visibles sans défilement sur 800 px de haut |
| Assistant de demande de licence | Pastilles d'étapes, deux petits boutons pour le type | Bande photographique, étapes reliées par une barre de progression, choix du type en deux grandes cases cochées ; une colonne sur téléphone |

Complément du 2026-11-26 (présent en code, non commité) : fenêtres pêcheur, embarcation, zone et compte en deux colonnes ; tableaux pour l'équipe, la file des demandes, les signaux, les alertes du tableau de bord et les zones ; menu déplié avec libellé et sous-titre ; `--hero-bg` sur la photographie du porteur ; `npm run test:e2e` (12 tests, 375 / 768 / 1280 px sur l'accueil public).

Reste à faire dans le lot 1 : CompactList encore sur plusieurs pages métier ; purge des anciennes règles de `styles.css` ; passe connectée à 1280 px (Cartographie, Rapports, tableau de bord) dès que l'API PIGAP est de nouveau joignable.

Dettes relevées hors lots : scénario de bout en bout du cahier (§9), base de test isolée (faite le 2026-11-24, ADR-013, à valider), clé de signature de l'application, mots de passe des comptes de démonstration lisibles dans le dépôt public, imagerie satellitaire à régulariser, anciennes règles de style du panneau latéral.

## 5. Géolocalisation : mesures et pistes

### 5.1 Mesure de la couverture AIS communautaire

Sonde sur le flux communautaire déjà utilisé par la plateforme, avec la clé du projet, le 2026-11-23 vers 23 h 30 UTC :

| Zone | Durée | Résultat |
|------|-------|----------|
| Manche (témoin) | 15 s | 10 navires |
| Golfe de Guinée entier | 180 s | 1 navire (secteur Côte d'Ivoire et Ghana) |
| Eaux gabonaises | 180 s | 0 message |

Même résultat que le 2026-09-20 pour le Gabon. Ces réseaux gratuits ne voient que ce que captent leurs stations bénévoles, à portée radio de la côte (ordre de grandeur de 20 à 40 milles par récepteur, ADR-009). Aucune station ne couvre le littoral gabonais.

### 5.2 Pistes

| Piste | Ce qu'elle apporte | Coût | Démarche | Limite |
|-------|--------------------|------|----------|--------|
| Application fiabilisée (lot 1) | Position des pirogues équipées d'un téléphone | Nul | Développement | Muette hors couverture mobile jusqu'au retour |
| Station AIS fournie par un réseau de suivi | Navires AIS à portée d'Owendo ou de Port-Gentil, en direct | Matériel annoncé gratuit par au moins un réseau ([programme](https://www.marinetraffic.com/p/apply-for-free-ais-receiver)) | Candidature du porteur ou de Kimba Connect ; site avec courant et internet | Conditions non lues (page inaccessible à nos outils) ; partage des données avec le réseau à vérifier |
| Récepteur AIS monté par nos soins | Idem, données entièrement maîtrisées | Faible, à chiffrer | Achat et installation | Idem portée radio |
| Balises de l'État | Pirogues équipées, toute la ZEE | Nul si accès accordé | Convention (ADR-009) | Décision administrative |
| Skylight | Navires détectés par satellite, y compris ceux qui n'émettent pas : radar Sentinel-1, optique Sentinel-2 et Landsat 8 et 9, lumières nocturnes ; accès par interface et par API | Gratuit pour les administrations, organisations régionales et ONG ([site](https://www.skylight.global/), [publication](https://arxiv.org/abs/2312.03207)) | Demande d'accès portée par l'administration | Passages de satellites, pas un suivi continu ; aucun délai chiffré publié ; aucune offre annoncée pour une société privée |
| Global Fishing Watch | Présence et activité apparente des navires, détections radar | Gratuit en usage non commercial | Licence sur mesure à demander pour un produit commercial ([FAQ](https://globalfishingwatch.org/faqs/can-i-use-global-fishing-watch-apis-for-commercial-purposes/)) | Intégration commerciale non couverte par les licences actuelles |
| Détection radiofréquence par satellite | Navires repérés par leurs émissions radio, AIS coupé compris | Service commercial, sur devis | Consultation de fournisseurs | Coût ; revisite non chiffrée dans les sources lues |
| Liaison directe satellite vers téléphone | Position envoyée par l'application hors couverture terrestre | Nul pour la plateforme | Veille ; confirmation auprès de l'opérateur | Lancée en RDC, annoncée pour 14 marchés d'ici fin 2026 sous réserve d'autorisations ; rien de confirmé pour le Gabon |

Les pirogues en bois de petite taille échappent largement au radar satellitaire (étude du 2026-10-30) : pour elles, l'application et les balises restent les seules sources.

### 5.3 Global Fishing Watch : lecture de la documentation et essai du 2026-11-24

Le porteur a obtenu une clé et demandé l'exploitation de l'API (version 3).

**Essai en lecture seule sur la ZEE du Gabon (identifiant de zone 8476), du 2026-08-01 au 2026-11-01 :**

| Mesure | Résultat |
|--------|----------|
| Heures de pêche apparente (navires émettant en AIS) | 4 158 h : 858 en août, 1 018 en septembre, 2 281 en octobre |
| Navires distincts | 10 : 9 chalutiers, 1 thonier senneur |
| Pavillons | Chine 2 596 h, Maroc 1 429 h, Panama 133 h |
| Détections radar | 1 110 |
| Quota restant affiché après l'essai | 49 921 requêtes sur 50 000 pour la journée |

À comparer aux réseaux AIS communautaires, qui ne reçoivent rien dans ces eaux (5.1) : ce service s'appuie sur l'AIS reçu par satellite.

**Ce qu'il n'apporte pas :** le temps réel (effort et présence publiés jusqu'à 96 heures avant le présent, radar jusqu'à 5 jours) ; les pirogues sans AIS ; une preuve d'infraction (l'effort est estimé par un modèle, une autorisation publique ne prouve pas la conformité).

**Correspondance avec les besoins du chantier :**

| Besoin | Ce que l'API fournit | Limite |
|--------|----------------------|--------|
| Zones d'heures de pêche, filtre temporel | Rapport par zone ou par polygone : heures par maille, par jour, mois ou année, par pavillon, engin ou navire ; tuiles de carte de chaleur | Navires AIS seulement ; retard de 96 heures |
| Fiche d'identité d'un navire | Identité croisée : registres publics (nom, pavillon, numéro OMI, indicatif, engins, longueur, jauge, propriétaires, autorisations) et identité déclarée par AIS | Aucun champ « exploitant » repéré ; registres publics seulement |
| Navires sans AIS | Détections radar et optiques par maille | Passages de satellites ; petites embarcations peu détectées |
| Signaux à contrôler | Évènements (pêche, rencontres en mer, stationnement prolongé, escales, interruptions d'AIS) et indicateurs par navire (liste de pêche illicite, pêche en aire protégée) | Jeu des interruptions en statut prototype ; indices, pas preuves |
| Rapports à la demande | Rapport CSV ou JSON par zone et par période | Un seul rapport à la fois par jeton |

**Conditions d'usage (page « License and Rate Limits », lue le 2026-11-24) :**

- usage non commercial seulement, licence CC BY-NC 4.0 : l'application ne doit pas viser, à titre principal ou substantiel, un avantage commercial ou une rémunération ; l'éditeur peut retirer l'accès à tout moment, notamment s'il juge l'usage contraire à cette restriction ;
- aucun cas particulier lu pour une administration, ni pour un prestataire privé qui l'équipe ; aucune procédure de licence commerciale sur les pages lues (la foire aux questions de l'éditeur renvoie à une demande au cas par cas) ;
- jeton interdit dans une interface web publique : appels depuis le serveur seulement ;
- mention « Powered by Global Fishing Watch. » avec lien sur chaque écran qui affiche ces données ; nom et logo de l'éditeur non utilisables sans accord écrit ;
- 50 000 requêtes par jour et 1 500 000 par mois, tous jetons confondus ; au-delà, blocage de 24 heures ou de 30 jours ;
- compte à ouvrir au nom d'une organisation qui soutient l'usage durable des ressources marines ; l'éditeur peut demander une déclaration d'usage.

**Conséquence :** CBM-PIGAP est exploitée commercialement (licences et abonnements payants, `docs/modele-economique.md`). L'affichage de ces données dans la plateforme en service demande un accord écrit préalable de l'éditeur. La décision et la démarche reviennent au porteur. L'architecture proposée et les options sont dans l'[ADR-011](adr/ADR-011-global-fishing-watch-source-differee.md).

**État de la clé dans le projet :** la ligne ajoutée au fichier d'environnement porte un nom qu'aucun réglage ne lit ; elle est sans effet et n'empêche pas le démarrage. Le nom prévu est `GFW_API_TOKEN` (ADR-011).

**Ce que le concept inspire, avec ou sans ce service :** la fiche d'identité à deux volets (registre, suivi), la carte des heures de pêche par maille avec filtre temporel et le rapport de zone se construisent d'abord sur les données de la plateforme (registre, positions de l'application et des balises, captures déclarées), qui sont les seules à couvrir les pirogues. Les données de l'éditeur complètent le tableau pour les navires industriels.

## 6. Ce qui revient au porteur

1. Commit, fusion vers `main` et mise en ligne des lots 0 et 0 bis.
2. Sort des comptes de démonstration : leurs mots de passe sont lisibles dans le dépôt public (`backend/scripts/seed_production_demo.py`) ; leur présence en ligne n'a pas été testée.
3. Global Fishing Watch : accord de l'éditeur et titulaire du compte avant toute mise en service (le porteur s'en charge).
4. Demande d'accès à Skylight et candidature à une station AIS, par l'administration ou Kimba Connect.
5. Règles « Proposé » de la section 3 avant la mise en service des lots 2, 5, 6 et 7.
6. Régularisation de l'imagerie satellitaire (clé ou autre fournisseur).
7. Bannières photographiques du portail : maintenues par décision du 2026-11-24.

## 7. Sources

- Fonds de carte : [CARTO, FAQ](https://docs.carto.com/faqs/carto-basemaps), [CARTO, conditions](https://www.carto.com/legal/basemap-terms/), [OpenFreeMap](https://openfreemap.org/), [OpenFreeMap, conditions](https://openfreemap.org/tos/)
- Hébergement : [Vercel, déploiement en pause](https://vercel.com/kb/guide/why-is-my-account-deployment-blocked)
- Surveillance : [Skylight](https://www.skylight.global/), [Allen Institute for AI](https://allenai.org/skylight), [publication](https://arxiv.org/abs/2312.03207), [Global Fishing Watch, usage commercial](https://globalfishingwatch.org/faqs/can-i-use-global-fishing-watch-apis-for-commercial-purposes/), [Maritime Executive, suivi radiofréquence](https://maritime-executive.com/article/satellite-rf-tracking-follows-the-dark-ships-that-ais-can-t-see)
- Global Fishing Watch : [licence et limites](https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits), [authentification](https://globalfishingwatch.org/our-apis/documentation/docs/authentication), [rapports et carte](https://globalfishingwatch.org/our-apis/documentation/docs/v3/4wings), [navires](https://globalfishingwatch.org/our-apis/documentation/docs/v3/vessels), [évènements](https://globalfishingwatch.org/our-apis/documentation/docs/v3/events), [mises en garde](https://globalfishingwatch.org/our-apis/documentation/docs/v3/general-api-doc/data-caveats)
- Liaison directe : [Via Satellite](https://www.satellitetoday.com/connectivity/2025/12/17/airtel-africa-partners-with-starlink-for-direct-to-cell-service/), [Connecting Africa](https://www.connectingafrica.com/connectivity/airtel-africa-starlink-launch-satellite-to-mobile-service-in-drc)
