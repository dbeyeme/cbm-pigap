# Offre commerciale et modèle économique PIGAP

> Version 2 du 2026-10-01, en réponse à l'évaluation Kimba Connect (offre commerciale 6/10, modèle économique « à approfondir »).
> Document de travail : les tarifs, scénarios et engagements restent des projets soumis à validation humaine avant toute diffusion.
> **Cohérence code** : la grille tarifaire est celle du catalogue `backend/app/modules/abonnements/catalog.py` (mode Mobile Money `demo` par défaut, `live` via pawaPay). Toute modification de prix se fait d'abord ici, puis dans le catalogue.
> Devise : FCFA (XAF), parité fixe 1 EUR = 655,957 FCFA. Les montants en USD sont indicatifs.

---

## 1. Synthèse

PIGAP est une plateforme logicielle de gestion des activités de pêche : registre, suivi GPS, zones réglementées, captures, quotas, alertes et tableau de bord. Elle se vend à trois clients qui ont des raisons différentes de payer :

| Client | Ce qu'il achète | Canal de paiement |
|---|---|---|
| Autorité (ministère de la Mer, de la Pêche et de l'Économie bleue, DGPA) | Un outil de contrôle et de pilotage national, hébergé et maintenu | Licence institutionnelle annuelle |
| Organisations professionnelles (coopératives, fédérations, armateurs) | Le suivi de leur flotte, la preuve de conformité, le reporting | Abonnement flotte |
| Pêcheurs indépendants | Le dossier de licence, les déclarations et le suivi GPS depuis le téléphone | Abonnement Mobile Money, prélevé depuis le numéro enregistré de l'acteur |

Le modèle couvre les cinq composantes attendues par les termes de référence du défi (section 11) : abonnement des organisations professionnelles, licences institutionnelles, partenariats public-privé, services de suivi et d'analyse des données, accompagnement des acteurs.

Règle structurante : **la licence Autorité finance l'exploitation de la plateforme ; les abonnements flotte et pêcheurs financent l'animation terrain ; les équipements physiques (balises, récepteurs) sont portés par des marchés ou des partenariats, jamais par l'abonnement logiciel.**

---

## 2. Marché adressable, chiffres sourcés

### 2.1 Flotte et pêcheurs

| Indicateur | Valeur | Source |
|---|---|---|
| Pêche artisanale maritime | environ 1 500 embarcations, près de 5 000 pêcheurs, pratique de 1 à 3 milles marins | [Ministère de l'Agriculture, de l'Élevage et de la Pêche, fiche « La pêche artisanale au Gabon »](https://www.agriculture.gouv.ga/object.getObject.do?id=249) |
| Part de non-nationaux dans la pêche maritime | 75 % | même source |
| Pêche continentale | environ 3 500 pêcheurs, 1 842 pirogues | [FAO, Contribution de la pêche au Gabon, 2005](https://www.fao.org/fishery/docs/DOCUMENT/sflp/SFLP_publications/French/Contribution_peche_Gabon_juin05.pdf) |
| Recensement FAO 2005 | 1 564 pirogues maritimes dont 1 178 motorisées | même source |
| Programme de balises NEMO | lancé en 2021, objectif d'équiper l'intégralité de la flotte, soit environ 1 000 pirogues | [Gabonreview, « Le Gabon, leader mondial en matière de surveillance »](https://www.gabonreview.com/peche-artisanale-le-gabon-leader-mondial-en-matiere-de-surveillance/) |
| Programme Gab Pêche | 20 pirogues en phase pilote, 700 pirogues équipées prévues, 500 emplois directs attendus, secteur à 1,5 % du PIB | [Gabonreview, 11 août 2025](https://www.gabonreview.com/gab-peche-le-gabon-mise-sur-la-souverainete-alimentaire-et-la-gabonisation-de-la-peche-artisanale/) |

Lecture : le cœur de cible logiciel est de l'ordre de **1 500 à 2 200 embarcations maritimes** (flotte actuelle plus pirogues Gab Pêche) et **8 500 pêcheurs** toutes pêches confondues. Les chiffres de flotte datent pour partie de 2005 ; un recensement DGPA à jour est la première donnée à obtenir en Phase 3.

### 2.2 Redevances officielles : le point d'ancrage des prix

| Redevance | Montant | Source |
|---|---|---|
| Carte de pêcheur artisanal | 10 000 FCFA par an | [Ministère, procédures d'acquisition des autorisations et cartes de pêche artisanale](https://www.agriculture.gouv.ga/object.getObject.do?id=245) |
| Autorisation de pêche artisanale maritime, nationaux | 100 000 FCFA | même source |
| Autorisation, non-nationaux (autres techniques) | 150 000 FCFA | même source |
| Autorisation senne (« tiré-tiré ») | 200 000 FCFA | même source |
| Autorisation pêche continentale | 50 000 FCFA | même source |

Lecture : un pêcheur maritime paie déjà entre 110 000 et 210 000 FCFA de redevances officielles. L'abonnement annuel PIGAP à 30 000 FCFA représente **14 à 27 % de cette charge** et trois fois la carte annuelle. C'est le niveau que nous jugeons acceptable si l'abonnement est adossé au renouvellement de la licence (service rendu : dossier, attestation, suivi). Cette hypothèse de consentement à payer est à **mesurer en Phase 3** (section 9).

### 2.3 Paiement mobile : le canal B2C existe

| Indicateur 2024 | Valeur | Source |
|---|---|---|
| Comptes de monnaie électronique | 4,5 millions, +27 % sur un an | [Gabonreview, mobile money 2024](https://www.gabonreview.com/mobile-money-plus-de-4-000-milliards-fcfa-sur-la-valeur-des-transactions-en-2024/) |
| Transactions | 368,3 millions d'opérations, 4 087 milliards FCFA | [Gabon Media Time](https://gabonmediatime.com/gabon-le-mobile-money-franchit-le-cap-des-50-milliards-de-fcfa-de-chiffre-daffaires-en-2024/) |
| Abonnements mobiles | 3 207 794 à fin septembre 2024, Moov 51,41 %, Airtel 48,59 % | [ARCEP, observatoire mobile](https://www.arcep.ga/uploads/observatoires/mobile/Mobile%202024-1.pdf) |
| Frais d'encaissement pawaPay, dépôt Airtel Money Gabon | 2 % (1 % opérateur + 1 % pawaPay), hors taxes, à la charge du marchand | [pawaPay, grille de frais](https://www.pawapay.io/fees) |

Conséquence : l'encaissement B2C est opérationnel dès aujourd'hui sur Airtel Money (intégration livrée, dépôt initié depuis le numéro enregistré de l'acteur). Moov Money, dont l'opérateur détient la moitié des abonnements mobiles, reste à raccorder : c'est un prérequis commercial de la Phase 4.

### 2.4 Organisations et points d'entrée terrain

- Centres communautaires des pêches : Owendo, Port-Gentil, Omboué, Lambaréné ; cinq centres d'appui supplémentaires en construction avec la FAO, dont Cocobeach et Mayumba pour la pêche maritime ([FAO Gabon](https://www.fao.org/gabon/actualites/detail-events/en/c/1606251/)).
- Coopératives identifiées : coopérative des pêcheurs artisanaux du Cap Lopez « Gbenodou » à Port-Gentil, soutenue par Perenco ([Gabon Media Time](https://gabonmediatime.com/port-gentil-perenco-oil-gas-soutien-cooperative-des-pecheurs-artisanaux-cap-lopez/)) ; Fédération des coopératives de pêche de Mayumba, équipée par BW Energy ([Gabon Media Time](https://gabonmediatime.com/bw-energy-gabon-les-pecheurs-de-mayumba-desormais-equipes-en-materiel-professionnel/)).
- Le nombre total d'organisations professionnelles n'est pas publié : à obtenir auprès de la DGPA.

### 2.5 Financements publics et bailleurs actifs sur le secteur

| Dispositif | Montant ou nature | Source |
|---|---|---|
| Projet d'appui au secteur pêche et aquaculture (BAD) | 11,354 milliards FCFA | [FAO Gabon](https://www.fao.org/gabon/actualites/detail-events/en/c/1606251/) |
| Convention ministère de la Mer et BCEG, financement des filières halieutiques | 25 milliards FCFA, signée le 30 avril 2026 | [Gabonactu](https://gabonactu.com/blog/2026/05/02/economie-bleue-un-partenariat-pour-faciliter-le-financement-des-filieres-halieutiques/) |
| Assistance technique Banque mondiale, gouvernance et compétitivité des pêches maritimes | atelier de restitution du 25 février 2026 | [Gabonreview](https://www.gabonreview.com/peche-artisanale-le-gabon-lance-un-vaste-chantier-de-reforme-avec-la-banque-mondiale/) |
| BCEG et SGDEB, premières pirogues financées | 200 millions FCFA, 10 pirogues motorisées, août 2025 | [Infos Gabon](https://fr.infosgabon.com/gabon-la-bceg-et-la-sgdeb-unissent-leurs-forces-pour-moderniser-la-peche-artisanale/) |

Lecture : la composante « système d'information » d'un programme bailleur est le véhicule naturel de la licence institutionnelle ; les partenariats RSE des opérateurs pétroliers avec les coopératives sont un véhicule pour les abonnements flotte.

---

## 3. Proposition de valeur par segment

| Segment | Problème aujourd'hui | Ce que PIGAP apporte | Preuve dans le produit |
|---|---|---|---|
| Autorité | Registre papier, pas de vue temps réel, quotas non suivis, contrôle des zones difficile | Registre numérique, numérotation automatique, carte en temps réel, quotas avec alerte à 90 %, alertes zones, limites et concentration, rapports | Modules M1 à M7 livrés, AIS, météo-marine, prédictions consultatives |
| Organisation professionnelle | Pas de preuve de conformité de ses membres, flotte invisible, reporting manuel | Portail flotte, suivi multi-embarcations, dossiers de licence des membres, alertes, exports | Portail organisation, licence flotte avec règle anti double facturation |
| Pêcheur | Démarches longues, pas de trace de ses déclarations, risques en mer | Demande de licence en ligne, déclarations hors-ligne, suivi GPS même sans réseau, bulletin de mer et alertes de danger | Application mobile, file hors-ligne captures et positions, paiement depuis son numéro |
| Chercheurs, ONG, bailleurs | Données éparses, non standardisées | Séries temporelles, exports, données anonymisées | Rôle chercheur, exports CSV et PDF |

---

## 4. Catalogue d'offres, cinq composantes

### 4.1 Abonnement des organisations professionnelles : licence Flotte

| Formule | Prix | Périmètre |
|---|---|---|
| Base mensuelle | 150 000 FCFA par mois | jusqu'à 10 embarcations, 5 comptes, modules registre, GPS, captures, tableau de bord, documents, alertes |
| Base annuelle | 1 500 000 FCFA par an | identique, deux mois offerts |
| Embarcation supplémentaire | 12 000 FCFA par mois ou 120 000 FCFA par an | logiciel seul |

Inclus : l'abonnement pêcheur de chaque membre (règle anti double facturation, implémentée), le portail organisation, l'assistance à distance. Exemple : une coopérative de 20 pirogues paie 270 000 FCFA par mois ou 2 700 000 FCFA par an, soit 135 000 FCFA par pirogue et par an. C'est 4,5 fois l'abonnement pêcheur individuel (30 000 FCFA) : l'écart se justifie par le portail, le reporting de flotte et les comptes gestionnaires, mais une coopérative pourrait préférer des abonnements individuels. Ce point de prix est à confronter au terrain (section 12).

### 4.2 Licences institutionnelles : licence Autorité

| Formule | Prix | Inclus |
|---|---|---|
| Mensuelle | 2 500 000 FCFA par mois | portail autorités jusqu'à 50 comptes, modules M1 à M7, AIS, météo-marine, prédictions, hébergement, sauvegardes, support de niveau 1 cinq jours sur sept, une formation par an |
| Annuelle | 25 000 000 FCFA par an | identique, deux mois offerts |

Options : comptes au-delà de 50 à 25 000 FCFA par compte et par mois ; flux AIS satellitaire premium à 8 000 000 FCFA par an ; fusion radar ou centre de contrôle sur devis ; marché d'équipement balises en pass-through avec marge d'intégration de 8 à 12 %.

Nouveauté de cette version : une **licence territoriale** (direction provinciale, parc national, autorité portuaire) à définir à partir de la licence Autorité, avec périmètre géographique restreint. Son prix n'est pas fixé ; proposition de travail : un tiers de la licence nationale. À valider avec le premier prospect.

### 4.3 Partenariats public-privé

Trois montages, du plus simple au plus structurant :

1. **Composante numérique d'un programme bailleur.** PIGAP est inscrit comme système d'information d'un projet existant (BAD, Banque mondiale, FAO, AFD). Le bailleur finance la licence Autorité pluriannuelle et le déploiement ; l'État reprend la licence en fin de programme. Avantage : encaissement sécurisé sur trois à cinq ans.
2. **Partenariat RSE avec les opérateurs industriels du littoral.** Perenco (Cap Lopez) et BW Energy (Mayumba) soutiennent déjà des coopératives en matériel. Proposition : le partenaire finance la licence Flotte et l'équipement de la coopérative, PIGAP assure le déploiement et le reporting d'impact.
3. **Concession de service numérique.** À plus long terme, contrat de service entre l'État et PIGAP sur la base de la licence Autorité avec engagements de disponibilité (cible 98 % en pilote, cahier section 10) et de formation, en complément du programme NEMO dont PIGAP est la couche logicielle métier, pas un concurrent.

### 4.4 Services de suivi et d'analyse des données

Offre distincte des licences, facturée à la prestation :

| Service | Contenu | Tarif proposé |
|---|---|---|
| Rapport périodique de pilotage | bulletin mensuel ou trimestriel : effort de pêche, captures par espèce et zone, alertes, pression sur quotas | inclus dans la licence Autorité ; 250 000 FCFA par rapport pour un tiers (bailleur, ONG) |
| Étude à façon | analyse d'une zone, d'une saison ou d'une espèce, avec méthode et limites documentées | sur devis, base 150 000 FCFA par jour d'analyste |
| Accès données pour la recherche | exports anonymisés et agrégés, documentation des séries | gratuit pour les institutions publiques gabonaises, convention pour les autres |

Les tarifs de cette composante sont des **propositions** ; aucun contrat de ce type n'a encore été conclu.

### 4.5 Accompagnement des acteurs

| Service | Contenu | Tarif proposé |
|---|---|---|
| Déploiement terrain | enrôlement des pêcheurs, installation de l'application, saisie des équipements, premiers relevés | 100 000 FCFA par journée d'intervention, hors déplacement |
| Formation | agents de contrôle, gestionnaires de coopérative, formateurs relais | 150 000 FCFA par journée, groupes de 12 |
| Support de niveau 2 et astreinte alertes | traitement des alertes critiques en dehors des heures ouvrées | forfait mensuel à définir avec la licence Autorité |
| Récepteurs AIS portuaires | fourniture, pose et raccordement d'un récepteur VHF par port (Owendo, Port-Gentil), ingestion déjà implémentée | devis matériel plus une journée de pose |

Ces tarifs sont des **propositions** à confronter aux grilles de journée pratiquées localement.

### 4.6 Abonnement pêcheur indépendant

| Formule | Prix | Net après frais pawaPay (2 %) |
|---|---|---|
| Mensuel | 3 000 FCFA | 2 940 FCFA |
| Annuel | 30 000 FCFA | 29 400 FCFA |

Le dépôt est initié depuis le numéro de téléphone enregistré du pêcheur ; un agent peut autoriser un payeur tiers, tracé dans le paiement. Pendant la Phase 3, l'abonnement n'est pas exigé (`ABONNEMENT_ENFORCE=false`).

---

## 5. Logique de prix

- **Pêcheur** : 30 000 FCFA par an, soit trois fois la carte annuelle de 10 000 FCFA et moins d'un cinquième des redevances d'autorisation (section 2.2). Le mensuel sert d'entrée, l'annuel est la cible (deux mois offerts, moins d'opérations Mobile Money, moins de désabonnements).
- **Flotte** : le prix par embarcation décroît avec la taille (150 000 FCFA pour 10, puis 12 000 FCFA par unité), pour que la coopérative ait intérêt à enrôler toute sa flotte.
- **Autorité** : 25 000 000 FCFA par an couvre l'hébergement, le support et une part des services d'analyse (section 6). C'est l'ordre de grandeur d'une ligne de système d'information dans les programmes bailleurs cités en 2.5.
- **Transparence** : les coûts physiques (balises, satellite, radar) sont toujours facturés à part, pour que la licence logicielle reste comparable d'une année sur l'autre.

---

## 6. Structure de coûts

### 6.1 Coûts sourcés (plateforme actuelle)

| Poste | Référence publique | Coût |
|---|---|---|
| Hébergement API et base PostGIS | [Railway, plan Pro](https://railway.com/pricing) : 20 USD par mois avec 20 USD d'usage inclus, puis 10 USD par Go de mémoire et 20 USD par vCPU par mois | de l'ordre de 20 à 100 USD par mois selon la charge |
| Portail web | [Vercel, plan Pro](https://vercel.com/pricing) : 20 USD par membre et par mois, 1 To de transfert inclus | 20 USD par mois pour un compte |
| Données météo-marine | Open-Meteo, licence CC BY 4.0, sans clé (ADR-008) | 0 |
| Flux AIS communautaire | AISStream, clé gratuite (ADR-005) ; couverture nulle au Gabon mesurée le 2026-09-20 | 0 |
| Encaissement Mobile Money | pawaPay, 2 % des dépôts (section 2.3) | 2 % du chiffre d'affaires B2C |

Au niveau d'activité du pilote, l'infrastructure logicielle coûte **moins de 150 USD par mois**, soit moins de 100 000 FCFA. Le coût de la plateforme est donc dominé par les personnes, pas par les machines.

### 6.2 Coûts à chiffrer localement (hypothèses de travail)

| Poste | Hypothèse | À confirmer par |
|---|---|---|
| Équipe d'exploitation : développement, support, animation terrain | 2 à 3 équivalents temps plein en Phase 4 | grille salariale CBM |
| Hébergement souverain ou région Afrique, sauvegardes, plan de reprise | 0,8 à 2,5 millions FCFA par mois (version 1 de ce document) | devis hébergeurs |
| Récepteur AIS portuaire | matériel grand public (clé SDR, antenne VHF, mini-ordinateur) | devis fournisseur |
| Balise hybride cellulaire et satellite, par embarcation | 300 000 à 450 000 FCFA de matériel, 150 000 à 250 000 FCFA d'airtime par an (version 1) | devis CLS ou équivalent |
| Flux AIS satellitaire premium | 5 à 40 millions FCFA par an (version 1) | devis Spire, exactEarth, CLS |
| Fiscalité : régime de TVA, retenues sur prestations | non chiffré | expert-comptable |

Les fourchettes de la version 1 sont des estimations de travail, non des devis : elles sont conservées pour mémoire et doivent être remplacées par des devis avant tout engagement.

---

## 7. Équation économique et scénarios

Les scénarios reprennent ceux de la version 1 pour rester cohérents avec les hypothèses déjà validées, en ajoutant les frais d'encaissement.

### 7.1 Scénario de base (année 1 après pilote)

Hypothèses : 1 licence Autorité annuelle, 2 coopératives de 15 embarcations, 300 pêcheurs indépendants en formule annuelle, pas de satellite premium ni de balises.

| Source | Chiffre d'affaires annuel | Net après frais |
|---|---|---|
| Licence Autorité | 25 000 000 FCFA | 25 000 000 |
| 2 licences Flotte (base + 5 supplémentaires) | 4 200 000 FCFA | 4 200 000 |
| 300 pêcheurs à 30 000 FCFA | 9 000 000 FCFA | 8 820 000 (2 % pawaPay) |
| Services d'accompagnement (20 journées) | 2 000 000 à 3 000 000 FCFA | idem |
| **Total** | **40 à 41 millions FCFA** | **40 à 41 millions FCFA** |

Charges cibles (équipe, hébergement, support, sans parc de balises) : 20 à 30 millions FCFA. Résultat positif mais mince : le modèle tient à condition d'encaisser la licence Autorité.

### 7.2 Scénarios encadrants

| Scénario | Hypothèses | Chiffre d'affaires annuel |
|---|---|---|
| Pessimiste | licence Autorité mensuelle sur six mois, 1 coopérative de 10 embarcations, 80 pêcheurs | 18 à 20 millions FCFA |
| Base | section 7.1 | 40 à 41 millions FCFA |
| Optimiste | licence Autorité annuelle avec satellite premium, 5 coopératives de 20 embarcations, 700 pêcheurs, 40 journées d'accompagnement | 75 à 95 millions FCFA |

### 7.3 Point mort et sensibilité

- Sans licence Autorité, il faudrait environ 700 pêcheurs annuels ou 14 coopératives de 10 embarcations pour couvrir 20 millions FCFA de charges : irréaliste la première année. **La vente institutionnelle est la priorité commerciale.**
- Le B2C est peu sensible au prix unitaire mais très sensible au taux de renouvellement : chaque point de désabonnement annuel sur 300 pêcheurs représente 90 000 FCFA.
- Les frais d'encaissement (2 %) sont marginaux ; le vrai coût du B2C est l'enrôlement terrain, d'où la composante accompagnement.

---

## 8. Mise sur le marché et capacité de déploiement

| Phase | Monétisation | Actions |
|---|---|---|
| Phase 3, expérimentation terrain (en préparation) | gratuite ou subventionnée | une zone pilote (Owendo ou Port-Gentil), 50 à 100 pêcheurs enrôlés via un centre communautaire des pêches et une coopérative, mesure des cinq indicateurs du cahier section 10 et du consentement à payer |
| Phase 4, déploiement | licence Autorité d'abord, puis Flotte et B2C annuel | contrat ou inscription dans un programme bailleur, raccordement Moov Money, formation des agents, récepteurs AIS dans deux ports |
| Extension | services d'analyse, licence territoriale, partenariats RSE | parcs nationaux, autorités portuaires, autres pays de la sous-région (plateforme déjà paramétrée par fichiers de données, zone de veille golfe de Guinée) |

Canaux : DGPA et directions provinciales ; centres communautaires des pêches (Owendo, Port-Gentil, Omboué, Lambaréné, puis Cocobeach et Mayumba) ; coopératives et fédérations ; bailleurs via les unités de gestion de projet ; opérateurs industriels via leurs programmes RSE.

Capacité de déploiement : la plateforme est en production (API, portail, application mobile), les migrations sont automatisées, les données de référence sont embarquées dans l'image, l'ingestion de récepteurs AIS et le paiement Mobile Money sont opérationnels. Le facteur limitant est l'animation terrain : une journée d'intervention par groupe de 10 à 15 pêcheurs est l'hypothèse de planification à vérifier en pilote.

---

## 9. Indicateurs commerciaux à mesurer dès le pilote

| Indicateur | Cible de travail | Pourquoi |
|---|---|---|
| Consentement à payer déclaré (enquête auprès des pêcheurs pilotes) | au moins 50 % acceptent 30 000 FCFA par an adossés à la licence | valide le prix B2C |
| Taux de conversion gratuit vers payant à la fin du pilote | 30 % | base du scénario pessimiste |
| Renouvellement annuel | 70 % | sensibilité section 7.3 |
| Délai moyen d'encaissement Mobile Money | moins de 5 minutes | parcours de paiement |
| Coût d'enrôlement par pêcheur | moins de 10 000 FCFA | dimensionne l'accompagnement |
| Usage effectif : au moins une déclaration par semaine | 70 % des pêcheurs pilotes (cahier section 10) | preuve de valeur pour l'Autorité |

Ces cibles sont des hypothèses de pilotage, pas des engagements.

---

## 10. Risques et parades

| Risque | Parade |
|---|---|
| Décision institutionnelle lente | entrer par un programme bailleur ou un partenariat RSE ; licence mensuelle pour démarrer |
| Pêcheurs non-nationaux (75 % de la flotte maritime) réticents à l'enrôlement | abonnement adossé au renouvellement de la licence, intérêt direct (dossier, attestation, sécurité en mer) |
| Couverture réseau faible | fonctionnement hors-ligne des captures et des positions, synchronisation différée |
| Concurrence ou chevauchement avec NEMO | positionnement en couche métier (licences, captures, quotas, alertes), ingestion `source=balise` prévue |
| Dépendance à un seul opérateur de paiement | raccorder Moov Money avant la Phase 4 |
| Désabonnement | formule annuelle, relances avant échéance, services inclus pour les coopératives |

---

## 11. Réponse aux critères de l'évaluation

| Critère du jury | Note | Ce que cette version apporte |
|---|---|---|
| Offre commerciale (6/10) | « à approfondir » | catalogue en cinq composantes conforme à la section 11 des termes de référence, prix ancrés sur les redevances officielles, services et accompagnement tarifés |
| Modèle économique | « à approfondir » | coûts sourcés pour la plateforme, coûts à chiffrer explicitement listés, scénarios encadrants, point mort, indicateurs commerciaux |
| Maturité du projet (2/5) | | plateforme en production, paiement opérationnel, plan de pilote avec mesures ; la preuve terrain reste à produire en Phase 3 |
| Pertinence (5/10) | | ancrage sur les chiffres du secteur, les dispositifs publics en cours (NEMO, Gab Pêche, BAD, Banque mondiale, BCEG) et les coopératives identifiées |

---

## 12. Hypothèses à valider avant engagement

1. Recensement à jour de la flotte et des pêcheurs (DGPA).
2. Nombre et liste des organisations professionnelles de pêcheurs.
3. Consentement à payer des pêcheurs et des coopératives (enquête pilote).
4. Régime fiscal (TVA, retenues) et forme contractuelle de la licence Autorité (marché public ou convention).
5. Devis matériels : récepteurs AIS, balises, hébergement souverain.
6. Conditions de raccordement Moov Money et exigences complémentaires d'Airtel Money signalées par pawaPay pour le Gabon.
7. Articulation contractuelle avec le programme NEMO.
8. Positionnement du prix Flotte par rapport à l'abonnement individuel (section 4.1) : tester une formule intermédiaire si les coopératives préfèrent le B2C.

---

## 13. Références internes

- Cahier MVP section 2.2 (paiement hors périmètre initial) et section 10 (indicateurs) ; écart documenté dans [ADR-007](adr/ADR-007-abonnements-mobile-money.md).
- [ADR-005, AIS open data](adr/ADR-005-ais-zee-gabon-open-data.md) ; [ADR-008, météo-marine](adr/ADR-008-meteo-marine-open-data.md).
- Catalogue d'offres : `backend/app/modules/abonnements/catalog.py` ; modules par formule : `backend/app/modules/abonnements/modules.py`.
- Journal : entrées du 2026-09-21 (paiement depuis le numéro de l'acteur) et du 2026-10-01 (écarts TDR).
