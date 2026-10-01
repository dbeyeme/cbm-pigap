# Offre commerciale et modèle économique PIGAP

> Version 3 du 2026-10-01, en réponse à l'évaluation Kimba Connect (offre commerciale 6/10, modèle économique « à approfondir »).
> Document de travail : tarifs, scénarios et engagements sont des projets soumis à validation humaine avant toute diffusion.
> **Cohérence code** : la grille tarifaire est celle du catalogue `backend/app/modules/abonnements/catalog.py`. Toute modification de prix se fait d'abord ici, puis dans le catalogue.
> Devise : FCFA (XAF), parité fixe 1 EUR = 655,957 FCFA. Montants en USD indicatifs. Sauf mention contraire, les prix B2B sont hors taxes et les prix pêcheurs toutes taxes comprises.

---

## 0. L'offre en une page

| Pour qui | Ce que vous obtenez | Prix | Comment vous payez |
|---|---|---|---|
| **Ministère, DGPA, autorité de contrôle** | Registre national, carte en temps réel (GPS et AIS), zones et limites, quotas avec alerte à 90 %, alertes automatiques, tableau de bord, rapports, hébergement, support, formation annuelle, jusqu'à 50 comptes | 25 000 000 FCFA HT par an, ou 2 500 000 FCFA HT par mois | Licence institutionnelle, commande publique ou programme bailleur |
| **Coopérative, fédération, armateur** | Portail flotte, suivi de toutes les embarcations, dossiers de licence des membres, alertes, exports, abonnement de chaque membre inclus | 1 500 000 FCFA HT par an jusqu'à 10 embarcations, puis 120 000 FCFA HT par embarcation et par an | Abonnement flotte, virement ou Mobile Money |
| **Pêcheur indépendant** | Demande de licence en ligne, déclarations et suivi GPS même sans réseau, bulletin de mer, alertes de danger, attestations | 30 000 FCFA TTC par an, ou 3 000 FCFA TTC par mois | Mobile Money, dépôt depuis son propre numéro |
| **Bailleur, ONG, chercheur** | Rapports de pilotage, études à façon, données anonymisées | Sur devis ; données gratuites pour les institutions publiques gabonaises | Convention |
| **Tout client** | Déploiement terrain, formation, récepteurs AIS portuaires, support de niveau 2 | À la journée ou au forfait | Prestation |

En une phrase : **l'État achète un outil de contrôle et de pilotage ; les organisations achètent la visibilité de leur flotte et la conformité de leurs membres ; les pêcheurs achètent un dossier et une sécurité ; les équipements physiques restent hors de la licence logicielle.**

---

## 1. Pourquoi maintenant

