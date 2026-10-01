# ADR-009 — Suivi en temps réel des pirogues : triangulation GSM/GPS écartée, sources de position retenues

- **Statut :** Proposé (étude de faisabilité, décision soumise à validation de Christian)
- **Date :** 2026-10-01
- **Décideurs :** Christian BEYEME (+ agent)

## Contexte

Le projet exige des positions en temps réel, ou décalées de quelques minutes, pour les embarcations en mer et sur les fleuves (cahier §3.3 « temps réel », M2). Une piste a été proposée : trianguler les signaux GSM ou GPS des périphériques présents sur l'eau depuis trois points éloignés (São Tomé, Oyem, Tchibanga), en filtrant les périphériques sans intérêt halieutique.

Cette ADR évalue cette piste, puis retient les sources de position réellement exploitables par la plateforme.

## 1. Pourquoi la triangulation GSM / GPS n'est pas exploitable

### 1.1 Le GPS ne s'écoute pas

Un récepteur GPS ne transmet rien : il reçoit les signaux des satellites et calcule sa position localement. Aucun tiers ne peut « trianguler » un téléphone ou une balise GPS depuis la terre. La seule manière d'obtenir une position GPS est que l'appareil l'envoie lui-même (application, balise, AIS).

### 1.2 La portée GSM est bornée à 35 km

En GSM, le mécanisme de *timing advance* limite le rayon d'une cellule à environ 35 km (63 pas de 550 m) ([Wikipedia, Timing advance](https://en.wikipedia.org/wiki/Timing_advance)). Les distances entre les trois points proposés, calculées par formule de haversine (script en annexe), sont sans commune mesure :

| Paire | Distance |
|-------|----------|
| São Tomé – Oyem | 557 km |
| São Tomé – Tchibanga | 595 km |
| Oyem – Tchibanga | 498 km |

Distance des points proposés à des lieux de pêche types :

| Lieu de pêche | São Tomé | Oyem | Tchibanga |
|---------------|----------|------|-----------|
| Large de Cap Lopez (Port-Gentil) | 244 km | 405 km | 358 km |
| Estuaire du Komo | 297 km | 282 km | 395 km |
| Large de Mayumba | 602 km | 572 km | 82 km |
| Centre de la ZEE | 248 km | 526 km | 369 km |

Aucun des trois points ne reçoit le moindre signal GSM provenant de ces zones. La triangulation radio depuis ces villes est physiquement impossible, quelle que soit la technologie (GSM, 3G, 4G).

### 1.3 Seul l'opérateur peut localiser un abonné, et dans un cadre légal strict

La localisation par cellule ou par triangulation entre antennes relève exclusivement des opérateurs (Airtel Gabon, Moov Africa Gabon). Ces données sont des données à caractère personnel au sens de la loi n° 001/2011 du 25 septembre 2011, modifiée par la loi n° 025/2023, sous le contrôle de l'Autorité pour la protection des données à caractère personnel et de la vie privée, successeur de la CNPDCP ([texte de la loi 001/2011](https://www.afapdp.org/wp-content/uploads/2012/01/Gabon-Loi-relative-%C3%A0-la-protection-des-donn%C3%A9es-personnelles-du-4-mai-20112.pdf), [loi 025/2023](https://www.afapdp.org/wp-content/uploads/2023/12/Gabon-Loi-025-2023-du-12-juillet-2023-portant-modification-de-la-loi-001-2011-du-25-septembre-relative-a-la-protection-des-donnees-a-caractere-personnel.pdf), [GabonMediaTime](https://gabonmediatime.com/gabon-cnpdcp-transformee-autorite-pour-protection-des-donnees-caractere-personnel-vie-privee/)). Capter passivement les téléphones d'une zone pour « filtrer les périphériques inutiles » constituerait une interception et une surveillance de masse, hors de tout fondement légal, et contraire aux engagements du cahier §7 (données fictives, géolocalisation filtrée par rôle, consentement).

Une collaboration avec un opérateur reste envisageable pour des statistiques agrégées et anonymisées (densité de terminaux par cellule côtière), mais elle ne donnerait ni l'identité de l'embarcation, ni une précision inférieure à la taille de la cellule, ni de couverture au-delà de 35 km. Elle est écartée pour le MVP.

**Conclusion :** la piste de la triangulation est écartée, pour des raisons physiques (GPS passif, portée GSM) et juridiques (données personnelles, interception).

## 2. Fait structurant : le Gabon équipe déjà ses pirogues de balises satellitaires

