# Étude : localiser les embarcations sans capteur embarqué et identifier les zones de pêche favorables

- **Statut :** note de recherche, document interne, projet soumis à validation humaine
- **Date :** 2026-10-30
- **Auteur :** Christian BEYEME (+ agent)
- **Liens :** [ADR-005](adr/ADR-005-ais-zee-gabon-open-data.md) (AIS), [ADR-006](adr/ADR-006-ml-leger-predictions.md) (ML léger), [ADR-008](adr/ADR-008-meteo-marine-open-data.md) (météo-marine), [ADR-009](adr/ADR-009-suivi-temps-reel-sources-position.md) (sources de position)

## 1. Objet et périmètre

Deux questions sont posées :

1. Comment mieux localiser les pirogues et les bateaux **sans installer de capteur électronique à bord** ?
2. Comment indiquer aux pêcheurs, aux armements et aux autorités les **zones ou foyers de pêche favorables** ?

L'ADR-009 a déjà traité les sources de position fondées sur un équipement (application GPS du téléphone, balises NEMO de l'État, récepteurs AIS, LoRaWAN, Direct-to-Cell) et écarté la triangulation GSM depuis des points éloignés. Cette note ne revient pas sur ces conclusions ; elle explore ce qui reste possible **sans électronique embarquée**, puis la question des zones favorables.

Rien de ce qui suit n'est implémenté. Toute piste retenue passera par une ADR, conformément à `AGENTS.md`, car plusieurs d'entre elles sortent du périmètre MVP du cahier (§2.2).

## 2. Constat préalable dans le dépôt

| Élément | État constaté | Conséquence |
|---------|---------------|-------------|
| `Capture.position_capture` (point PostGIS, facultatif) | Prévu au modèle et à l'API (`backend/app/db/models.py`, `captures/schemas.py`) | Le lieu de pêche peut être stocké |
| Application mobile | Le champ figure dans le type `mobile/src/api.ts` mais **aucun écran ne le renseigne** | En conditions réelles, les captures arriveront sans lieu de pêche |
| Score « favorable » de `meteo_marine` | Utilise la densité de captures 30 jours dans le rayon du secteur (`ST_DWithin` sur `position_capture`) et une fenêtre de température fixe 23,5 à 28,5 °C | Sans position de capture, ce critère ne s'alimente qu'avec les données de démonstration |
| Traces GPS (`Position`, sources `mobile`, `balise`, AIS) | En place (M2, ADR-009) | Permettent d'inférer le lieu de pêche a posteriori (§4.6) |

**Premier levier, à coût quasi nul :** faire renseigner le lieu de pêche lors de la déclaration de capture (choix sur une carte hors-ligne, ou dernier point GPS « lent » de la sortie, cf. §4.6). C'est la donnée qui conditionne presque toutes les pistes de la partie B.

## 3. Synthèse

| Piste | Voit les pirogues en bois ? | Délai | Coût pour PIGAP | Verdict |
|-------|-----------------------------|-------|-----------------|---------|
| Radar satellite (Sentinel-1) | Mal, sauf grandes unités | Heures à jours, passages espacés | Gratuit | Utile pour les **navires** sans AIS (intrusions), pas pour les pirogues |
| Réflecteur radar passif sur pirogue | Oui avec réflecteur (étude Ghana) | Idem radar satellite | Faible (objet sans électronique) | **À tester** en pilote, double bénéfice sécurité |
| Imagerie optique 3 m (PlanetScope) | Oui près des côtes et aux débarcadères | Quotidien, de jour, sans nuage | Payant | **Comptage aux débarcadères** : effort de pêche, pas de suivi individuel |
| Imagerie optique 10 m (Sentinel-2) | Peu fiable sous 12 m | 5 jours environ | Gratuit | Complément pour les grandes unités |
| Lumières nocturnes (VIIRS) | Seulement les embarcations éclairées | Quotidien, de nuit | Gratuit | Dépend d'une pratique de pêche à la lumière, **non confirmée** au Gabon |
| Radar côtier à terre | Petites cibles à 5 à 8 milles | Temps réel | Matériel et exploitation | Uniquement sur un site prioritaire (estuaire, port) |
| Inférence par déclarations (sortie, retour, lieu) | Oui, de façon indirecte | Au retour | Nul | **Prioritaire**, s'appuie sur l'existant |
| Données agrégées d'opérateur | Densité, pas d'identité | Variable | Convention | Écarté pour le MVP (ADR-009 §1.3) |

