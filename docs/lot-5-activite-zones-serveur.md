# Lot 5, partie serveur : activité par zone et essai Global Fishing Watch

- **Statut :** compte rendu interne, projet soumis à validation humaine
- **Date :** 2026-11-24
- **Auteur :** session serveur (agent), pour Christian BEYEME
- **État :** présent en code dans `backend/`, non commité, non déployé
- **Liens :** [chantier de novembre 2026](chantier-evolutions-2026-11.md), [ADR-011](adr/ADR-011-global-fishing-watch-source-differee.md), [ADR-009](adr/ADR-009-suivi-temps-reel-sources-position.md), [étude du 2026-10-30](etude-localisation-sans-capteur-et-zones-favorables.md)

## 1. Compréhension

### 1.1 Problème

Le porteur veut voir sur la carte où les embarcations passent du temps, avec un filtre de dates, puis obtenir à la demande un rapport par zone (activité, embarcations présentes, captures, alertes). Il veut aussi exploiter la clé Global Fishing Watch qu'il a obtenue.

Deux sources ne se mélangent pas :

| Source | Ce qu'elle couvre | Ce qu'elle ne couvre pas |
|--------|-------------------|--------------------------|
| Positions de la plateforme (application, balises) | Les pirogues et navires inscrits qui émettent vers la plateforme | Les navires industriels non inscrits |
| Global Fishing Watch | Les navires qui émettent en AIS, vus par satellite, et des détections radar | Les pirogues ; le temps réel (96 heures de retard, 5 jours pour le radar) |

Les parties A, B et C reposent donc sur les seules données de la plateforme. La partie D est un essai à part, à l'arrêt par défaut.

### 1.2 Choix retenus et choix écartés

| Sujet | Retenu | Écarté, et pourquoi |
|-------|--------|---------------------|
| Unité de calcul | L'intervalle entre deux relevés consécutifs d'une même embarcation | Le relevé seul : il ne porte pas de durée, et l'application et les balises n'émettent pas au même rythme |
| Vitesse | Paramètre prévu, laissé vide | Un seuil chiffré : l'étude du 2026-10-30 (4.6) renvoie ce choix aux traces du pilote, nous ne fixons aucune valeur |
| Localisation d'un intervalle | Par son relevé de départ (maille, zone, abords d'un port, période) | Le partage de la durée entre deux mailles : plus fin, mais plus difficile à expliquer et à vérifier |
| Abords d'un port | Rayon de chaque port dans le référentiel des ports, le même que pour la présence au port | Un rayon propre, qui ferait deux définitions du port dans la plateforme |
| Calcul | À la demande, en base (fonctions de fenêtre et PostGIS) | Une table d'agrégats tenue à jour : inutile aux volumes actuels, à mesurer avant |
| Captures sans lieu de pêche | Comptées à part | Une attribution par le port de débarquement ou par la trace GPS : ce serait une supposition |
| Alertes d'une zone | Rattachées par la référence de zone ou par la position inscrite dans leur déclencheur | Le rattachement par l'embarcation, qui supposerait que l'alerte a eu lieu dans la zone |
| Cache de l'essai Global Fishing Watch | En mémoire du serveur | Une table en base : plus solide, mais prématurée pour un essai hors service (dette) |
| Paramètres | Deux fichiers versionnés, relus dès qu'ils changent | Le code ou l'environnement, interdits pour une règle métier |

### 1.3 Règles au statut « Proposé »

**Heures d'activité : Proposé (valideurs : Christian, expert halieutique).** Fichier `backend/app/data/regles/activite_zones.json`.

| Paramètre | Valeur proposée | Justification |
|-----------|-----------------|---------------|
| `intervalle_max_minutes` | 65 | Deux périodes d'émission d'une balise de l'État (30 minutes, ADR-009) et cinq minutes de marge : un message manqué reste toléré même si le suivant part avec un peu de retard |
| `vitesse_max_noeuds` | vide | Aucun seuil tant que les traces du pilote ne permettent pas de le calibrer ; tant qu'il est vide, toute présence en mer hors des abords d'un port compte |
| `taille_maille_deg` | 0,05 | Environ 5,6 km à l'équateur, du même ordre que les rayons des ports (5 à 8 km) |
| `exclusion_ports` | actif, rayon vide | Rayon de chaque port dans `ports.json` ; un rayon unique peut être imposé |
| `periode_defaut_jours`, `periode_max_jours`, `mailles_max` | 30, 366, 10 000 | Garde-fous de volume |

Règle en quatre phrases : les relevés d'une embarcation sont lus dans l'ordre du temps ; l'intervalle entre deux relevés consécutifs compte s'il dure au plus `intervalle_max_minutes` (et, si un seuil est fixé, si la vitesse moyenne ne le dépasse pas) ; il est localisé par son relevé de départ ; il appartient à la période si ce relevé s'y trouve. Deux périodes qui se suivent s'additionnent donc sans perte ni double compte.

**Autres propositions (valideur : Christian).**

