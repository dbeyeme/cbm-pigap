# Chantier : évolutions de novembre 2026 (acteurs, valeur pour le pêcheur, carte, géolocalisation)

- **Statut :** document de cadrage interne, projet soumis à validation humaine
- **Date :** 2026-11-24
- **Auteur :** Christian BEYEME (+ agent)
- **Liens :** [ADR-009](adr/ADR-009-suivi-temps-reel-sources-position.md), [ADR-010](adr/ADR-010-fonds-de-carte-sans-cle.md), [étude du 2026-10-30](etude-localisation-sans-capteur-et-zones-favorables.md), [cahier](../cdc-mvp-pigap.md)

## 1. Compréhension stratégique

### 1.1 Demande du porteur

1. Mêmes actions sur l'application mobile et sur le portail pour les pêcheurs, les grandes compagnies, les associations et les organisations ; chacun choisit son support.
2. Courbes des prix de vente, globale et par espèce ; des fonctions utiles au pêcheur dont la donnée remonte aux administrateurs, aux autorités et aux organisations.
3. Reprise visuelle de l'application mobile et du portail.
4. Suivi d'activité, rendement et seuil de rentabilité pour le pêcheur ; réception de commandes, donc des interfaces clients et revendeurs.
5. QR code du pêcheur (fiche d'identité, portail et mobile) et lecture par les agents.
6. Correction de l'anomalie de la carte ; la carte doit montrer et signaler les navires et pêcheurs en infraction.
7. Géolocalisation en temps réel, effective et fiable.

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

### 1.3 Recadrages

- **Parité :** les mêmes actions sur les deux supports concernent les acteurs de la filière. L'administration (dessin des zones, comptes, rapports) reste sur le portail ; son usage mobile se limite à la consultation et au contrôle.
- **« Pirates » :** l'interface parle de « navire suspect » et de présomption. La qualification d'infraction revient à l'agent assermenté (cahier §3.1, explicabilité).
- **Présences humaines :** aucune localisation de personnes sans consentement (ADR-009, loi n° 001/2011 modifiée). Le suivi porte sur les embarcations qui émettent ou que des capteurs détectent.
- **Commandes :** hors périmètre du cahier (§2.2). ADR et validation de Kimba Connect avant tout développement.

## 2. Décisions du porteur (2026-11-24)

| Sujet | Décision |
|-------|----------|
| Fond de carte | Fond OpenStreetMap sans clé (ADR-010) |
| Commandes | Mise en relation sans paiement en ligne par défaut ; en option, paiement Mobile Money avec acompte de 30 % du prix, solde à la réception ou à la livraison, sous un mécanisme de confirmation entre vendeur et client |
| Parité | Périmètre « acteurs » de la demande initiale, retenu sauf avis contraire |
| Récepteurs AIS | Explorer d'abord les voies gratuites (section 5) |

## 3. Règles métier

| Règle | Statut | Valideur |
|-------|--------|----------|
| Acompte de 30 % du prix à la commande, par Mobile Money | Décidée le 2026-11-24 | Christian |
| Solde réglé ou confirmé à la réception ou à la livraison | Décidée le 2026-11-24 | Christian |
| Forme de la confirmation (code remis au client et saisi par le vendeur, ou double validation) | Proposé | Christian |
| Annulation, remboursement de l'acompte, litiges, délais | Proposé | Christian, Kimba Connect |
| Frais de paiement et éventuelle commission | Proposé | Christian |
| Offre limitée aux captures déclarées et aux espèces autorisées | Proposé | Christian, DGPA |
| Prix de vente saisi à la déclaration, obligatoire ou facultatif | Proposé | Christian |
| Diffusion des prix : agrégation par site et par espèce, seuil d'anonymat | Proposé | Christian, DGPA |
| Formule du seuil de rentabilité et liste des charges d'une sortie | Proposé | Christian, expert halieutique |
| Seuils d'alerte pour les navires AIS (zone, absence au registre, extinction du signal) | Proposé | Christian, DGPA |
| Photo d'identité sur la carte professionnelle | Proposé | Christian (donnée personnelle, consentement) |

Point de vigilance sur l'option de paiement : la plateforme encaisserait un acompte pour le compte du vendeur. Le cadre applicable aux services de paiement, les possibilités de l'agrégateur (versement au vendeur, remboursement) et les conditions générales sont à vérifier avant l'ADR ; rien n'est supposé ici.

## 4. Exécution

Un lot à la fois, avec tests, journal et mise à jour du statut (`AGENTS.md`).

| Lot | Contenu | Prérequis | État |
|-----|---------|-----------|------|
| 0 | Fond de carte sans clé, polices, garde-fou ; rappel des comptes de démonstration retiré des constructions publiques | Aucun | Présent en code le 2026-11-24, branche `fix/lot-0-fonds-de-carte`, non commité, non déployé |
| 1 | Socle mobile fiable : session conservée, suivi GPS en arrière-plan, sortie et retour, lieu de pêche. QR : carte professionnelle (mobile hors ligne, portail), lecteur par caméra pour l'agent | Documentation de la version d'Expo du projet ; ADR pour la déclaration de sortie (écart §5.2) | À faire |
| 2 | Carte des infractions : statut de régularité sur chaque marqueur, filtre « à contrôler », alertes automatiques pour les navires AIS, âge de chaque position, notification | Seuils à valider | À faire |
| 3 | Espace acteur commun mobile et portail (pêcheur, organisation) ; reprise visuelle ; allègement des pages et de l'application | Lot 1 | À faire |
| 4 | Prix de vente, courbes, carnet de sortie, rendement et rentabilité | Règles de la section 3 | À faire |
| 5 | Commandes, clients et revendeurs | ADR, validation de Kimba Connect, vérifications de paiement | À faire |

Dettes relevées hors lots : scénario de bout en bout du cahier (§9), tests mobiles, base de test isolée, clé de signature de l'application, mots de passe des comptes de démonstration lisibles dans le dépôt public, imagerie satellitaire à régulariser.

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

## 6. Ce qui revient au porteur

1. Déploiement du lot 0 (fusion vers `main`, mise en ligne).
2. Sort des comptes de démonstration : leurs mots de passe sont lisibles dans le dépôt public (`backend/scripts/seed_production_demo.py`) ; leur présence en ligne n'a pas été testée.
3. Demande d'accès à Skylight et candidature à une station AIS, par l'administration ou Kimba Connect.
4. Validation des règles « Proposé » de la section 3 avant les lots 4 et 5.
5. Régularisation de l'imagerie satellitaire (clé ou autre fournisseur).

## 7. Sources

- Fonds de carte : [CARTO, FAQ](https://docs.carto.com/faqs/carto-basemaps), [CARTO, conditions](https://www.carto.com/legal/basemap-terms/), [OpenFreeMap](https://openfreemap.org/), [OpenFreeMap, conditions](https://openfreemap.org/tos/)
- Hébergement : [Vercel, déploiement en pause](https://vercel.com/kb/guide/why-is-my-account-deployment-blocked)
- Surveillance : [Skylight](https://www.skylight.global/), [Allen Institute for AI](https://allenai.org/skylight), [publication](https://arxiv.org/abs/2312.03207), [Global Fishing Watch, usage commercial](https://globalfishingwatch.org/faqs/can-i-use-global-fishing-watch-apis-for-commercial-purposes/), [Maritime Executive, suivi radiofréquence](https://maritime-executive.com/article/satellite-rf-tracking-follows-the-dark-ships-that-ais-can-t-see)
- Liaison directe : [Via Satellite](https://www.satellitetoday.com/connectivity/2025/12/17/airtel-africa-partners-with-starlink-for-direct-to-cell-service/), [Connecting Africa](https://www.connectingafrica.com/connectivity/airtel-africa-starlink-launch-satellite-to-mobile-service-in-drc)