| Fait | Valeur | Source |
|---|---|---|
| Demande nationale de poisson | environ 70 000 tonnes par an | [Invest-Time, 26 juin 2024](https://invest-time.com/2024/06/26/gabon-la-strategie-pour-atteindre-une-production-de-50-000-tonnes-de-poissons-dici-2025/) |
| Production locale | 40 000 à 50 000 tonnes | même source |
| Importations | 25 000 à 26 000 tonnes par an, environ 15,5 milliards FCFA | même source |
| Consommation par habitant | 40 kg par an, première d'Afrique centrale (FAO) | [Gabon Media Time](https://gabonmediatime.com/afrique-centrale-le-gabon-premier-consommateur-de-poisson-de-la-sous-region/) |
| Objectif public | 50 000 tonnes de production nationale | Invest-Time, source ci-dessus |
| Bilan Gab Pêche après un an | sur 20 pirogues livrées, 10 encore actives en mai 2026 ; difficultés de chaîne du froid, de maintenance, de carburant, de débouchés et d'organisation collective | [Direct Infos Gabon, 29 septembre 2026](https://directinfosgabon.com/gab-peche-un-an-apres-pourquoi-le-projet-prend-leau/) |

Deux enseignements structurent l'offre :

1. L'État a un objectif chiffré de production et un déficit à réduire : il a besoin de **données fiables sur l'effort de pêche, les captures et les débarquements** pour piloter. C'est la valeur de la licence institutionnelle.
2. Distribuer des équipements sans organisation ni suivi ne suffit pas, comme le montre Gab Pêche. PIGAP vend donc **le logiciel avec l'accompagnement et des indicateurs de résultat** (déclarations, débarquements, conformité), pas seulement un accès.

---

## 2. Marché adressable, chiffres sourcés

### 2.1 Flotte et pêcheurs

| Indicateur | Valeur | Source |
|---|---|---|
| Pêche artisanale maritime | environ 1 500 embarcations, près de 5 000 pêcheurs, pratique de 1 à 3 milles marins | [Ministère, fiche « La pêche artisanale au Gabon »](https://www.agriculture.gouv.ga/object.getObject.do?id=249) |
| Part de non-nationaux dans la pêche maritime | 75 % | même source |
| Pêche continentale | environ 3 500 pêcheurs, 1 842 pirogues | [FAO, Contribution de la pêche au Gabon, 2005](https://www.fao.org/fishery/docs/DOCUMENT/sflp/SFLP_publications/French/Contribution_peche_Gabon_juin05.pdf) |
| Recensement FAO 2005 | 1 564 pirogues maritimes dont 1 178 motorisées | même source |
| Balises NEMO | programme lancé en 2021, objectif d'équiper environ 1 000 pirogues | [Gabonreview](https://www.gabonreview.com/peche-artisanale-le-gabon-leader-mondial-en-matiere-de-surveillance/) |
| Gab Pêche | 20 pirogues en pilote, 700 prévues, 500 emplois attendus, secteur à 1,5 % du PIB | [Gabonreview, 11 août 2025](https://www.gabonreview.com/gab-peche-le-gabon-mise-sur-la-souverainete-alimentaire-et-la-gabonisation-de-la-peche-artisanale/) |

Cœur de cible logiciel : **1 500 à 2 200 embarcations maritimes** et **8 500 pêcheurs** toutes pêches confondues. Les chiffres de flotte datent pour partie de 2005 : un recensement DGPA à jour est la première donnée à obtenir en Phase 3.

### 2.2 Redevances officielles, point d'ancrage des prix

| Redevance | Montant | Source |
|---|---|---|
| Carte de pêcheur artisanal | 10 000 FCFA par an | [Ministère, procédures d'acquisition des autorisations et cartes](https://www.agriculture.gouv.ga/object.getObject.do?id=245) |
| Autorisation de pêche artisanale maritime, nationaux | 100 000 FCFA | même source |
| Autorisation, non-nationaux (autres techniques) | 150 000 FCFA | même source |
| Autorisation senne (« tiré-tiré ») | 200 000 FCFA | même source |
| Autorisation pêche continentale | 50 000 FCFA | même source |

Un pêcheur maritime paie déjà 110 000 à 210 000 FCFA de redevances. L'abonnement annuel PIGAP à 30 000 FCFA représente **14 à 27 % de cette charge** et trois fois la carte annuelle. Niveau jugé acceptable si l'abonnement est adossé au renouvellement de la licence ; hypothèse à mesurer en pilote (section 10).

### 2.3 Paiement mobile, le canal B2C existe

| Indicateur | Valeur | Source |
|---|---|---|
| Comptes de monnaie électronique, fin 2024 | 4,5 millions, +27 % sur un an | [Gabonreview](https://www.gabonreview.com/mobile-money-plus-de-4-000-milliards-fcfa-sur-la-valeur-des-transactions-en-2024/) |
| Comptes actifs, deuxième trimestre 2025 | 1 703 860, +3 % sur le trimestre | [Gabonreview](https://www.gabonreview.com/gabon-croissance-du-chiffre-daffaires-et-hausse-des-souscripteurs-dans-le-mobile-money-au-t2-2025/) |
| Comptes et comptes actifs sur 2025 | +32 % sur un an ; chiffre d'affaires du secteur +16,9 % | [Gabon Media Time](https://gabonmediatime.com/gabon-mobile-money-affiche-un-chiffre-daffaires-de-169-en-2025/) |
| Transactions 2024 | 368,3 millions d'opérations, 4 087 milliards FCFA | [Gabon Media Time](https://gabonmediatime.com/gabon-le-mobile-money-franchit-le-cap-des-50-milliards-de-fcfa-de-chiffre-daffaires-en-2024/) |
| Abonnements mobiles, septembre 2024 | 3 207 794 ; Moov 51,41 %, Airtel 48,59 % | [ARCEP, observatoire mobile](https://www.arcep.ga/uploads/observatoires/mobile/Mobile%202024-1.pdf) |
| Frais d'encaissement pawaPay, dépôt Airtel Money Gabon | 2 % hors taxes (1 % opérateur + 1 % pawaPay), à la charge du marchand | [pawaPay, grille de frais](https://www.pawapay.io/fees) |

L'encaissement B2C est opérationnel sur Airtel Money (dépôt initié depuis le numéro enregistré de l'acteur, livré le 2026-09-21). Moov Money, dont l'opérateur détient la moitié des abonnements mobiles, reste à raccorder : prérequis de la Phase 4.

### 2.4 Organisations et points d'entrée terrain

- Centres communautaires des pêches : Owendo, Port-Gentil, Omboué, Lambaréné ; cinq centres d'appui en construction avec la FAO, dont Cocobeach et Mayumba pour la pêche maritime ([FAO Gabon](https://www.fao.org/gabon/actualites/detail-events/en/c/1606251/)).
- Coopératives identifiées : coopérative des pêcheurs artisanaux du Cap Lopez « Gbenodou », soutenue par Perenco ([Gabon Media Time](https://gabonmediatime.com/port-gentil-perenco-oil-gas-soutien-cooperative-des-pecheurs-artisanaux-cap-lopez/)) ; Fédération des coopératives de pêche de Mayumba, équipée par BW Energy ([Gabon Media Time](https://gabonmediatime.com/bw-energy-gabon-les-pecheurs-de-mayumba-desormais-equipes-en-materiel-professionnel/)).
- Le nombre total d'organisations professionnelles n'est pas publié : à obtenir auprès de la DGPA.

### 2.5 Financements publics et bailleurs actifs

| Dispositif | Montant ou nature | Source |
|---|---|---|
| Projet d'appui au secteur pêche et aquaculture (BAD) | 11,354 milliards FCFA | [FAO Gabon](https://www.fao.org/gabon/actualites/detail-events/en/c/1606251/) |
| Convention ministère de la Mer et BCEG | 25 milliards FCFA, 30 avril 2026 | [Gabonactu](https://gabonactu.com/blog/2026/05/02/economie-bleue-un-partenariat-pour-faciliter-le-financement-des-filieres-halieutiques/) |
| Assistance technique Banque mondiale (PROBLUE), gouvernance des pêches maritimes | restitution le 25 février 2026 | [Gabonreview](https://www.gabonreview.com/peche-artisanale-le-gabon-lance-un-vaste-chantier-de-reforme-avec-la-banque-mondiale/) |
| BCEG et SGDEB, premières pirogues financées | 200 millions FCFA, 10 pirogues motorisées, août 2025 | [Infos Gabon](https://fr.infosgabon.com/gabon-la-bceg-et-la-sgdeb-unissent-leurs-forces-pour-moderniser-la-peche-artisanale/) |

La composante « système d'information » d'un programme bailleur est le véhicule naturel de la licence institutionnelle ; les partenariats RSE des opérateurs pétroliers avec les coopératives sont un véhicule pour les abonnements flotte.

### 2.6 Références comparables

| Solution | Modèle | Enseignement pour PIGAP |
|---|---|---|
| Abalobi (Afrique du Sud) : applications pêcheur, contrôle, place de marché, coopérative | application gratuite financée par des fondations et bailleurs ; 38 collectifs soutenus, plus de 2 millions USD reversés aux communautés | la gratuité pour le pêcheur est possible si un tiers paie ; PIGAP retient un modèle hybride où l'État et les bailleurs financent la plateforme et où l'abonnement pêcheur reste bas ([FAO STI portal](https://sti-portal.fao.org/innovations/abalobi), [ORRAA](https://oceanriskalliance.org/project/powering-sustainable-fishing-through-community-led-technology/)) |
| CLS NEMO (Gabon) | balises satellitaires fournies dans un programme d'État | PIGAP est la couche métier (licences, captures, quotas, alertes), capable d'ingérer les positions de balises (`source=balise`) ; pas un concurrent matériel |

---

## 3. Proposition de valeur par segment

| Segment | Problème aujourd'hui | Ce que PIGAP apporte | Preuve dans le produit |
|---|---|---|---|
| Autorité | Registre papier, pas de vue en temps réel, quotas non suivis, zones difficiles à contrôler, objectif de 50 000 tonnes sans mesure fiable | Registre numérique et numérotation automatique, carte temps réel, quotas avec alerte à 90 %, alertes zones, limites et concentration, rapports PDF et CSV, séries temporelles | Modules M1 à M7 en production, AIS, météo-marine, prédictions consultatives |
| Organisation professionnelle | Flotte invisible, conformité des membres non prouvée, reporting manuel | Portail flotte, suivi multi-embarcations, dossiers de licence des membres, alertes, exports | Portail organisation, licence flotte avec règle anti double facturation |
| Pêcheur | Démarches longues, aucune trace des déclarations, risques en mer, réseau faible | Demande de licence en ligne, déclarations et positions hors-ligne, bulletin de mer, alertes de danger, paiement depuis son numéro | Application mobile avec files SQLite captures et positions |
| Bailleurs, chercheurs, ONG | Données éparses, non standardisées | Séries temporelles, exports, données anonymisées, indicateurs de résultat | Rôle chercheur, exports, rapports |

---

## 4. Catalogue d'offres, cinq composantes (termes de référence, section 11)

### 4.1 Abonnement des organisations professionnelles : licence Flotte

| Formule | Prix HT | Périmètre |
|---|---|---|
| Base mensuelle | 150 000 FCFA par mois | jusqu'à 10 embarcations, 5 comptes, modules registre, GPS, captures, tableau de bord, documents, alertes |
| Base annuelle | 1 500 000 FCFA par an | identique, deux mois offerts |
| Embarcation supplémentaire | 12 000 FCFA par mois ou 120 000 FCFA par an | logiciel seul |

Inclus : l'abonnement pêcheur de chaque membre (règle anti double facturation, implémentée), le portail organisation, l'assistance à distance.

Exemple : une coopérative de 20 pirogues paie 270 000 FCFA HT par mois ou 2 700 000 FCFA HT par an, soit 135 000 FCFA par pirogue et par an, 4,5 fois l'abonnement individuel. L'écart se justifie par le portail, le reporting de flotte et les comptes gestionnaires, mais une coopérative pourrait préférer des abonnements individuels. Ce point de prix est à confronter au terrain (section 13).

### 4.2 Licences institutionnelles : licence Autorité

| Formule | Prix HT | TTC (TVA 18 %) | Inclus |
|---|---|---|---|
| Mensuelle | 2 500 000 FCFA par mois | 2 950 000 FCFA | portail autorités jusqu'à 50 comptes, modules M1 à M7, AIS, météo-marine, prédictions, hébergement, sauvegardes, support de niveau 1 cinq jours sur sept, une formation par an |
| Annuelle | 25 000 000 FCFA par an | 29 500 000 FCFA | identique, deux mois offerts |

Options : comptes au-delà de 50 à 25 000 FCFA HT par compte et par mois ; flux AIS satellitaire premium à 8 000 000 FCFA HT par an ; fusion radar ou centre de contrôle sur devis ; marché d'équipement balises en pass-through avec marge d'intégration de 8 à 12 %.

**Licence territoriale** (direction provinciale, parc national, autorité portuaire) : périmètre géographique restreint, dérivée de la licence Autorité. Prix non fixé ; proposition de travail : un tiers de la licence nationale. À valider avec le premier prospect.

**Voie de commande publique.** L'arrêté n° 008.24/MEP du 23 février 2024 fixe le seuil des marchés de fournitures de l'État à 35 000 000 FCFA TTC ([Miranda, actualités juridiques mai 2024](https://mirandalawfirm.com/download/2499/d5ec70f2429bbe5cefc7ebccb9bfdee6/Gabon%20-%20Actualit%C3%A8s%20Juridiques%20-%20Mai%202024.docx.pdf)). La licence annuelle à 29 500 000 FCFA TTC se situe sous ce seuil, ce qui ouvre une procédure allégée, à confirmer avec la Direction générale des marchés publics. Le décret n° 0053/PR/MEP du 21 novembre 2023 réserve les procédures jusqu'à 150 millions FCFA aux PME contrôlées par des ressortissants gabonais ([Journal officiel](https://journal-officiel.ga/20472-0053-pr-mep-/)) : un atout si la structure porteuse remplit ce critère.

**Clauses essentielles du contrat Autorité** (projet) : propriété des données par l'État ; hébergement et sauvegardes avec engagement de disponibilité de 98 % en pilote (cahier, section 10) ; réversibilité avec export complet ; conformité à la loi n° 001/2011 sur la protection des données à caractère personnel et déclaration des traitements auprès de l'autorité de protection (CNPDCP devenue APDPVP, [Gabon Media Time](https://gabonmediatime.com/gabon-cnpdcp-transformee-autorite-pour-protection-des-donnees-caractere-personnel-vie-privee/)) ; formation annuelle incluse.

### 4.3 Partenariats public-privé

1. **Composante numérique d'un programme bailleur.** PIGAP est inscrit comme système d'information d'un projet existant (BAD, Banque mondiale, FAO, AFD). Le bailleur finance la licence Autorité pluriannuelle et le déploiement ; l'État reprend la licence en fin de programme. Encaissement sécurisé sur trois à cinq ans.
2. **Partenariat RSE avec les opérateurs industriels du littoral.** Perenco (Cap Lopez) et BW Energy (Mayumba) soutiennent déjà des coopératives en matériel. Le partenaire finance la licence Flotte et l'équipement de la coopérative ; PIGAP assure le déploiement et le reporting d'impact (tonnes débarquées, déclarations, conformité).
3. **Concession de service numérique.** Contrat de service pluriannuel entre l'État et PIGAP sur la base de la licence Autorité, avec engagements de disponibilité et de formation, en complément du programme NEMO.

### 4.4 Services de suivi et d'analyse des données

| Service | Contenu | Tarif proposé HT |
|---|---|---|
| Rapport périodique de pilotage | bulletin mensuel ou trimestriel : effort de pêche, captures par espèce et zone, alertes, pression sur quotas, indicateurs de la stratégie 50 000 tonnes | inclus dans la licence Autorité ; 250 000 FCFA par rapport pour un tiers |
| Étude à façon | analyse d'une zone, d'une saison ou d'une espèce, méthode et limites documentées | sur devis, base 150 000 FCFA par jour d'analyste |
| Accès données pour la recherche | exports anonymisés et agrégés, documentation des séries | gratuit pour les institutions publiques gabonaises, convention pour les autres |

Tarifs proposés ; aucun contrat de ce type n'a encore été conclu.

**Recouvrement dématérialisé des redevances (ajout du 2026-10-01).** Le rapport d'étude NTSAGUI-2026-PGH-001 documente, pour le seul Grand Libreville, 382 autorisations pour 48,1 millions FCFA en 2024, 524 pour 67,4 millions FCFA en 2025, et une taxe à la production de 53,26 millions FCFA sur 5 294 tonnes en 2024. PIGAP calcule désormais cette taxe à la déclaration, émet les quittances et encaisse par Mobile Money. Un service de recouvrement pour le compte du Trésor peut être proposé à l'Autorité, rémunéré au forfait dans la licence ou par une commission sur les montants collectés ; le taux n'est pas fixé et relève d'une convention avec le ministère et le Trésor (hypothèse à valider, section 13).

### 4.5 Accompagnement des acteurs

| Service | Contenu | Tarif proposé HT |
|---|---|---|
| Déploiement terrain | enrôlement des pêcheurs, installation de l'application, saisie des équipements, premiers relevés | 100 000 FCFA par journée, hors déplacement |
| Formation | agents de contrôle, gestionnaires de coopérative, formateurs relais | 150 000 FCFA par journée, groupes de 12 |
| Support de niveau 2 et astreinte alertes | traitement des alertes critiques hors heures ouvrées | forfait mensuel à définir avec la licence Autorité |
| Récepteurs AIS portuaires | fourniture, pose et raccordement d'un récepteur VHF par port, ingestion déjà implémentée | devis matériel plus une journée de pose |

Tarifs proposés, à confronter aux grilles de journée pratiquées localement.

### 4.6 Abonnement pêcheur indépendant

| Formule | Prix TTC | Hors TVA (18 %) | Net après frais pawaPay (2 % du TTC) |
|---|---|---|---|
| Mensuel | 3 000 FCFA | 2 542 FCFA | 2 482 FCFA |
| Annuel | 30 000 FCFA | 25 424 FCFA | 24 824 FCFA |

Le dépôt est initié depuis le numéro de téléphone enregistré du pêcheur ; un agent peut autoriser un payeur tiers, tracé dans le paiement. Pendant la Phase 3, l'abonnement n'est pas exigé.

---

## 5. Logique de prix

- **Pêcheur** : trois fois la carte annuelle, moins d'un cinquième des redevances d'autorisation. Le mensuel sert d'entrée, l'annuel est la cible.
- **Flotte** : prix par embarcation décroissant avec la taille, pour que la coopérative enrôle toute sa flotte.
- **Autorité** : 25 000 000 FCFA HT par an couvre l'hébergement, le support et une part des services d'analyse ; montant sous le seuil des marchés de fournitures de l'État, donc commandable par procédure allégée.
- **Transparence** : les coûts physiques (balises, satellite, radar) sont toujours facturés à part.
- **Fiscalité** : taux normal de TVA de 18 % ([DGI](https://www.dgi.ga/761-entreprises/773-taxe-sur-la-valeur-ajoutee/)). La loi de finances rectificative 2026 soumet à la TVA gabonaise les abonnements numériques fournis depuis l'étranger ([Direct Infos Gabon](https://directinfosgabon.com/tva-a-18-les-plateformes-numeriques-etrangeres-desormais-dans-le-viseur-du-fisc-gabonais/)) : facturer depuis une entité établie au Gabon est la voie simple et un argument de préférence locale.

---

## 6. Structure de coûts

### 6.1 Coûts sourcés (plateforme actuelle)

| Poste | Référence publique | Coût |
|---|---|---|
| Hébergement API et base PostGIS | [Railway, plan Pro](https://railway.com/pricing) : 20 USD par mois avec 20 USD d'usage inclus, puis 10 USD par Go de mémoire et 20 USD par vCPU par mois | 20 à 100 USD par mois selon la charge |
| Portail web | [Vercel, plan Pro](https://vercel.com/pricing) : 20 USD par membre et par mois, 1 To de transfert inclus | 20 USD par mois |
| Données météo-marine | Open-Meteo, CC BY 4.0, sans clé (ADR-008) | 0 |
| Flux AIS communautaire | AISStream, clé gratuite (ADR-005) ; couverture nulle au Gabon mesurée le 2026-09-20 | 0 |
| Encaissement Mobile Money | pawaPay, 2 % des dépôts | 2 % du chiffre d'affaires B2C |

Au niveau d'activité du pilote, l'infrastructure logicielle coûte **moins de 150 USD par mois**, soit moins de 100 000 FCFA. Le coût de la plateforme est dominé par les personnes.

### 6.2 Coûts à chiffrer localement (hypothèses de travail)

| Poste | Hypothèse | À confirmer par |
|---|---|---|
| Équipe d'exploitation : développement, support, animation terrain | 2 à 3 équivalents temps plein en Phase 4 | grille salariale de la structure |
| Hébergement souverain ou région Afrique, sauvegardes, reprise d'activité | 0,8 à 2,5 millions FCFA par mois (version 1) | devis hébergeurs |
| Conformité protection des données : déclaration des traitements, registre, procédures | quelques jours de conseil juridique | conseil local |
| Récepteur AIS portuaire | matériel grand public (clé SDR, antenne VHF, mini-ordinateur) | devis fournisseur |
| Balise hybride cellulaire et satellite | 300 000 à 450 000 FCFA de matériel, 150 000 à 250 000 FCFA d'airtime par an (version 1) | devis CLS ou équivalent |
| Flux AIS satellitaire premium | 5 à 40 millions FCFA par an (version 1) | devis Spire, exactEarth, CLS |

Les fourchettes de la version 1 sont des estimations de travail, non des devis : à remplacer par des devis avant tout engagement.

---

## 7. Équation économique

Tous les montants sont hors taxes ; le B2C est converti hors TVA et net des frais d'encaissement (24 824 FCFA par abonnement annuel).

### 7.1 Scénario de base, première année après pilote

Hypothèses : 1 licence Autorité annuelle, 2 coopératives de 15 embarcations, 300 pêcheurs indépendants en formule annuelle, 20 journées d'accompagnement, pas de satellite ni de balises.

| Source | Chiffre d'affaires annuel HT |
|---|---|
| Licence Autorité | 25 000 000 FCFA |
| 2 licences Flotte (base + 5 supplémentaires chacune) | 4 200 000 FCFA |
| 300 pêcheurs (net) | 7 450 000 FCFA |
| Accompagnement, 20 journées | 2 000 000 à 3 000 000 FCFA |
| **Total** | **38 à 40 millions FCFA** |

Charges cibles (équipe, hébergement, support, conformité, sans parc de balises) : 20 à 30 millions FCFA. Résultat positif mais mince : le modèle tient à condition d'encaisser la licence Autorité.

### 7.2 Scénarios encadrants

| Scénario | Hypothèses | Chiffre d'affaires annuel HT |
|---|---|---|
| Pessimiste | licence Autorité mensuelle sur six mois, 1 coopérative de 10 embarcations, 80 pêcheurs, 10 journées | 18 à 20 millions FCFA |
| Base | section 7.1 | 38 à 40 millions FCFA |
| Optimiste | licence Autorité annuelle avec satellite premium, 5 coopératives de 20 embarcations, 700 pêcheurs, 40 journées | 65 à 70 millions FCFA, hors pass-through matériel |

### 7.3 Trajectoire à trois ans (hypothèses de planification)

| Année | Hypothèses | Chiffre d'affaires HT |
|---|---|---|
| Année 1 | scénario de base | 38 à 40 millions FCFA |
| Année 2 | licence Autorité reconduite, 1 licence territoriale (un tiers de la nationale), 4 coopératives de 10 embarcations, 500 pêcheurs, Moov Money raccordé, 30 journées | 55 à 57 millions FCFA |
| Année 3 | idem plus satellite premium, 6 coopératives de 10 embarcations, 800 pêcheurs, 40 journées, quatre rapports vendus à des tiers | 75 à 78 millions FCFA |

Ces trajectoires supposent un taux de renouvellement de 70 % et seront révisées après le pilote.

### 7.4 Point mort et sensibilité

- Sans licence Autorité, couvrir 20 millions FCFA de charges exigerait environ 800 pêcheurs annuels ou 14 coopératives de 10 embarcations : irréaliste la première année. **La vente institutionnelle est la priorité commerciale.**
- Le B2C est peu sensible au prix unitaire et très sensible au renouvellement : chaque point de désabonnement sur 300 pêcheurs représente environ 75 000 FCFA HT.
- Les frais d'encaissement (2 %) sont marginaux ; la TVA (18 %) pèse davantage sur le B2C et justifie de présenter les prix pêcheurs toutes taxes comprises.
- Le vrai coût du B2C est l'enrôlement terrain, d'où la composante accompagnement facturée.

---

## 8. Mise sur le marché par phase

| Phase | Monétisation | Actions |
|---|---|---|
| Phase 3, expérimentation terrain (en préparation) | gratuite ou subventionnée | une zone pilote (Owendo ou Port-Gentil), 50 à 100 pêcheurs enrôlés via un centre communautaire des pêches et une coopérative, mesure des indicateurs du cahier section 10 et du consentement à payer |
| Phase 4, déploiement | licence Autorité d'abord, puis Flotte et B2C annuel | commande publique allégée ou inscription dans un programme bailleur, raccordement Moov Money, formation des agents, récepteurs AIS dans deux ports |
| Extension | services d'analyse, licence territoriale, partenariats RSE | parcs nationaux, autorités portuaires, autres pays de la sous-région (plateforme paramétrée par fichiers de données, zone de veille golfe de Guinée) |

Canaux : DGPA et directions provinciales ; centres communautaires des pêches ; coopératives et fédérations ; unités de gestion des projets bailleurs ; programmes RSE des opérateurs industriels.

---

## 9. Plan commercial à douze mois

| Mois | Jalon | Résultat attendu |
|---|---|---|
| 1 à 2 | Convention de pilote avec la DGPA et un centre communautaire des pêches ; déclaration des traitements de données | pilote autorisé, cadre juridique en place |
| 2 à 4 | Enrôlement de 50 à 100 pêcheurs et d'une coopérative ; formation de 5 agents ; récepteur AIS sur le port pilote | données réelles, premiers rapports mensuels |
| 4 à 6 | Enquête de consentement à payer ; bilan intermédiaire chiffré (déclarations, débarquements, alertes) | prix B2C et Flotte confirmés ou ajustés |
| 5 à 7 | Dossier de licence Autorité (procédure allégée ou programme bailleur) ; raccordement Moov Money | première commande institutionnelle |
| 7 à 9 | Conversion des pêcheurs pilotes en abonnés annuels ; signature de 2 coopératives | premiers encaissements B2C et Flotte |
| 9 à 12 | Proposition de partenariat RSE à un opérateur du littoral ; rapport annuel au ministère | pipeline année 2 |

---

## 10. Indicateurs commerciaux à mesurer dès le pilote

| Indicateur | Cible de travail | Pourquoi |
|---|---|---|
| Consentement à payer déclaré | au moins 50 % acceptent 30 000 FCFA par an adossés à la licence | valide le prix B2C |
| Conversion gratuit vers payant en fin de pilote | 30 % | base du scénario pessimiste |
| Renouvellement annuel | 70 % | hypothèse des trajectoires |
| Délai moyen d'encaissement Mobile Money | moins de 5 minutes | parcours de paiement |
| Coût d'enrôlement par pêcheur | moins de 10 000 FCFA | dimensionne l'accompagnement |
| Usage effectif : au moins une déclaration par semaine | 70 % des pêcheurs pilotes (cahier, section 10) | preuve de valeur pour l'Autorité |
| Débarquements déclarés sur la zone pilote | tendance mesurable mois après mois | indicateur de résultat attendu par l'État |

Cibles de pilotage, pas engagements.

---

## 11. Risques et parades

| Risque | Parade |
|---|---|
| Décision institutionnelle lente | entrer par un programme bailleur ou un partenariat RSE ; licence mensuelle pour démarrer ; montant sous le seuil des marchés |
| Pêcheurs non-nationaux (75 % de la flotte maritime) réticents à l'enrôlement | abonnement adossé au renouvellement de la licence, intérêt direct (dossier, attestation, sécurité en mer) |
| Couverture réseau faible | fonctionnement hors-ligne des captures et des positions, synchronisation différée |
| Équipements distribués sans suivi (leçon Gab Pêche) | accompagnement facturé, indicateurs de résultat, reporting aux financeurs |
| Chevauchement avec NEMO | couche métier complémentaire, ingestion des balises prévue |
| Dépendance à un seul opérateur de paiement | raccorder Moov Money avant la Phase 4 |
| Protection des données personnelles (positions, identités) | déclaration des traitements, minimisation, droits d'accès, données anonymisées pour les tiers |
| Désabonnement | formule annuelle, relances avant échéance, services inclus pour les coopératives |

---

## 12. Réponse aux critères de l'évaluation

| Critère du jury | Note | Ce que cette version apporte |
|---|---|---|
| Offre commerciale (6/10) | « à approfondir » | offre en une page, catalogue en cinq composantes conforme aux termes de référence, prix ancrés sur les redevances officielles, voie de commande publique identifiée, services et accompagnement tarifés |
| Modèle économique | « à approfondir » | coûts sourcés, coûts à chiffrer listés, scénarios hors taxes, trajectoire à trois ans, point mort, plan commercial à douze mois |
| Maturité du projet (2/5) | | plateforme en production, paiement opérationnel, plan de pilote avec indicateurs de résultat ; la preuve terrain reste à produire en Phase 3 |
| Pertinence (5/10) | | ancrage sur le déficit halieutique, l'objectif de 50 000 tonnes, les dispositifs publics en cours et les leçons de Gab Pêche |
| Adaptation aux réalités locales (15 %) | | hors-ligne, Mobile Money, entité facturant localement, conformité loi n° 001/2011 |

---

## 13. Hypothèses à valider avant engagement

1. Recensement à jour de la flotte et des pêcheurs (DGPA).
2. Nombre et liste des organisations professionnelles de pêcheurs.
3. Consentement à payer des pêcheurs et des coopératives (enquête pilote).
4. Régime fiscal de la structure (TVA, retenues) et forme contractuelle de la licence Autorité, avec la Direction générale des marchés publics.
5. Devis matériels : récepteurs AIS, balises, hébergement souverain.
6. Conditions de raccordement Moov Money et exigences complémentaires d'Airtel Money signalées par pawaPay pour le Gabon.
7. Articulation contractuelle avec le programme NEMO.
8. Positionnement du prix Flotte par rapport à l'abonnement individuel : tester une formule intermédiaire si les coopératives préfèrent le B2C.
9. Procédure de déclaration des traitements auprès de l'autorité de protection des données.
10. Mandat et rémunération d'un service de recouvrement des redevances pour le compte du Trésor (section 4.4).

---

## 14. Références internes

- Cahier MVP section 2.2 (paiement hors périmètre initial) et section 10 (indicateurs) ; écart documenté dans [ADR-007](adr/ADR-007-abonnements-mobile-money.md).
- [ADR-005, AIS open data](adr/ADR-005-ais-zee-gabon-open-data.md) ; [ADR-008, météo-marine](adr/ADR-008-meteo-marine-open-data.md).
- Catalogue d'offres : `backend/app/modules/abonnements/catalog.py` ; modules par formule : `backend/app/modules/abonnements/modules.py`.
- Journal : entrées du 2026-09-21 (paiement depuis le numéro de l'acteur) et du 2026-10-01 (écarts TDR, modèle économique).
