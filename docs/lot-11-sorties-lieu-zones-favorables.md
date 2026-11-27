# Lot 11 : sorties en mer, lieu de pêche proposé, zones favorables enrichies

- **Statut :** livré en code (branche `feature/lot-11-sorties-zones-favorables`)
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

| Élément | Statut |
|---------|--------|
| Modèle `Sortie` + migration `b7c8d9e0f611` | Fait |
| API sorties / retour / lieu-de-peche | Fait |
| Alerte `sortie_non_rentree` (une fois) | Fait |
| `origine_lieu` exposé (`gps` / `saisie` / `trace`) | Fait |
| Score favorable : SST 30 j, chlorophylle, aire protégée | Fait |
| Mobile (SortieSheet, sync hors ligne) | Fait |
| Portail (SortiesPanel) | Fait |
| Tests `test_lot11_sorties.py` + `test_lot11_zones_favorables.py` | Vérifié (20 passed) |
| Règles métier ADR-016 | Non validées (statut Proposé) |
| Boucle fond serveur en production | À confirmer après déploiement |

**Dettes :** validation humaine des seuils `sorties.json` / `zones_favorables.json` ; APK terrain à republier avec sync sorties.
