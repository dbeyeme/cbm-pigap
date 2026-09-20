# ADR-008 — Bulletin météo-marine et zones calculées (open data)

- **Statut :** Accepté
- **Date :** 2026-09-20
- **Décideurs :** Christian BEYEME (+ agent)

## Contexte

Les autorités et les pêcheurs demandent que la plateforme signale automatiquement les risques (mer dangereuse, courants, crues) et les opportunités de pêche, et présente les zones de danger, favorables ou surexploitées, sur la base d'un croisement de données. Aucun capteur maritime n'est déployé au Gabon dans le cadre du MVP.

## Options envisagées

1. Copernicus Marine Service (CMEMS) en direct : produits riches (courants, SST, chlorophylle) mais compte, authentification et téléchargement de fichiers NetCDF ; latence d'intégration élevée.
2. **Open-Meteo** (Marine, Prévisions, Flood) : API HTTP sans clé, licence CC BY 4.0, données dérivées des modèles Copernicus Marine, ECMWF et GloFAS, réponse en moins d'une seconde pour huit points.
3. Fournisseurs commerciaux (météo marine payante) : hors budget MVP.

## Décision

Option 2, module `meteo_marine` :
- huit secteurs maritimes et cinq stations fluviales dans `data/open-data/gabon/secteurs_mer.json` (modifiables sans redéploiement) ;
- conditions : houle et maximum sur 24 h, période, courant de surface, vent et rafales, pluie, visibilité, température de surface, hauteur d'eau et tendance de marée ; débit fluvial GloFAS et tendance à trois jours ;
- risque par secteur, distinct pour pirogues et navires pontés, seuils paramétrables (`METEO_*`) ;
- opportunité par croisement avec les captures déclarées sur trente jours, les quotas des zones réglementées contenant le secteur (surexploitation à 90 %) et les zones interdites actives ;
- classes de zones affichées sur la carte : danger, prudence, favorable, surexploitée, ordinaire ;
- alertes automatiques (type `anomalie`, règles `meteo_marine` et `crue_fleuve`) par bloc de six heures, notifications temps réel, avis en langage clair pour la position du pêcheur (`/meteo/avis`) repris sur l'application mobile.

## Conséquences

- Positives : information de sécurité et d'aide à la décision sans matériel, gratuite, rafraîchie toutes les trente minutes ; cohérence entre portail et mobile.
- Négatives : modèles globaux à résolution kilométrique, non validés localement ; la position des cellules GloFAS est approximative (débit de la station Komo à Kango peu réaliste, à recaler) ; aucune donnée de chlorophylle, donc l'opportunité repose sur la mer, la température et l'historique déclaré.
- Les avis sont explicitement présentés comme des aides à la décision : le pêcheur reste responsable de sa sortie, l'autorité de ses décisions.

## Liens

- Module : `backend/app/modules/meteo_marine/`, tests `test_meteo_marine.py`
- Données : `data/open-data/gabon/secteurs_mer.json`, `SOURCES.md`
- Attribution : Open-Meteo.com, CC BY 4.0 ; Copernicus Marine, ECMWF, GloFAS via Open-Meteo