| Proposition | Détail |
|-------------|--------|
| Rôles admis sur les mailles et les captures par zone | Le pêcheur y accède, limité à ses embarcations et à ses captures ; les rôles de pilotage voient toute la flotte. Le rôle organisation n'est pas admis : il n'a pas accès aux positions de ses membres ailleurs dans l'API, et l'admettre ici reviendrait à le lui donner (décision du porteur) |
| Filtre de source | Seuls les relevés de la source demandée sont lus, puis la règle s'applique. Pour une embarcation qui émet par les deux sources à la fois, les heures par source ne s'additionnent pas |
| Rapport de zone | Réservé à l'autorité, à l'agent de contrôle, à l'administrateur et au chercheur ; il nomme les embarcations présentes |
| Espèces | Regroupées par code canonique du référentiel (un alias ne crée pas une ligne à part) |
| Paramètres de l'essai Global Fishing Watch | Fichier `backend/app/data/regles/gfw_source.json` : période par défaut de 90 jours, période maximale de 366 jours, cache de 24 heures, budget de 200 requêtes par jour, attente maximale de 120 secondes |

### 1.4 Hypothèses à tester

1. La règle sans seuil de vitesse donne une carte lisible : à vérifier sur des traces réelles, les couloirs de transit risquent d'apparaître autant que les lieux de pêche.
2. Le lieu de pêche sera renseigné à la déclaration (lot 3) : aujourd'hui, 121 captures sur 2 634 de la base de développement portent une position (mesure du 2026-11-24), le reste tombe dans « sans position ».
3. Le calcul à la demande tient la charge du pilote : aucune mesure de charge n'a été faite.

## 2. Exécution

### 2.1 Ce qui est présent en code

| Fichier | Rôle |
|---------|------|
| `backend/app/core/regles.py` | Chargeur des paramétrages versionnés, relus à chaque changement, échec fermé |
| `backend/app/core/perimetre.py` | Périmètre d'un compte : embarcations et pêcheurs visibles selon le rôle |
| `backend/app/data/regles/activite_zones.json` | Règle « heures d'activité », statut Proposé |
| `backend/app/data/regles/gfw_source.json` | Paramètres de l'essai Global Fishing Watch |
| `backend/app/modules/activite/` | Parties A, B, C : règles, schémas, service, routes, README |
| `backend/app/modules/documents/` | Rapport de zone en PDF (`rapport_zone_pdf`, route `/documents/rapport-zone`) ; titres de section solidaires de leur tableau |
| `backend/app/modules/gfw/` | Partie D : paramètres, client HTTP, service, schémas, routes, README |
| `backend/app/core/config.py` | Réglages `GFW_ENABLED`, `GFW_API_TOKEN` (premier nom de la ligne accepté), `GFW_BASE_URL` |
| `backend/app/core/deps.py` | `require_role_puis_liberer` : rôle vérifié, puis connexion de base rendue avant un appel long |
| `backend/app/api/v1/__init__.py` | Enregistrement des deux nouveaux groupes de routes |
| `backend/scripts/essai_gfw.py` | Essai réel, à lancer à la main |
| `backend/app/tests/aides.py`, `test_lot5_activite_zones.py`, `test_lot5_gfw.py` | Aides et 39 tests |
| `.env.example` | Noms `GFW_ENABLED`, `GFW_API_TOKEN`, `PIGAP_REGLES_DIR` |

Aucune migration : le lot 5 ne crée ni table ni colonne.

### 2.2 Conventions communes aux points d'accès

- Préfixe `/api/v1`, en-tête `Authorization: Bearer <jeton de session>`.
- `debut` est inclus, `fin` est exclue. Sans fuseau, une date est lue en UTC. Sans dates : les 30 derniers jours (A, B, C).
- Zone : `zone_id` (zone réglementée) ou `secteur` (identifiant du référentiel), jamais les deux.
- Erreurs : `{"detail": "message en clair", "code": "CODE_STABLE"}`. Sans session : 401. Rôle non admis : 403. Objet inexistant ou hors périmètre : 404, sans distinction.
- Périmètre : le pêcheur ne voit que ses embarcations et ses captures ; autorité, agent, administrateur et chercheur voient toute la flotte ; le rôle organisation n'est pas admis (403).
- Dates acceptées : entre 1900 et 2200 ; au-delà, 400 `PERIODE_INVALIDE`.

| Code | Statut | Sens |
|------|--------|------|
| `PERIODE_INVALIDE` | 400 | Début postérieur ou égal à la fin, ou date hors des bornes acceptées |
| `PERIODE_TROP_LONGUE` | 400 | Période au-delà de la durée maximale du paramétrage |
| `EMPRISE_INVALIDE` | 400 | Emprise mal formée |
| `EMPRISE_TROP_LARGE` | 400 | Plus de mailles que le plafond : resserrer l'emprise ou la période |
| `ZONE_OU_SECTEUR` | 400 | Zone et secteur donnés ensemble, ou aucun des deux quand l'un est exigé |
| `ZONE_NOT_FOUND`, `SECTEUR_NOT_FOUND`, `EMBARCATION_NOT_FOUND` | 404 | Objet inexistant ou hors périmètre |
| `VALIDATION_ERROR` | 422 | Paramètre mal typé |
| `REGLE_INDISPONIBLE` | 503 | Fichier de paramétrage absent, incomplet ou illisible, ou dossier de paramétrage indiqué mais introuvable ; le fichier et le champ fautifs sont inscrits dans les journaux du serveur, la réponse ne les nomme pas |

### 2.3 A. Heures d'activité par maille

`GET /api/v1/activite/mailles`

Rôles : autorité, agent de contrôle, administrateur, chercheur, pêcheur (ce dernier limité à ses embarcations). Organisation : 403.

