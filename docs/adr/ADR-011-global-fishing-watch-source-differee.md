# ADR-011 : Global Fishing Watch, source différée pour les navires industriels

- **Statut :** Accepté pour un essai de faisabilité hors service (décision du porteur du 2026-11-24) ; mise en service soumise à l'accord de l'éditeur
- **Date :** 2026-11-24
- **Décideurs :** Christian BEYEME (+ agent)
- **Liens :** [ADR-009](ADR-009-suivi-temps-reel-sources-position.md), [chantier de novembre 2026, section 5.3](../chantier-evolutions-2026-11.md)

## Contexte

Les réseaux AIS communautaires ne reçoivent rien dans les eaux gabonaises (mesures des 2026-09-20 et 2026-11-23). Le porteur a obtenu une clé pour l'API de Global Fishing Watch, qui s'appuie sur l'AIS reçu par satellite et sur l'imagerie radar et optique.

Essai en lecture seule du 2026-11-24 sur la ZEE du Gabon, du 2026-08-01 au 2026-11-01 : 4 158 heures de pêche apparente, 10 navires (9 chalutiers, 1 thonier senneur), 1 110 détections radar. Les données sont publiées avec 96 heures de retard (5 jours pour le radar).

Deux contraintes viennent des conditions d'usage de l'éditeur, lues le même jour :

1. usage non commercial seulement (licence CC BY-NC 4.0), accès révocable à tout moment ; or CBM-PIGAP vend des licences et des abonnements (`docs/modele-economique.md`) ;
2. jeton interdit dans une interface web publique, mention d'attribution obligatoire sur chaque écran, 50 000 requêtes par jour et 1 500 000 par mois.

## Options envisagées

1. **Accord écrit de l'éditeur, puis intégration côté serveur.** Demande décrivant l'usage (surveillance des pêches pour l'administration gabonaise, affichage réservé aux autorités). Conforme, mais dépend d'une réponse dont le délai n'est pas connu.
2. **Compte et accès portés par l'administration.** L'administration, bénéficiaire non commercial, détient le compte ; la plateforme n'affiche ces données que dans son espace. À confirmer par écrit auprès de l'éditeur, les pages lues ne prévoyant aucun cas de ce type.
3. **Renoncer pour l'instant.** Les zones d'heures de pêche et les rapports de zone se limitent aux données de la plateforme (application, balises, captures). Aucun risque de licence ; les navires industriels restent invisibles tant qu'aucun récepteur AIS n'est installé.
4. **Intégrer sans accord.** Écartée : contraire aux conditions d'usage, avec retrait possible de l'accès sans préavis.

## Décision

Décision du porteur le 2026-11-24 : mener d'abord un essai de faisabilité, hors service. Le porteur traite de son côté la question des conditions d'usage (options 1 et 2) et en assume la responsabilité. L'essai suit les règles ci-dessous, qui valent aussi pour une mise en service ultérieure :

- un module serveur unique (`backend/app/modules/gfw/`) appelle l'API ; le jeton reste côté serveur, lu dans la variable `GFW_API_TOKEN` ; aucune requête depuis le navigateur ni depuis l'application mobile ;
- un interrupteur `GFW_ENABLED`, à l'arrêt par défaut : rien ne s'affiche en service avant l'accord écrit ;
- les réponses sont mises en cache côté serveur (données publiées une fois par jour, retard de 96 heures) : un rapport par zone et par période est demandé au plus une fois, ce qui tient très en dessous du plafond de requêtes et respecte la limite d'un rapport à la fois par jeton ;
- l'accès est réservé aux rôles d'autorité, d'agent et d'administrateur ; les routes déclarent leurs rôles et échouent fermées si le jeton manque ;
- chaque écran qui affiche ces données porte la mention exigée, la période couverte et la date de fraîcheur ; les libellés parlent de « pêche apparente » et d'« indice », jamais d'infraction constatée ;
- ces données ne déclenchent aucune alerte automatique : elles éclairent l'agent, qui qualifie (cahier §3.1).

## Conséquences

- **Positives :** première vue des navires industriels dans la ZEE sans matériel à installer ; historique depuis 2012 pour les heures de pêche ; fiche d'identité enrichie par les registres publics.
- **Négatives :** dépendance à un tiers qui peut retirer l'accès ; aucune donnée en temps réel ; pirogues non couvertes.
- **Dettes :** accord écrit à obtenir ; titulaire du compte à fixer ; renommer la ligne du fichier d'environnement en `GFW_API_TOKEN` ; mention d'attribution à concilier avec la règle interne « aucune marque tierce » des contenus externes (elle relève des mentions légales obligatoires, comme l'attribution des fonds de carte).

## Points vérifiés de l'API (version 3)

| Usage | Appel | Vérifié |
|-------|-------|---------|
| Liste des zones économiques | `GET /v3/datasets/public-eez-areas/context-layers` (Gabon : identifiant 8476) | Essai du 2026-11-24 |
| Rapport d'activité par zone | `GET /v3/4wings/report` avec `region-id`, `region-dataset`, `datasets[0]`, `date-range`, `temporal-resolution`, `group-by`, `spatial-resolution`, `format` | Essai du 2026-11-24 (jeux `public-global-fishing-effort` et `public-global-sar-presence`, version 5.0) |
| Tuiles de carte de chaleur | `GET /v3/4wings/tile/heatmap/{z}/{x}/{y}` | Documentation seulement |
| Identité d'un navire | `GET /v3/vessels/search`, `GET /v3/vessels/{id}` | Documentation seulement |
| Évènements | `GET` et `POST /v3/events` | Documentation seulement |

Aucune ligne de code n'utilisait cette API à la date de rédaction ; le module d'essai est confié au lot 5 (partie serveur).
