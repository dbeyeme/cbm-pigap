# ADR-016 : Déclaration de sortie, lieu de pêche proposé et zones favorables enrichies (lot 11)

- **Statut :** Proposé (règles métier au statut « Proposé », décision soumise à Christian)
- **Date :** 2026-11-27
- **Décideurs :** Christian BEYEME (+ agent)
- **Liens :** [étude du 2026-10-30](../etude-localisation-sans-capteur-et-zones-favorables.md), [lot 11](../lot-11-sorties-lieu-zones-favorables.md), [ADR-008](ADR-008-meteo-marine-open-data.md), [ADR-009](ADR-009-suivi-temps-reel-sources-position.md), cahier §5.2 et §5.7

## Contexte

L'étude du 2026-10-30 retient trois approches réalisables sans capteur supplémentaire à bord :

1. la **déclaration de sortie et de retour**, qui situe une pirogue même sans trace GPS et permet de signaler une sortie non rentrée ;
2. le **lieu de pêche proposé depuis la trace** de la sortie, pour éviter que les captures déclarées au port soient toutes localisées au port (demande S7 et règle « Proposé » du lot 3) ;
3. un **score de secteur favorable** fondé sur des indicateurs océanographiques (refroidissement de surface, chlorophylle) et qui ne présente jamais une aire protégée comme une opportunité.

Le cahier (§5.2) ne prévoit ni objet « sortie » ni alerte de retard ; §5.7 ne prévoit que trois règles d'alerte. C'est un écart, d'où cette ADR.

## Décision proposée

### 1. Sorties

- Nouvel objet `Sortie` : embarcation, pêcheur déclarant, port ou position de départ, heure de départ, heure de retour prévue, secteur visé facultatif, heure et lieu de retour.
- Déclaration par le pêcheur depuis l'application, **hors ligne d'abord** : identifiant fourni par le téléphone, envoi idempotent (`POST /api/v1/sorties`). Une seule sortie en cours par embarcation.
- Retour déclaré par le pêcheur, ou constaté par un agent de contrôle ou un administrateur, avec trace de l'auteur.
- Alerte de type `anomalie`, règle `sortie_non_rentree`, émise une seule fois par sortie quand l'heure de retour prévue est dépassée d'une tolérance. Tolérance, gravité et durée maximale sont dans `backend/app/data/regles/sorties.json`, au statut « Proposé ».
- Lecture selon le périmètre existant : le pêcheur voit ses sorties, l'organisation celles de ses membres, l'agent celles qui partent de ses zones affectées, l'autorité et l'administrateur toutes.

### 2. Lieu de pêche proposé

- `GET /api/v1/sorties/lieu-de-peche` renvoie, pour une embarcation et une heure, le relevé le plus fréquenté de la sortie (durée cumulée des intervalles qui commencent à moins d'un rayon donné), hors abords des ports. Paramètres dans `sorties.json`, statut « Proposé ».
- Le serveur **ne remplit jamais** le lieu d'une capture de lui-même : le pêcheur choisit. Le champ existant `origine_lieu` (`gps`, `saisie`), exposé par l'API à cette occasion, reçoit la valeur `trace` et dit d'où vient le lieu retenu.

### 3. Zones favorables

- Écart de température de surface au jour par rapport à la moyenne des 30 derniers jours (même source Open-Meteo, paramètre `past_days`).
- Chlorophylle a quotidienne sans lacune, 9 km, NOAA CoastWatch, jeu `noaacwNPPN20S3ASCIDINEOFDaily`, licence CC0-1.0, sans clé (vérifié le 2026-11-27 : dernière image du 2026-11-05, réponse en moins d'une seconde). Valeur du dernier jour et moyenne des 30 jours précédents, médiane des mailles du secteur.
- Un secteur dont le centre se trouve dans une zone réglementée active de type `protegee` n'est jamais classé « favorable ».
- Fenêtre de température et points du score déplacés du code vers `backend/app/data/regles/zones_favorables.json`, au statut « Proposé ».
- Indisponibilité d'une source : l'indicateur est marqué absent, le bulletin reste servi.

## Options écartées

- **Lieu de pêche rempli d'office par le serveur** : attribuerait une zone par supposition, contraire au principe du lot 5.
- **Copernicus Marine en direct** : demande un compte ; la chlorophylle NOAA, ouverte et sans clé, suffit à l'essai.
- **Fronts thermiques (Cayula et Cornillon)** : résultats contrastés dans la littérature et résolution côtière de 8 km insuffisante ; reporté.

## Conséquences

- Positives : position approximative de chaque pirogue partie, même sans GPS ; alerte de sécurité sur retard ; captures localisées hors des ports ; avis de secteur fondés sur des indicateurs explicables.
- Négatives : une déclaration de plus pour le pêcheur ; tolérance et seuils à calibrer au pilote ; image de chlorophylle en retard de plusieurs semaines sur la date du jour, affichée avec sa date.
- Données personnelles : heures et lieux de sortie sont des données personnelles (loi n° 001/2011 modifiée) ; mêmes règles de cloisonnement que les positions.

## Validation attendue

| Règle | Statut | Valideur |
|-------|--------|----------|
| Tolérance de retard avant alerte, gravité, durée maximale d'une sortie | Proposé | Christian, expert halieutique, DGPA |
| Calcul du lieu de pêche proposé (fenêtre, rayon, vitesse) | Proposé | Christian, expert halieutique |
| Seuils du score favorable (écart de température, chlorophylle, points) | Proposé | Christian, expert halieutique |
| Aire protégée jamais classée favorable | Proposé | Christian, DGPA, ANPN |