| Paramètre | Type | Défaut | Sens |
|-----------|------|--------|------|
| `debut`, `fin` | date et heure ISO 8601 | 30 derniers jours | Période |
| `emprise` | `lon min,lat min,lon max,lat max` | aucune | Rectangle en degrés décimaux, bornes basses incluses et bornes hautes exclues : deux emprises voisines ne comptent jamais deux fois le même relevé |
| `secteur` | texte | aucun | Identifiant d'un secteur de mer |
| `zone_id` | UUID | aucun | Zone réglementée |
| `embarcation_id` | UUID | aucun | Une seule embarcation (404 hors périmètre) |
| `source` | `mobile` ou `balise` | les deux | Seuls les relevés de cette source sont lus ; les heures par source ne s'additionnent pas pour une embarcation qui émet par les deux |

Réponse : collection GeoJSON, une entité par maille. `id` vaut « colonne:ligne » (indices de la maille). Les membres hors géométrie donnent la période appliquée, les totaux et la règle.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "160:-41",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[8.0, -2.05], [8.05, -2.05], [8.05, -2.0], [8.0, -2.0], [8.0, -2.05]]]
      },
      "properties": {
        "heures_activite": 1.0,
        "nb_embarcations": 1,
        "nb_intervalles": 4,
        "sources": ["mobile"]
      }
    }
  ],
  "periode": {"debut": "2003-07-04T21:25:00Z", "fin": "2003-07-05T04:25:00Z"},
  "emprise": null,
  "taille_maille_deg": 0.05,
  "filtres": {"secteur": null, "zone_id": "3ae8406b-0820-4713-bd15-a90d65c21af3", "embarcation_id": null, "source": null},
  "totaux": {"heures_activite": 2.0, "nb_embarcations": 2, "nb_intervalles": 6, "nb_mailles": 2},
  "regle": {
    "version": "2026-11-24",
    "statut": "Proposé",
    "parametres": {
      "intervalle_max_minutes": 65.0,
      "vitesse_max_noeuds": null,
      "taille_maille_deg": 0.05,
      "exclusion_ports": {"actif": true, "rayon_km": null},
      "periode_defaut_jours": 30,
      "periode_max_jours": 366,
      "mailles_max": 10000
    }
  },
  "genere_a": "2026-11-24T03:06:31Z"
}
```

Pour l'écran : colorer chaque maille selon `heures_activite`, afficher le statut de la règle (« Proposé ») près de la légende, proposer les filtres de dates, de secteur et de source. Les heures sont arrondies au centième. Les valideurs de la règle restent dans le fichier de paramétrage : l'API ne les diffuse pas.

`GET /api/v1/activite/secteurs` (mêmes rôles) renvoie les secteurs utilisables comme filtre :

```json
[
  {"id": "cocobeach", "nom": "Cocobeach et baie de la Mondah", "type": "cote", "lon": 9.45, "lat": 0.95, "rayon_km": 25.0},
  {"id": "estuaire", "nom": "Estuaire du Komo (Libreville, Owendo)", "type": "estuaire", "lon": 9.32, "lat": 0.32, "rayon_km": 22.0}
]
```

### 2.4 B. Captures par zone

`GET /api/v1/activite/captures-par-zone`

Rôles : les mêmes que pour les mailles, avec le même périmètre.

| Paramètre | Type | Sens |
|-----------|------|------|
| `zone_id` ou `secteur` | UUID ou texte | L'un des deux est exigé |
| `debut`, `fin` | date et heure ISO 8601 | Période, sur la date de capture |

Trois groupes disjoints, dont la somme égale les déclarations de la période : `dans_la_zone` (lieu de pêche connu, dans la zone), `sans_position` (aucun lieu de pêche, jamais attribuées), `positionnees_hors_zone`.

```json
{
  "zone": {"genre": "zone_reglementee", "id": "3ae8406b-0820-4713-bd15-a90d65c21af3", "nom": "Zone exemple lot 5 (fictive)", "type": "sensible"},
  "periode": {"debut": "2003-07-04T21:25:00Z", "fin": "2003-07-05T04:25:00Z"},
  "dans_la_zone": {
    "quantite_kg": 60.5,
    "nb_declarations": 2,
    "par_espece": [
      {"espece": "sardine", "nom": "Sardine", "quantite_kg": 42.5, "nb_declarations": 1},
      {"espece": "mulet", "nom": "Mulet", "quantite_kg": 18.0, "nb_declarations": 1}
    ]
  },
  "sans_position": {
    "quantite_kg": 9.0,
    "nb_declarations": 1,
    "par_espece": [{"espece": "sardine", "nom": "Sardine", "quantite_kg": 9.0, "nb_declarations": 1}]
  },
  "positionnees_hors_zone": {"quantite_kg": 0.0, "nb_declarations": 0, "par_espece": []},
  "genere_a": "2026-11-24T03:06:31Z"
}
```

### 2.5 C. Rapport de zone

`GET /api/v1/activite/rapport-zone` (JSON) et `GET /api/v1/documents/rapport-zone` (PDF, en pièce jointe).

Rôles : autorité, agent de contrôle, administrateur, chercheur. Pêcheur et organisation : 403. Chaque consultation écrit une ligne au journal des accès (`ressource = rapport_zone`, `action = consultation` ou `export_pdf`).

Paramètres : `zone_id` ou `secteur` (l'un des deux exigé), `debut`, `fin`.

```json
{
  "zone": {"genre": "zone_reglementee", "id": "e0105ecb-ebac-4a8d-87ba-3f6d9c017496", "nom": "Zone exemple lot 5 (fictive)", "type": "sensible"},
  "periode": {"debut": "2010-05-22T22:03:00Z", "fin": "2010-05-23T05:03:00Z"},
  "activite": {"heures_activite": 2.0, "nb_embarcations_actives": 2, "nb_intervalles": 6},
  "nb_embarcations_presentes": 2,
  "embarcations": [
    {
      "embarcation_id": "e7335821-380f-407e-be4b-fe57a20f1abf",
      "nom": "Pirogue EX 5085daf0",
      "immatriculation": "GA-EX-5085daf0",
      "type": "pirogue",
      "nb_releves": 5,
      "premier_releve": "2010-05-22T23:03:00Z",
      "dernier_releve": "2010-05-23T00:03:00Z",
      "heures_activite": 1.0,
      "sources": ["mobile"]
    }
  ],
  "captures": {
    "dans_la_zone": {"quantite_kg": 60.5, "nb_declarations": 2, "par_espece": [{"espece": "sardine", "nom": "Sardine", "quantite_kg": 42.5, "nb_declarations": 1}]},
    "sans_position": {"quantite_kg": 9.0, "nb_declarations": 1, "par_espece": [{"espece": "sardine", "nom": "Sardine", "quantite_kg": 9.0, "nb_declarations": 1}]},
    "positionnees_hors_zone": {"quantite_kg": 0.0, "nb_declarations": 0, "par_espece": []}
  },
  "alertes": {
    "total": 2,
    "par_type": {"anomalie": 1, "zone_interdite": 1},
    "par_gravite": {"attention": 1, "critique": 1},
    "elements": [
      {"id": "5ab9b5d9-2772-4a4b-abbf-45d4474db1b6", "type": "anomalie", "niveau_gravite": "attention", "statut": "traitee", "horodatage": "2010-05-22T23:03:00Z", "regle": "concentration_zone", "embarcation_id": null}
    ],
    "sans_position": 0
  },
  "regle": {"version": "2026-11-24", "statut": "Proposé", "parametres": {}},
  "genere_a": "2026-11-24T03:07:10Z"
}
```

Précisions :

- « Embarcation présente » : au moins un relevé dans la zone sur la période. « Embarcation active » : au moins un intervalle compté. La liste est bornée à 200 embarcations (40 dans le PDF), le total reste exact.
- Alertes : celles de la période (date de création de l'alerte) qui portent la référence de la zone ou dont la position se trouve dans la zone. `sans_position` compte les alertes de la période sans lieu connu : elles ne sont rattachées à aucune zone. La liste est bornée aux 50 plus récentes (25 dans le PDF), les comptes restent exacts.
- Le PDF reprend le même calcul, avec le bandeau et l'avertissement des autres documents. Quand une liste y est coupée, son titre le dit (« les 40 premières par nombre de relevés », « 25 sur N »).

### 2.6 D. Essai Global Fishing Watch

Préfixe `/api/v1/gfw`. Rôles : autorité, agent de contrôle, administrateur. Tout autre rôle : 403.

Garde-fous :

- à l'arrêt par défaut (`GFW_ENABLED` faux). À l'arrêt, ou sans jeton, les routes de données répondent 503 sans aucun appel à l'éditeur ;
- le jeton est lu côté serveur (`GFW_API_TOKEN`, ou la ligne déjà posée sous son premier nom), enveloppé pour ne jamais s'afficher, et ne sort que dans l'en-tête de la demande à l'éditeur ;
- un seul rapport à la fois (verrou) ; une demande identique à celle qui vient d'aboutir profite de son résultat ;
- réponses en cache 24 heures ; sur une panne passagère de l'éditeur (délai, erreur de son côté, limite de débit), la dernière réponse est resservie, marquée périmée ; sur un refus (accès retiré, demande rejetée), elle ne l'est pas ;
- la connexion de base est rendue dès que le rôle est vérifié : une demande qui attend l'éditeur n'en garde aucune, et quelques rapports lents ne figent pas le reste de l'API ;
- budget de 200 appels par jour et par serveur ;
- aucune écriture en base, aucune alerte : un test d'architecture interdit au module d'importer les alertes, les notifications et la session de base.

| Méthode et chemin | Paramètres | Contenu |
|-------------------|------------|---------|
| `GET /gfw/etat` | aucun | Essai activé ou non, jeton présent ou non, mention, retards ; aucun appel à l'éditeur |
| `GET /gfw/peche-apparente` | `debut`, `fin` (AAAA-MM-JJ) | Heures de pêche apparente par mois et par pavillon |
| `GET /gfw/navires` | `debut`, `fin` | Navires observés et heures par navire |
| `GET /gfw/detections-radar` | `debut`, `fin` | Détections radar par mois et par pavillon |
| `GET /gfw/evenements-peche` | `debut`, `fin` | Épisodes de pêche apparente, avec un lieu par point (carte). Côté éditeur : `POST /v3/events` (un `GET` avec `region-id` est refusé). L'éditeur répond `201 Created` ; le client l'accepte comme une lecture réussie. |
| `GET /gfw/navires/{vessel_id}` | identifiant donné par `/gfw/navires` | Fiche d'identité : registres publics d'un côté, identité émise de l'autre |

Sans dates, la période se termine au dernier jour publié par l'éditeur et couvre 90 jours. Les bornes sont transmises telles quelles à l'éditeur ; lors des deux essais, une période du 2026-08-01 au 2026-11-01 a renvoyé août, septembre et octobre.

Bloc commun à chaque réponse de données (valeurs fictives) :

```json
{
  "periode": {"debut": "2001-03-01", "fin": "2001-05-01"},
  "fraicheur": {
    "donnees_jusqu_au": "2001-05-06",
    "retard_publication_heures": 96,
    "recupere_a": "2001-05-10T12:00:00Z",
    "en_cache": false,
    "perime": false,
    "periode_incomplete": false,
    "resultat_partiel": false
  },
  "attribution": {"mention": "Powered by Global Fishing Watch.", "lien": "https://globalfishingwatch.org"},
  "zone": {"identifiant": 8476, "jeu": "public-eez-areas", "nom": "ZEE du Gabon"},
  "avertissement": "Pêche apparente : estimation de l'éditeur à partir des émissions AIS des navires. C'est un indice pour orienter un contrôle, pas la preuve d'une infraction. Les embarcations sans AIS, dont les pirogues, n'y figurent pas."
}
```

- `donnees_jusqu_au` : dernier jour publié à la date où l'éditeur a répondu, compte tenu de son retard. `recupere_a` : date de cette réponse, conservée quand elle vient du cache. Une réponse resservie garde donc sa fraîcheur d'origine.
- `periode_incomplete` : la période demandée dépasse le dernier jour publié ; elle n'est jamais tronquée en silence.
- `resultat_partiel` : l'éditeur annonce une suite de résultats que la plateforme ne lit pas (dette).
- L'écran doit afficher la mention avec son lien, la période et la date de fraîcheur, et parler de « pêche apparente » et d'« indice », jamais d'infraction.

Champs propres à chaque réponse (valeurs fictives) :

```json
{
  "total_heures": 174.75,
  "par_mois": [{"mois": "2001-03", "heures": 120.75}, {"mois": "2001-04", "heures": 54.0}],
  "par_pavillon": [{"pavillon": "AAA", "heures": 150.5}, {"pavillon": "BBB", "heures": 20.25}, {"pavillon": null, "heures": 4.0}]
}
```

```json
{
  "total_heures": 174.75,
  "nb_navires": 2,
  "navires": [
    {
      "vessel_id": "aaaa1111-fictif",
      "nom": "NAVIRE FICTIF UN",
      "pavillon": "AAA",
      "mmsi": "999000001",
      "numero_omi": "9990001",
      "indicatif": "FICT1",
      "engin": "trawlers",
      "heures": 120.5,
      "premiere_entree": "2001-03-02T00:00:00Z",
      "derniere_sortie": "2001-04-20T06:30:00Z"
    }
  ]
}
```

```json
{
  "total_detections": 50,
  "par_mois": [{"mois": "2001-03", "detections": 42}, {"mois": "2001-04", "detections": 8}],
  "par_pavillon": [{"pavillon": null, "detections": 38}, {"pavillon": "AAA", "detections": 12}]
}
```

Un pavillon vide regroupe, pour le radar, les détections que l'éditeur n'a rapprochées d'aucun navire émetteur. Les pavillons sont les codes de l'éditeur, sans traduction.

Fiche d'identité (`/gfw/navires/{vessel_id}`, valeurs fictives) :

```json
{
  "vessel_id": "aaaa1111-fictif",
  "registre": [{"nom": "NAVIRE FICTIF UN", "pavillon": "AAA", "mmsi": "999000001", "numero_omi": "9990001", "indicatif": "FICT1", "engins": ["TRAWLERS"], "longueur_m": 42.5, "jauge_brute": 380.0, "du": "1999-01-01T00:00:00Z", "au": "2001-04-20T00:00:00Z"}],
  "emission": [{"vessel_id": "aaaa1111-fictif", "nom": "NAVIRE FICTIF UN", "pavillon": "AAA", "mmsi": "999000001", "numero_omi": "9990001", "indicatif": "FICT1", "premiere_emission": "1999-02-01T00:00:00Z", "derniere_emission": "2001-04-20T00:00:00Z"}],
  "proprietaires": [{"nom": "ARMEMENT FICTIF", "pavillon": "AAA", "du": "1999-01-01T00:00:00Z", "au": "2001-04-20T00:00:00Z", "sources": ["REGISTRE-FICTIF"]}],
  "autorisations": [{"sources": ["ORGANISATION-FICTIVE"], "du": "2000-01-01T00:00:00Z", "au": "2001-01-01T00:00:00Z"}],
  "fraicheur": {"recupere_a": "2001-05-10T12:00:00Z", "en_cache": false, "perime": false},
  "attribution": {"mention": "Powered by Global Fishing Watch.", "lien": "https://globalfishingwatch.org"},
  "avertissement": "Identité réunie par l'éditeur à partir de registres publics et des émissions AIS. Une autorisation publique ne prouve pas la conformité du navire."
}
```

`GET /gfw/etat` (réponse réelle du serveur de développement, essai à l'arrêt) :

```json
{
  "active": false,
  "jeton_configure": true,
  "zone": {"identifiant": 8476, "jeu": "public-eez-areas", "nom": "ZEE du Gabon"},
  "attribution": {"mention": "Powered by Global Fishing Watch.", "lien": "https://globalfishingwatch.org"},
  "retard_publication_heures": {"peche_apparente": 96, "detections_radar": 120},
  "cache_heures": 24.0,
  "statut": "Proposé",
  "version": "2026-11-24"
}
```

Codes d'erreur de l'essai :

| Code | Statut | Sens |
|------|--------|------|
| `GFW_DESACTIVE` | 503 | Essai à l'arrêt sur ce serveur |
| `GFW_JETON_ABSENT` | 503 | Essai activé sans jeton |
| `GFW_RAPPORT_EN_COURS` | 503 | Un autre rapport occupe le verrou au-delà du délai |
| `GFW_LIMITE_EDITEUR` | 503 | L'éditeur refuse pour cause de rapport en cours ou de quota |
| `GFW_BUDGET_ATTEINT` | 429 | Budget du jour atteint côté plateforme |
| `GFW_ACCES_REFUSE`, `GFW_DEMANDE_REFUSEE`, `GFW_INDISPONIBLE`, `GFW_REPONSE_ILLISIBLE` | 502 | Refus ou panne côté éditeur ; son message n'est pas relayé |
| `GFW_DELAI_DEPASSE` | 504 | Pas de réponse à temps |
| `GFW_INTROUVABLE` | 404 | Navire inconnu de l'éditeur |

### 2.7 Vérification

Commandes, depuis `backend/` :

```bash
.venv/bin/python -m pytest app/tests/test_lot5_activite_zones.py app/tests/test_lot5_gfw.py -q
.venv/bin/python -m pytest
.venv/bin/ruff check app
.venv/bin/black --check app
```

Résultats : voir la section 2.12.

Tests d'acceptation et de périmètre (39) :

| Partie | Tests |
|--------|-------|
| A, acceptation | `test_l5_a_heures_par_maille_en_geojson`, `test_l5_a_releve_en_bord_de_maille`, `test_l5_a_filtres_source_emprise_secteur`, `test_l5_a_abords_du_port_exclus`, `test_l5_a_periodes_qui_se_suivent_s_additionnent` |
| A, règle non codée en dur | `test_l5_a_regle_parametree_sans_toucher_au_code`, `test_l5_a_fichier_de_regles_absent_ou_incomplet_echec_ferme`, `test_l5_a_regle_du_depot_proposee_et_lisible`, `test_l5_a_trop_de_mailles_demande_refusee` |
| A, périmètre et refus | `test_l5_a_perimetre_par_role`, `test_l5_a_demandes_invalides` |
| B | `test_l5_b_captures_par_zone_sans_position_a_part`, `test_l5_b_captures_par_secteur_et_perimetre`, `test_l5_b_zone_ou_secteur_obligatoire` |
| C | `test_l5_c_rapport_de_zone_json` (journal des accès compris), `test_l5_c_rapport_de_zone_pdf`, `test_l5_c_rapport_de_zone_reserve_au_pilotage` |
| D, arrêt et rôles | `test_l5_d_reglages_a_l_arret_par_defaut_et_alias_du_jeton`, `test_l5_d_a_l_arret_aucun_appel_a_l_editeur`, `test_l5_d_sans_jeton_echec_ferme`, `test_l5_d_roles_autorite_agent_administrateur_seulement` |
| D, contenu | `test_l5_d_peche_apparente_par_mois_et_par_pavillon`, `test_l5_d_navires_observes`, `test_l5_d_detections_radar`, `test_l5_d_fiche_d_identite_d_un_navire`, `test_l5_d_periode_par_defaut_incomplete_et_bornes`, `test_l5_d_suite_de_resultats_signalee` |
| D, cache, verrou, budget, erreurs | `test_l5_d_cache_un_rapport_demande_une_fois`, `test_l5_d_fraicheur_d_une_reponse_en_cache`, `test_l5_d_un_seul_rapport_a_la_fois`, `test_l5_d_rapport_en_cours_trop_long`, `test_l5_d_connexion_de_base_rendue_pendant_l_appel_a_l_editeur`, `test_l5_d_budget_de_requetes_par_jour`, `test_l5_d_erreurs_de_l_editeur_et_jeton_jamais_renvoye`, `test_l5_d_reponse_perimee_resservie_si_l_editeur_ne_repond_plus`, `test_l5_d_pas_de_repli_quand_l_editeur_refuse_l_acces` |
| D, paramétrage et architecture | `test_l5_d_parametrage_versionne_et_echec_ferme`, `test_l5_d_parametrage_du_depot_lisible`, `test_l5_d_aucune_alerte_ni_ecriture_en_base` |

Les tests de la partie D ne touchent pas le réseau : l'éditeur est remplacé par un simulateur branché sur le transport HTTP, ce qui vérifie la demande réellement construite (adresse, paramètres, en-tête).

Méthode d'isolement : les tests écrivent dans la base de développement sans rien supprimer. Chacun se place dans une fenêtre de temps tirée au hasard entre 1990 et 2014 ; les positions et les alertes sont insérées directement en base, pour ne pas déclencher les règles d'alerte à chaque relevé ; les zones d'essai sont créées inactives. Les captures, elles, passent par l'API.

Rendu du PDF : contrôlé à l'œil sur un rapport d'exemple (deux pages, tableaux alignés, accents corrects).

### 2.8 Essai réel Global Fishing Watch, lancé à la main

Commande : `.venv/bin/python scripts/essai_gfw.py --debut 2026-08-01 --fin 2026-11-01`, le 2026-11-24. Le script active l'essai pour son seul processus ; `GFW_ENABLED` reste faux et la plateforme reste à l'arrêt. Le jeton a été lu par l'application sous le premier nom de la ligne, sans modifier le fichier d'environnement et sans jamais s'afficher.

| Appel | Durée | Résultat |
|-------|-------|----------|
| Pêche apparente par mois et par pavillon | 6,0 s | 4 157,61 h : 858,38 en août, 1 018,43 en septembre, 2 280,79 en octobre ; Chine 2 595,5 h, Maroc 1 429,38 h, Panama 132,72 h |
| Navires observés | 4,0 s | 10 navires, 4 157,61 h ; nom, pavillon, MMSI, indicatif et engin renseignés ; numéro OMI vide sur les cinq premiers |
| Détections radar | 3,5 s | 1 110 : 382 en août, 334 en septembre, 394 en octobre ; 567 sans navire rapproché |
| Fiche d'identité du premier navire | 3,3 s | Identité émise présente ; aucune ligne de registre, de propriétaire ni d'autorisation pour ce navire |
| Pêche apparente, seconde demande | 0,0 s | Resservie depuis le cache |

Ces chiffres recoupent l'essai du matin (4 158 h, 10 navires, 1 110 détections). Quatre requêtes ont été envoyées à l'éditeur. Constats utiles :

- l'identifiant de navire d'un rapport ouvre bien la fiche d'identité (la documentation ne le dit pas) ;
- le regroupement par pavillon fonctionne pour le radar (la documentation ne le confirme pas) ;
- la fiche d'identité peut ne contenir que l'identité émise : le volet « registre » n'est pas garanti.

Non essayé : la suite de résultats au-delà d'une page, le refus de l'éditeur pour rapport simultané, les périodes de plus de trois mois.

### 2.9 Limites connues

1. Le calcul ne refiltre pas les relevés par le masque d'eau : un relevé ancien posé à terre compterait.
2. Un relevé sur deux mailles ou deux secteurs voisins : la durée va à la maille du relevé de départ ; deux secteurs qui se recouvrent comptent chacun le relevé.
3. La date d'une alerte est celle de sa création, pas celle de l'évènement.
4. Sans seuil de vitesse, le transit compte comme l'activité.
5. Global Fishing Watch : cache perdu au redémarrage et propre à chaque processus ; pavillons en codes de l'éditeur ; aucun évènement (rencontres, escales, interruptions d'AIS) ni tuile de carte de chaleur ; usage non commercial seulement ; la borne de fin d'une période paraît exclue chez l'éditeur (deux essais), ce qui reste à lui faire confirmer.
6. Le filtre de source lit une source à la fois : pour une embarcation qui émet par l'application et par une balise en même temps, les heures par source ne s'additionnent pas.
7. Si le fichier des ports est absent ou illisible, le référentiel des ports retombe sur une liste codée dans un module ancien (`ais_gabon/ports.py`) : l'exclusion des abords des ports s'appliquerait alors à cette liste, sans signal.
8. Aucune mesure de charge.

### 2.10 Dettes

| Dette | Pourquoi plus tard |
|-------|--------------------|
| Table d'agrégats journaliers pour les mailles | À décider sur mesure du temps de réponse avec les volumes du pilote |
| Cache de l'essai en base, suite de résultats, en-tête `Retry-After`, mémoire courte des échecs (des demandes répétées sur un navire inconnu consomment le budget du jour) | Utile seulement si l'essai passe en service |
| Référentiel des ports : échec fermé au lieu de la liste de repli | Module ancien, hors lot |
| Limitation de débit des routes coûteuses | Absente de toute l'API aujourd'hui |
| Réponses 401 et 403 sans champ `code` | Convention existante de l'API, relevée lors de la revue du 2026-07-28 |
| Base de test isolée | Cinq tests anciens échouent sur la base partagée (section 2.12) |
| Lint | `ruff` et `black` échouent déjà sur le dernier commit, hors de ce lot (section 2.12) |

### 2.11 Suite, avec critères d'acceptation

1. **Portail (après le lot 1) :** couche « heures d'activité » sur la carte, filtre de dates, de secteur et de source ; mention du statut « Proposé » ; bouton de rapport de zone (JSON à l'écran, PDF en téléchargement). Accepté si la somme des mailles affichées égale `totaux.heures_activite` et si un pêcheur connecté ne voit que ses embarcations.
2. **Portail, volet Global Fishing Watch :** panneau masqué tant que `/gfw/etat` renvoie `active: false` ; mention, période et date de fraîcheur visibles ; vocabulaire « pêche apparente » et « indice ».
3. **Mobile :** le lieu de pêche à la déclaration (lot 3) alimente `dans_la_zone` ; sans lui, les captures restent « sans position ».
4. **Règle :** validation des quatre paramètres par le porteur et l'expert halieutique, puis passage du statut à « Validé » dans le fichier.

### 2.12 Résultats de la vérification

| Contrôle | Résultat |
|----------|----------|
| Tests du lot 5 (`test_lot5_activite_zones.py`, `test_lot5_gfw.py`) | 39 passés (17 et 22), après les corrections de la revue |
| Suite complète, dernier passage (les trois lots et leurs corrections, revue du lot 2 comprise) | 235 passés, 5 échoués, tous étrangers au lot |
| `ruff check app`, `black --check app` | 14 erreurs et 11 fichiers à reformater, à l'identique du dernier commit ; aucun fichier du lot |
| Essai réel Global Fishing Watch | Concluant (section 2.8) |
| Revue indépendante du code | Faite : aucun bloquant pour la livraison, essai à l'arrêt |

Les cinq échecs du dernier passage appartiennent à un même ensemble de huit tests anciens, permanents ou instables, tous reproduits sur un export du dernier commit, sans aucune modification : `test_m6_dashboard` (alertes actives), `test_paiement_msisdn` (deux tests, numéro de téléphone fixe déjà en base) et `test_predictions` (deux tests) échouent à chaque passage ; `test_m7_alertes` (zone interdite), `test_redevances` (indicateurs d'effort) et `test_dashboard_series` (semaine unique) ne tombent pas à chaque passage et sont passés cette fois. Cause commune : les tests écrivent dans la base de développement sans purge, et chaque passage de la suite aggrave l'état (embarcations : 1 814 au début de la session, plus de 2 600 à la fin ; alertes : 12 444, puis plus de 21 000).

Corrections apportées après la revue : connexion de base rendue avant l'appel à l'éditeur (préalable à toute activation) ; échec fermé quand le dossier de paramétrage indiqué est introuvable ; fraîcheur d'une réponse en cache calculée à la date de la réponse ; pas de repli sur une ancienne réponse quand l'éditeur refuse l'accès ; dates extrêmes refusées (400) ; emprise demi-ouverte ; tri départagé ; périmètre réappliqué avec le filtre par embarcation ; rôle organisation retiré des mailles et des captures par zone ; valideurs non diffusés par l'API ni imprimés dans le PDF ; listes coupées annoncées dans le PDF ; intervalle maximal proposé porté à 65 minutes.

### 2.13 Texte proposé pour le journal

```
## [2026-11-24] : Lot 5, partie serveur : activité par zone et essai Global Fishing Watch