Depuis le 2 juillet 2021, le ministère de la Pêche déploie des balises VMS « NEMO » du fournisseur CLS, mises en œuvre par la société Canopé, dans le cadre de l'arrêté n° 28 du 16 décembre 2020. L'objectif annoncé est d'équiper l'intégralité de la flotte artisanale, « soit environ 1000 pirogues », avec une fréquence d'émission de 30 minutes et un dispositif d'alerte en cas de danger ([Gabonreview, 2021](https://www.gabonreview.com/peche-artisanale-le-gabon-leader-mondial-en-matiere-de-surveillance/), [GabonMediaTime, 2021](https://gabonmediatime.com/gabon-le-gouvernement-dote-les-pecheurs-artisanaux-de-balises-de-surveillance/)). Global Fishing Watch indique que plus de 300 unités sont installées et coopère avec le Gabon sur cette initiative depuis 2020, avec un accord signé en juin 2025 ([Global Fishing Watch, Gabon](https://globalfishingwatch.org/our-work-in-gabon/)).

NEMO est une solution hybride : réseau terrestre près des côtes, bascule automatique sur la constellation satellitaire Kinéis au large ([Kinéis, CLS](https://kineis.com/en/cls/)). La constellation Kinéis, 25 nanosatellites, est en service depuis juin 2025 et livre les messages « généralement dans quelques minutes » ([Kinéis, FAQ](https://kineis.com/en/faqs/), [Kinéis, 4ᵉ lancement](https://kineis.com/en/successful-4th-launch-for-the-kineis-constellation/)).

**Conséquence pour PIGAP :** le flux de positions en quasi-temps réel existe déjà au niveau de l'État. Le point d'extension `source=balise` du modèle Position (cahier §3.3, `SourcePosition.balise` dans `backend/app/db/enums.py`) est précisément l'entrée prévue pour ce flux. L'enjeu n'est pas technique mais institutionnel : obtenir, par Kimba Connect et le ministère, un accès aux données NEMO (export ou API du centre de surveillance), avec convention de traitement des données.

## 3. Sources de position retenues, par couche

| Couche | Source | Latence | Couverture | Coût pour PIGAP | État dans le dépôt |
|--------|--------|---------|------------|-----------------|--------------------|
| A | Application mobile (GPS du téléphone, file hors-ligne) | Immédiate sous couverture GSM ; différée sinon | Fleuves, lagunes, bande côtière sous couverture (ordre de grandeur : jusqu'à 35 km, en pratique moins) | Nul | **En place** (M2, `POST /geoloc`, `/geoloc/batch`, intervalle `gps_interval_minutes`) |
| B | Balises NEMO / Kinéis de l'État (source=balise) | Minutes par satellite ; émission toutes les 30 min selon la configuration de 2021 | Mondiale, dont toute la ZEE | Nul si accès aux données obtenu | **Ingestion livrée** (`POST /positions/balises/ingest`, données fictives) ; adaptateur du format réel à écrire |
| C | Récepteurs AIS locaux (ports, estuaires) | Secondes | 20 à 40 milles nautiques autour de chaque récepteur, navires équipés AIS seulement | Matériel libre peu coûteux (ADR-005) | **En place** (`POST /ais/ingest`) |
| D | Passerelles LoRaWAN + traceurs GPS sur pirogues | Secondes | 10 à 13 km démontrés en pilote (Chypre du Nord, Indonésie), jusqu'à 130 km depuis un point haut insulaire (Açores) | Traceur et passerelle à faible coût, à chiffrer | Non prévu ; alternative de V2 si l'accès NEMO est refusé |
| E | Direct-to-Cell (Airtel Africa / Starlink) | Immédiate | Smartphones LTE hors couverture terrestre, à partir de 2026, sous réserve d'approbation par pays | Nul (la couche A en profite directement) | Veille |

Sources pour la couche D : [Arribada, SPOT Chypre du Nord](https://arribada.org/project/lorawan-vessel-tracking-for-small-scale-fisheries-spot-north-cyprus/), [Indramayu, Indonésie](https://www.researchgate.net/publication/341599213_Small_Vessel_Tracking_Based_on_Multi_Gateway_LORA_for_Indramayu_Traditional_Fishery), [Açores](https://ncbi.nlm.nih.gov/pmc/articles/PMC10490279). Source pour la couche E : [Via Satellite, 2025-12-17](https://www.satellitetoday.com/connectivity/2025/12/17/airtel-africa-partners-with-starlink-for-direct-to-cell-service/) ; la liste des quatorze pays n'est pas publiée dans l'annonce, la présence du Gabon reste à confirmer auprès d'Airtel Gabon.

## Décision proposée

1. **Écarter** définitivement la triangulation GSM / GPS (section 1).
2. **Prioriser** la démarche institutionnelle d'accès au flux NEMO (section 2) : courrier de Kimba Connect au ministère de la Pêche et à la direction en charge de la surveillance, demande d'un export périodique ou d'une API, convention de traitement des données.
3. **Préparer** l'ingestion `source=balise` : endpoint authentifié par clé partagée, sur le modèle de `POST /ais/ingest`, acceptant un lot de positions horodatées rattachées à une embarcation par identifiant de balise ; rapprochement balise ↔ embarcation dans le registre (M1). **Réalisé le 2026-10-01 avec des données fictives** (journal du même jour) ; l'adaptateur du format réel reste à écrire.
4. **Conserver** les couches A et C telles quelles ; expliciter sur le portail la fraîcheur de chaque position (source, âge, dernier contact), déjà partiellement fait pour l'AIS.
5. **Différer** LoRaWAN en V2, uniquement si l'accès NEMO n'aboutit pas ; un pilote d'une passerelle à Owendo ou Port-Gentil suffirait à mesurer la portée réelle.

## Conséquences

- Positives : aucune captation de données sans consentement ; réutilisation d'un investissement public existant ; cohérence avec l'ADR-005 (récepteurs locaux) et le cahier §2.2 (pas d'IoT propre en MVP).
- Négatives : dépendance à une décision administrative pour la couche B ; au large, sans NEMO, la plateforme ne voit que les navires AIS ; la couche A reste muette hors couverture jusqu'au retour au port.
- Impact cahier : aucun écart ; la décision précise le point d'extension `source=balise` déjà prévu.

## Annexe — calcul des distances

```python
from math import radians, sin, cos, asin, sqrt
def hav(a, b):
    la1, lo1 = map(radians, a); la2, lo2 = map(radians, b)
    d = sin((la2-la1)/2)**2 + cos(la1)*cos(la2)*sin((lo2-lo1)/2)**2
    return 2*6371.0*asin(sqrt(d))
# São Tomé (0.336, 6.731) ; Oyem (1.599, 11.579) ; Tchibanga (-2.850, 11.033)
```

## Liens

- Modules : M2 (géolocalisation), registre M1 (rapprochement balise ↔ embarcation)
- ADR-005 (AIS, récepteurs locaux), ADR-004 (masque d'eau)
- Journal : 2026-10-01
