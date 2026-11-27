# Lot 11 : sorties en mer, lieu de pêche proposé, zones favorables enrichies

- **Statut :** en production depuis le 2026-11-27 (PR #1 fusionnée dans `main`, `b23e63d`) ; application Android 0.3.0 ; règles « Proposé »
- **Date :** 2026-11-27
- **Décision :** [ADR-016](adr/ADR-016-sorties-lieu-de-peche-zones-favorables.md) (Proposé)
- **Origine :** [étude du 2026-10-30](etude-localisation-sans-capteur-et-zones-favorables.md), demande de Christian « implémente les approches utiles »

## 1. Compréhension

Parmi les pistes de l'étude, sont retenues celles qui servent tout de suite, sans matériel ni accord extérieur :

| Piste de l'étude | Traitement |
|------------------|------------|
| Lieu de pêche à la déclaration (étape 1) | Déjà livré au lot 3 (position du téléphone ou saisie) ; complété ici par l'origine du lieu et le point proposé depuis la trace |
| Déclaration de sortie et de retour (étape 2) | Ce lot : serveur, application, portail |
| Score favorable révisé (étape 3) | Ce lot : écart de température sur 30 jours, chlorophylle, aires protégées |
| Détections radar des navires sans AIS (étape 4) | Déjà couvert par l'essai Global Fishing Watch (ADR-011) |
| Réflecteurs passifs, cartographie participative (étapes 5 et 6) | Terrain, Phase 3 |
| Modèle de distribution par espèce (étape 7) | Post-MVP, faute de captures réelles |

## 2. Contrat d'interface

Préfixe `/api/v1`. Dates en ISO 8601 avec fuseau. Erreurs au format existant (`detail`, `code`).

### 2.1 Sorties

`POST /sorties` (pêcheur pour ses embarcations ; administrateur) : déclaration idempotente, création ou complément.

```json
{
  "client_id": "uuid fourni par le téléphone",
  "embarcation_id": "uuid",
  "port_depart_id": "owendo",
  "position_depart": {"type": "Point", "coordinates": [9.5, 0.28]},
  "depart_a": "2026-11-27T05:30:00+01:00",
  "retour_prevu_a": "2026-11-27T14:00:00+01:00",
  "secteur_vise": "large-libreville",
  "retour_a": null,
  "port_retour_id": null,
  "position_retour": null
}
```

- `port_depart_id` (identifiant de `ports.json`) ou `position_depart` : au moins l'un des deux. Avec un port seul, la position de départ est celle du port.
- `secteur_vise` : identifiant de `secteurs_mer.json`, facultatif.
- Réponse `201` à la création, `200` si `client_id` existe déjà pour ce pêcheur (les champs de retour fournis complètent une sortie en cours ; le reste est ignoré).
- Refus : `409 SORTIE_DEJA_EN_COURS` (autre sortie en cours pour l'embarcation), `409 SORTIE_CLIENT_ID_REUTILISE` (même identifiant pour une autre embarcation), `422 SORTIE_INVALIDE` (retour prévu avant le départ, durée au-delà du maximum, départ ou retour dans le futur, port ou secteur inconnu, ni port ni position), `404` embarcation hors périmètre.

`POST /sorties/{id}/retour` (pêcheur propriétaire, agent de contrôle, administrateur) : `{ "retour_a": null, "port_retour_id": "owendo", "position_retour": null }`, `retour_a` vide vaut maintenant. `409 SORTIE_DEJA_TERMINEE`.

`GET /sorties?statut=en_cours|en_retard|terminee&embarcation_id=&depuis=&jusqu_a=&limit=100` et `GET /sorties/{id}` (pêcheur, organisation, agent de contrôle, autorité, administrateur, selon le périmètre).

`SortieRead` :

```json
{
  "id": "uuid", "client_id": "uuid",
  "embarcation_id": "uuid", "embarcation_nom": "Espoir", "immatriculation": "GA-LBV-001",
  "pecheur_id": "uuid", "pecheur_nom": "Prénom Nom",
  "port_depart_id": "owendo", "port_depart_nom": "Port d'Owendo",
  "position_depart": {"type": "Point", "coordinates": [9.5, 0.28]},
  "depart_a": "...", "retour_prevu_a": "...",
  "secteur_vise": "large-libreville", "secteur_vise_nom": "Large de Libreville et Pointe Denis",
  "retour_a": null, "port_retour_id": null, "port_retour_nom": null, "position_retour": null,
  "statut": "en_cours | en_retard | terminee",
  "retard_minutes": 0,
  "alerte_emise": false,
  "retour_constate_par": "pecheur | agent_controle | admin | null",
  "derniere_position": {"type": "Point", "coordinates": [9.1, 0.2]},
  "derniere_position_a": "..."
}
```

`en_retard` : en cours et heure de retour prévue dépassée de la tolérance du paramétrage. `retard_minutes` : minutes au-delà de l'heure prévue, 0 sinon. `derniere_position` : dernier relevé de l'embarcation depuis le départ, toutes sources, ou `null`.

### 2.2 Lieu de pêche proposé

`GET /sorties/lieu-de-peche?embarcation_id=&avant=` (pêcheur pour ses embarcations, agent, autorité, administrateur) :

```json
{
  "disponible": true,
  "position": {"type": "Point", "coordinates": [9.05, 0.12]},
  "debut": "...", "fin": "...",
  "releves": 42, "duree_minutes": 135,
  "motif": "Point où le bateau est resté le plus longtemps pendant la sortie",
  "regle": {"version": "2026-11-27", "statut": "Proposé", "valideurs": ["Christian", "expert halieutique", "DGPA"]}
}
```

Fenêtre : la sortie qui couvre `avant` si elle existe, sinon les `fenetre_heures` précédant `avant`. `disponible=false`, `position=null` et un motif en clair si aucun relevé ne convient.

### 2.3 Captures

Champ facultatif `origine_lieu` (colonne déjà présente en base depuis la demande S7, jusqu'ici non exposée par l'API) : `gps` (position du téléphone), `saisie` (coordonnées tapées), `trace` (point proposé ci-dessus), ou `null`. Accepté en création, synchronisation et correction ; renvoyé en lecture. Ignoré, et remis à `null`, si `position_capture` est absente.

### 2.4 Météo-marine

`OpportuniteSecteur` reçoit, tous facultatifs : `temperature_moyenne_30j_c`, `ecart_temperature_c`, `chlorophylle_mg_m3`, `chlorophylle_moyenne_30j_mg_m3`, `chlorophylle_date` (date de l'image), `aire_protegee` (booléen). Les motifs en clair restent la lecture principale.

## 3. Règles (paramétrage versionné)

- `backend/app/data/regles/sorties.json` : tolérance de retard, gravité de l'alerte, durée maximale, avance tolérée sur l'heure du téléphone, calcul du lieu proposé. Statut « Proposé ».
- `backend/app/data/regles/zones_favorables.json` : fenêtre de température (reprise du code existant), seuils et points des indicateurs, source de chlorophylle. Statut « Proposé ».

## 4. Exécution

« Fait » s'entend ici : présent en code et couvert par des tests exécutés ; « vérifié » : constaté à l'écran ou contre les vraies sources. Rien n'est déployé.

### 4.1 Ce qui est fait

| Élément | Où | État |
|---------|----|------|
| Objet `Sortie`, migration `b7c8d9e0f611` | `backend/app/db/models.py`, `backend/alembic/versions/` | Fait ; migration appliquée à la base de développement locale |
| Déclaration idempotente, retour, liste, détail, cloisonnement | `backend/app/modules/sorties/` | Fait, tests |
| Alerte `sortie_non_rentree`, une seule par sortie, tâche de fond | idem | Fait, tests |
| Lieu de pêche proposé depuis la trace | idem | Fait, tests |
| `origine_lieu` exposé, valeur `trace` | `backend/app/modules/captures/` | Fait, tests |
| Écart de température sur 30 jours, chlorophylle, aire protégée, signe de ressource obligatoire | `backend/app/modules/meteo_marine/oceano.py`, `service.py` | Fait, tests ; vérifié contre les vraies sources le 2026-11-27 |
| Application : départ en trois étapes (port du référentiel embarqué, port le plus proche présélectionné, ou position du téléphone), retour avec port facultatif, file hors ligne, bandeau, point de la sortie, origine du lieu | `mobile/src/` | Fait, tests Jest ; écrans non vus |
| Portail : panneau « Sorties en mer » (en retard, en cours, terminées, constat du retour), indicateurs du secteur, colonne « Lieu de pêche » des captures | `web/src/` | Fait ; panneau vérifié au navigateur |

### 4.2 Vérifications exécutées

- Serveur, suite complète sur une base de test dédiée (`pigap_lot11_test`, une autre session occupait `pigap_test`) : 323 réussis, 2 échecs. Le premier, `test_l8_alembic_head`, figeait l'ancienne tête de migration : mis à jour, vert. Le second, `test_webhook_mm_refuse_sans_secret_en_live`, échoue sur un délai réseau en appelant le vrai service de paiement ; il ne touche aucun fichier de ce lot.
- Serveur, tests du lot et de la météo-marine après le dernier changement : 30 réussis. `ruff check` sans erreur sur les fichiers du lot.
- Application : `npx tsc --noEmit` sans erreur ; Jest 17 suites, 124 tests réussis.
- Portail : `npx tsc -b` sans erreur ; `npm run build` réussi.
- Navigateur, portail local contre le serveur local, compte d'agent fictif : pastille du nombre de retards, onglets « En retard » (retard de 3 h 06 affiché) et « En cours », dernière position. Le constat du retour n'a pas été essayé à l'écran (couvert par les tests serveur).
- Sources réelles, 2026-11-27 : moyenne de température sur 30 jours et chlorophylle obtenues pour les huit secteurs (dernière image du 5 novembre) ; lecture d'environ 10 à 24 secondes, d'où le cache de 12 heures et le délai de 40 secondes.

- Navigateur à 375 px : le bouton « Sorties » faisait déborder la barre d'outils (459 px) et glisser toute la carte de 72 px, panneau coupé à gauche. Corrigé (`ui-kit.css`, scène étroite : la barre défile dans son propre cadre) et constaté : carte non décalée, panneau aligné.

### 4.3 Constat sur le score des secteurs

Sur le bulletin réel du 2026-11-27, les huit secteurs sortaient « favorables » : une mer calme et une eau dans la plage suffisaient à atteindre le seuil, sans aucun signe de ressource. Une règle « Proposé » exige désormais au moins un signe de ressource ; six secteurs sur huit restent favorables, parce que la chlorophylle est élevée ou en hausse presque partout. Les seuils sont donc à calibrer avec l'expert halieutique. Dans les estuaires, la turbidité fait surestimer la chlorophylle par satellite.

### 4.4 Non vérifié

- Écrans de l'application (aucun émulateur ni téléphone) ; essai de bout en bout application et serveur, y compris avec l'APK 0.3.0.
- Portail à 768 px ; à 375 px, seul le panneau des sorties a été contrôlé.
- Tâche de fond des retards sur un serveur hébergé.

### 4.5 Mise en ligne du 2026-11-27

| Élément | Action | Contrôle |
|---------|--------|----------|
| Fusion | PR #1 fusionnée dans `main` (`b23e63d`) | Contrôles automatiques au vert, aucun conflit |
| Serveur | Mis en ligne depuis une copie de `main` ; migration `b7c8d9e0f611` jouée au démarrage | `/health` « ok » ; `/api/v1/sorties` : 401 sans connexion (404 avant) |
| Portail | Mis en ligne depuis `main` | Le paquet servi contient le panneau « Sorties en mer » et vise le serveur de production |
| Application | Version 0.3.0 (code 6), version GitHub `v0.3.0-mobile`, accueil du portail mis à jour | Adresse de production contrôlée dans le paquet de l'APK |

Non contrôlé : le portail et le bulletin connectés en production (pas de connexion avec de vrais identifiants depuis l'outil), l'APK sur un téléphone.

### 4.6 Dettes et décisions

| Sujet | Proposition | Valideur |
|-------|-------------|----------|
| Seuils de `sorties.json` et `zones_favorables.json` | Calibrer au pilote | Christian, expert halieutique, DGPA |
| Arrêt du suivi GPS à « Je suis rentré », raccourcis 4, 8 et 12 h, conservation des sorties closes 7 jours sur le téléphone | Tel que livré | Christian |
| Listes des ports et des secteurs recopiées dans l'application | À resynchroniser si les référentiels changent | Christian |
| Organisation : aucune vue des sorties sur le portail (son espace n'a pas de suivi de flotte) | Inchangé | Christian |
| Seuils météo existants `METEO_*` encore dans l'environnement | À déplacer vers un paramétrage versionné | Christian |