**Ce qui a été construit :**
- Heures d'activité par maille en GeoJSON (`GET /api/v1/activite/mailles`), calculées depuis les positions de la plateforme, filtrables par période, emprise, secteur, zone, embarcation et source
- Captures par zone ou par secteur (`GET /api/v1/activite/captures-par-zone`) : volumes par espèce, captures sans lieu de pêche comptées à part
- Rapport de zone à la demande, en JSON et en PDF (`/activite/rapport-zone`, `/documents/rapport-zone`) : activité, embarcations présentes, captures, alertes ; consultation inscrite au journal des accès
- Module `gfw` (ADR-011) à l'arrêt par défaut : pêche apparente par mois et par pavillon, navires observés, détections radar, fiche d'identité ; cache, verrou d'un rapport à la fois, budget de requêtes
- Paramétrages versionnés `backend/app/data/regles/` : règle « heures d'activité » au statut Proposé, paramètres de l'essai

**Pourquoi :** compléments 12 et 13 du porteur (chantier de novembre 2026) ; les données de la plateforme sont les seules à couvrir les pirogues, celles de l'éditeur complètent le tableau pour les navires industriels.

**Principes :** règle hors du code et hors de l'environnement ; périmètre par rôle, 404 hors périmètre, échec fermé ; rien n'est attribué à une zone par supposition ; les données de l'éditeur ne déclenchent aucune alerte.