## 4. Partie A : localiser sans capteur embarqué

### 4.1 Radar à synthèse d'ouverture (SAR) satellitaire

Le radar voit à travers les nuages, de jour comme de nuit, ce qui est précieux sous le couvert nuageux équatorial. Ses limites pour les pirogues sont toutefois fortes :

- en bande C (Sentinel-1), la longueur minimale détectable par mer calme est donnée entre 7 et 10 m selon l'angle d'incidence ([Remote Sensing, 2023](https://doaj.org/article/88b6cb7b3b44427e8c1c2564f0aed273)) ; le vent et la houle relèvent ce seuil ;
- le bois réfléchit beaucoup moins le signal que le métal : deux objets de même taille n'ont pas la même signature radar ([Stastny et al., 2015](https://ugspace.ug.edu.gh/items/928da9f1-aa30-4a48-9a47-2e75ba98bb03)) ;
- Global Fishing Watch publie des détections SAR, mais présentées comme visant des navires industriels ([GFW, API 4Wings](https://globalfishingwatch.org/our-apis/documentation/docs/v3/4wings)), d'environ 10 m et plus selon une présentation de l'organisation ([GFW, FIU 2021](https://srh.fiu.edu/home/wp-content/uploads/2021/08/GFW-Big-Data-and-Analysis-Resources-for-the-global-maritime-security-community-Tyler-Clavelle-_-Gunther-Errhalt.pdf)).

**Usage pertinent pour PIGAP :** repérer les **navires non équipés d'AIS ou l'ayant coupé** dans la ZEE et à proximité des aires protégées. Les détections SAR qui ne correspondent à aucun signal AIS sont précisément ce que GFW appelle des détections « non appariées » ([GFW, radar](https://globalfishingwatch.org/?p=21674)). Cela compléterait les règles d'intrusion de M7, en lecture seule, avec un délai de quelques jours (le jeu `public-global-sar-presence` couvre jusqu'à cinq jours avant la date courante selon la documentation consultée). Les conditions de licence de l'API restent à vérifier sur les conditions d'utilisation de GFW.

### 4.2 Réflecteur radar passif sur les pirogues

Un réflecteur d'angle est un objet métallique sans alimentation ni électronique. Une étude menée au large du Ghana a montré que des pirogues en bois équipées de tels réflecteurs étaient détectées sur des images SAR spatiales ([Stastny et al., IEEE JSTARS, 2015](https://ugspace.ug.edu.gh/items/928da9f1-aa30-4a48-9a47-2e75ba98bb03)). À Sao Tomé-et-Principe, des réflecteurs ont été posés sur des bateaux de pêche pour qu'ils soient mieux vus par les grands navires ([AFRICOM](https://www.africom.mil/article/6096/new-radar-system-improves-sea-safety-for-sao-tome-)).

- **Avantages :** pas de batterie ni d'abonnement ; bénéfice direct pour la sécurité (collisions de nuit avec les navires) ; compatible avec la doctrine « pas d'IoT propre en MVP ».
- **Limites :** pas d'identité (un écho n'indique pas quelle pirogue) ; observation seulement au passage du satellite ; rapprochement avec le registre M1 uniquement par recoupement (zone, heure, sortie déclarée).
- **À mesurer en pilote :** taux de détection réel sur Sentinel-1 au large de Port-Gentil ou de Libreville, avec quelques pirogues volontaires et leurs traces GPS comme vérité terrain.

### 4.3 Imagerie optique : compter plutôt que suivre

- **Sentinel-2 (10 m, gratuit) :** Global Fishing Watch indique que la pêche artisanale par des embarcations de moins de 12 m lui échappe en grande partie ([GFW, imagerie optique](https://globalfishingwatch.org/?p=65929)).
- **PlanetScope (3 m, quasi quotidien, payant) :** capte l'activité côtière que Sentinel-2 manque (même source). En Adriatique, un détecteur de petits navires de pêche entraîné sur Sentinel-2 et PlanetScope atteint une précision de 0,813 et un rappel de 0,846 ([Chiappini et al., ISPRS 2026](https://isprs-archives.copernicus.org/articles/XLIX-B1-2026/621/2026/)).
- **Comptage aux débarcadères :** au Sénégal, des images satellitaires et de drones annotées ont servi à entraîner des algorithmes qui comptent les unités de pêche sur les sites de débarquement ([arXiv 2603.08189](https://arxiv.org/pdf/2603.08189), prépublication non évaluée).

**Usage pertinent :** un indicateur d'**effort de pêche par débarcadère** (nombre de pirogues à quai contre nombre de pirogues inscrites au registre M1 pour ce port), utile au tableau de bord M6 et aux contrôles. Le drone, piloté par un agent lors d'une tournée, offre la même mesure à moindre coût et avec une meilleure résolution ; il relève toutefois de la réglementation aérienne gabonaise et du droit à l'image, à vérifier.

### 4.4 Lumières nocturnes (VIIRS)

L'algorithme de détection de bateaux VIIRS, développé par l'Earth Observation Group, repère les lumières en mer la nuit, en quasi temps réel, et sert à délimiter les zones de pêche éclairées ; il est gêné par les nuages et le clair de lune ([Copernicus ESSD, 2025](https://essd.copernicus.org/articles/17/579/2025/essd-17-579-2025.html), [Elvidge, ACRS 2012](https://acrs-aars.org/proceeding/ACRS2012/Proceeding%20ACRS%202012/Technical%20Sessions/E6%20Envi%20Sci%20(4)/E6-1.pdf)).

Cette piste n'a de valeur que si des pêcheurs gabonais utilisent des lampes. Nous n'avons trouvé aucun texte confirmant ni interdisant la pêche à la lumière au Gabon ; la question est à poser à l'expert halieutique et à la direction des pêches avant toute exploration. Elle pourrait en revanche signaler des activités nocturnes éclairées au large (navires), à recouper avec l'AIS.

### 4.5 Radar côtier à terre

Le capteur est à terre, pas sur la pirogue. Les ordres de grandeur publiés pour de petites cibles peu réfléchissantes sont de 5 à 8 milles nautiques ([TransNav](https://www.transnav.eu/files/Influence_of_Automatic_Identification_System_on_Safety_of_Navigation_at_Sea,514.pdf)) ; nous n'avons trouvé aucune mesure sur des pirogues ouest-africaines. Le réflecteur passif (§4.2) améliorerait aussi cette détection. Cette piste n'a de sens que pour un site prioritaire unique (estuaire du Komo, approches de Port-Gentil), en complément d'un récepteur AIS sur le même mât (ADR-005).

### 4.6 Inférence à partir des déclarations et des traces existantes

C'est la piste la plus réaliste à court terme, car elle s'appuie sur ce que la plateforme collecte déjà :

1. **Déclaration de sortie et de retour** (application hors-ligne ; à terme SMS ou USSD pour les téléphones simples) : heure de départ, port, zone visée. Une sortie non close à l'heure prévue alimente déjà naturellement une alerte de sécurité.
2. **Lieu de pêche déclaré au retour** : sélection d'un secteur ou d'un point sur la carte hors-ligne lors de la déclaration de capture, ce qui renseigne `position_capture` (§2).
3. **Rayon d'action plausible** : à partir du port, de la durée de sortie et du type de motorisation inscrit au registre, la plateforme peut tracer une enveloppe de positions possibles, à croiser avec le masque d'eau (ADR-004) et les zones réglementées (M3).
4. **Lieu de pêche inféré depuis une trace GPS** : lorsque la trace existe (application ou balise), les points à faible vitesse et à cap erratique signalent en général l'activité de pêche, par opposition au transit. Global Fishing Watch emploie un principe voisin sur l'AIS. Les seuils de vitesse seront calibrés sur les traces du pilote, nous ne fixons aucune valeur ici.

Ces informations sont personnelles au sens de la loi gabonaise n° 001/2011 modifiée (ADR-009 §1.3) : consentement, filtrage par rôle et finalité affichée restent obligatoires.

## 5. Partie B : identifier les zones de pêche favorables

### 5.1 Principe éprouvé : les avis de zones potentielles de pêche

L'Inde publie quotidiennement des avis de zones potentielles de pêche (INCOIS), fondés sur la température de surface et la chlorophylle mesurées par satellite, rapportés à 586 sites de débarquement ([INCOIS](https://services.incois.gov.in/MarineFisheries/PfzAdvisory)). Les études disponibles rapportent :

- des captures de 2 à 6 fois supérieures dans la zone signalée par rapport à une zone non signalée, sur la côte du Kerala ([Banglajol](https://banglajol.info/index.php/RALF/article/view/93370)) ;
- une réduction de 50 % du temps de recherche pour les senneurs à Goa ([ICAR](https://kvknorthgoa.icar.gov.in/fishdb/to/PFZA.pdf)) ;
- mais aussi des avis non confirmés : 102 avis validés sur 136 reçus dans une étude ([ICAR, JIFA](https://epubs.icar.org.in/index.php/JIFA/article/view/138620)).

Ces chiffres proviennent d'échantillons locaux, pas d'essais contrôlés ; ils ne sont pas transposables tels quels au Gabon et ne doivent pas figurer dans un document externe sans vérification de l'article source.

### 5.2 Contexte océanographique gabonais

- Une étude publiée en avril 2026 décrit pour la bande côtière Gabon-Congo (0 à 6° S) deux périodes de remontée d'eaux riches en nitrates, de mai à août puis en décembre, un maximum côtier de chlorophylle de mai à septembre avec un pic en août, et une température de surface descendant vers 20 °C pendant la remontée ([Mbang Essome et al., Ocean Science 2026](https://os.copernicus.org/articles/22/1279/2026/)). Réserve : une seule année simulée (2011), modèle environ 1 °C plus chaud que les observations.
- La FAO décrit une longue saison froide de juin à octobre et une remontée d'eaux s'étendant du Cap Lopez au Cap Frio, avec des larves de sardinelles abondantes en saison froide du Cap Lopez à Libreville ([FAO, Goussilou](https://www.fao.org/fishery/docs/DOCUMENT/smallpelagics/2008/PRESENTATIONS_WEB/THEME_1/1.12_GOUSSILOU.pdf)).

**Conséquence directe pour le code :** la fenêtre fixe de 23,5 à 28,5 °C du score « favorable » de `meteo_marine` exclut précisément la période de remontée, réputée la plus productive pour les petits pélagiques. Le critère devrait raisonner en **écart saisonnier et en gradient** (front, refroidissement local) plutôt qu'en plage absolue, et par groupe d'espèces. C'est à valider avec l'expert halieutique ; le calendrier « saison sèche » de l'ADR-006 (juin à septembre) est cohérent avec ces sources.

### 5.3 Données ouvertes mobilisables

| Donnée | Source | Résolution | État |
|--------|--------|-----------|------|
| Température de surface, courants | Open-Meteo Marine, produit Copernicus Marine Météo-France | 0,08° (environ 8 km) | **Déjà intégré** (ADR-008) ; Open-Meteo précise que l'usage commercial requiert une licence distincte et que la précision côtière est limitée ([Open-Meteo](https://open-meteo.com/en/docs/marine-weather-api)) |
| Chlorophylle a, quotidienne sans lacune | Copernicus Marine, couleur de l'océan L4 multi-capteurs | 4 km | À intégrer ; conditions d'accès à vérifier sur le catalogue officiel ([fiche](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_MARINE_OC_GLO_BGC_PLANKTON_MULTI_4KM)) |
| Débits fluviaux (panaches de l'Ogooué, de la Nyanga) | GloFAS via Open-Meteo Flood | Stations | **Déjà intégré** |
| Effort de pêche apparent des navires AIS | Global Fishing Watch, `public-global-fishing-effort` | Grille | À évaluer ; indique où pêchent les flottes industrielles, utile comme contexte et pour les conflits d'usage |
| Aires marines protégées | Décret n° 00161/PR de 2017 : 9 parcs marins et 11 réserves aquatiques, 26,2 % des eaux marines nationales ([UNEP LEAP](https://leap.unep.org/en/countries/ga/national-legislation/decret-ndeg-00161pr-du-31052017-portant-creation-daires-protegees)) | Polygones | À vérifier dans M3 : toute zone favorable doit en être exclue |

### 5.4 Méthodes, de la plus simple à la plus ambitieuse

1. **Règles explicables (extension de l'existant)** : anomalie de température par rapport à la moyenne saisonnière, chlorophylle supérieure à un seuil, proximité d'un panache fluvial, mer praticable, quota disponible. Chaque avis porte ses motifs, comme aujourd'hui.
2. **Détection de fronts thermiques et chlorophylliens** : l'algorithme de Cayula et Cornillon est la référence pour les fronts de température ; les fronts servent d'indicateur de zones potentielles dans de nombreuses études, mais une étude sur la bonite à Ternate n'a trouvé aucune relation significative, ce qui invite à ne pas s'y fier seul ([synthèse et études régionales](https://journal.ipb.ac.id/jurnalikt/article/view/28305)). Les seuils dépendent de la région et doivent être calibrés localement.
3. **Modèle de distribution par espèce** : relier les captures géolocalisées (§4.6) aux variables environnementales du jour de la sortie. Ce prolongement de l'ADR-006 n'a de sens qu'après une saison complète de captures réelles et géolocalisées ; les données synthétiques actuelles ne le permettent pas.
4. **Savoir local cartographié** : des entretiens cartographiques avec les pêcheurs remplissent rapidement les lacunes spatiales. À Madagascar, une enquête auprès de 570 pêcheurs a recensé 397 sites de pêche sur environ 250 km², en soulignant le risque de confidentialité des sites ([ALR, 2025](https://www.alr-journal.org/10.1051/alr/2025009)) ; à Velondriake, le dessin sur imagerie satellitaire s'est montré plus fidèle que des points GPS isolés ([Blue Ventures](https://blueventures.org/?p=110149)). Cette méthode convient bien à une phase pilote et associe les pêcheurs dès le départ.

### 5.5 Garde-fous

- **Durabilité :** un avis de zone favorable concentre l'effort. Il doit être systématiquement croisé avec les quotas (M5), la classe « surexploitée » de `meteo_marine`, les zones interdites (M3) et les aires protégées. Un secteur favorable dont le quota dépasse le seuil ne doit jamais être présenté comme une opportunité.
- **Équité et confidentialité :** les foyers déclarés par les pêcheurs sont un savoir économique. Leur diffusion doit être agrégée (secteurs, pas de points précis) et validée par les communautés.
- **Aide à la décision :** les avis restent consultatifs, sans déclenchement d'alerte opérationnelle (cohérence avec ADR-006 et ADR-008), et doivent afficher leur fraîcheur et leurs motifs.
- **Diffusion :** hors-ligne dans l'application, et à terme par SMS ou message vocal pour les pêcheurs sans smartphone ; les messages doivent rester courts et en langage clair (mémoire projet « libellés professionnels »).

## 6. Feuille de route proposée

| Étape | Contenu | Prérequis | Effort indicatif |
|-------|---------|-----------|------------------|
| 1 | Lieu de pêche à la déclaration de capture (carte hors-ligne, point par défaut tiré de la dernière position lente) | Aucun ; modèle et API déjà prêts | Faible |
| 2 | Déclaration de sortie et de retour, sortie non close signalée | ADR (écart cahier §5.2) | Faible à moyen |
| 3 | Score « favorable » révisé : anomalie saisonnière au lieu de la plage fixe, chlorophylle Copernicus, exclusion des aires protégées | Avis de l'expert halieutique ; vérification des licences | Moyen |
| 4 | Lecture des détections SAR non appariées de GFW dans la ZEE, couche carte réservée aux autorités | Conditions d'utilisation GFW ; ADR | Moyen |
| 5 | Pilote réflecteurs passifs sur quelques pirogues volontaires, avec traces GPS de contrôle | Accord des pêcheurs et de l'administration | Terrain |
| 6 | Atelier de cartographie participative des foyers de pêche dans la zone pilote | Phase 3 terrain | Terrain |
| 7 | Modèle de distribution par espèce | Une saison de captures réelles géolocalisées | Élevé, post-MVP |

Les étapes 1 et 2 relèvent du périmètre MVP (lieu de capture, suivi des sorties) ; les étapes 3 à 7 constituent des incréments de Phase 3 ou post-MVP et doivent chacune faire l'objet d'une ADR.

## 7. Questions ouvertes

1. Des pêcheurs gabonais pratiquent-ils la pêche à la lumière, et est-elle autorisée ? (conditionne la piste VIIRS)
2. Les polygones des 20 aires protégées de 2017 sont-ils déjà chargés dans M3 ?
3. L'expert halieutique valide-t-il le remplacement de la plage fixe de température par un critère d'anomalie saisonnière, et pour quels groupes d'espèces ?
4. La licence Open-Meteo doit-elle passer en version commerciale si la plateforme est exploitée sous abonnement (ADR-007) ?
5. Kimba Connect souhaite-t-il ouvrir un volet « diffusion SMS ou vocale » des avis pour les pêcheurs sans smartphone ?