**Tests réalisés :** 39 tests nommés (acceptation, périmètre par rôle, règle paramétrée, éditeur simulé sans réseau) ; essai réel lancé à la main sur la ZEE du Gabon (4 157,61 h, 10 navires, 1 110 détections, quatre requêtes).

**Points ouverts :** validation de la règle par le porteur et l'expert halieutique ; accord écrit de l'éditeur avant toute mise en service ; partie portail après le lot 1.
```

### 2.14 Résumé

1. Présent en code, non commité : mailles d'activité en GeoJSON, captures par zone, rapport de zone en JSON et en PDF, module Global Fishing Watch à l'arrêt par défaut.
2. 39 tests nommés verts ; essai réel concluant (4 157,61 h, 10 navires, 1 110 détections, quatre requêtes) ; revue indépendante faite, ses retours corrigés.
3. Non vérifié : charge ; suite de résultats de l'éditeur ; sens exact de la borne de fin chez l'éditeur.
4. Huit tests anciens échouent ou vacillent sur la base partagée (cinq au dernier passage), lint déjà rouge sur le dernier commit : sans lien avec ce lot.
5. Décisions du porteur : valider la règle « heures d'activité » (intervalle de 65 minutes, pas de seuil de vitesse, maille de 0,05 degré, abords des ports exclus) avec l'expert halieutique.
6. Décisions du porteur : accord écrit de l'éditeur avant `GFW_ENABLED=true` ; renommer la ligne du fichier d'environnement en `GFW_API_TOKEN`.
7. Décisions du porteur : ouvrir ou non les mailles et les captures par zone au rôle organisation ; liste nominative des embarcations d'un rapport de zone pour le chercheur.
