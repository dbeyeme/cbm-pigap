# AIS — navires dans les eaux gabonaises (ADR-005, révisé 2026-09-20)

## Objectif

Afficher les **navires équipés AIS** présents dans les eaux gabonaises (ZEE et
zones portuaires : Owendo, Libreville, Port-Gentil, Cap Lopez, Mayumba,
Cocobeach), avec leur statut opérationnel (à quai, au mouillage, en route, en
pêche), sans les mélanger aux pirogues suivies par GPS PIGAP.

## Ce qui a changé le 2026-09-20 et pourquoi

| Constat | Correction |
|---------|------------|
| La collecte durait 25 s toutes les 60 s ; un navire à quai n'émet que toutes les 3 min → il n'était presque jamais vu, et l'état était **remplacé** à chaque fenêtre. | **Connexion AISStream permanente** + **état de flotte accumulé** (`fleet.py`) : dernière position par MMSI, expiration 30 min (en route) / 180 min (immobile). |
| Le polygone ZEE Marine Regions **exclut le bassin de Port-Gentil** et les estuaires (eaux intérieures). | Filtre = ZEE **élargie d'une marge côtière** (`AIS_COASTAL_BUFFER_DEG`, défaut 0,12°). Test : Port-Gentil et Owendo acceptés, intérieur des terres refusé. |
| Aucune notion de port : impossible de répondre à « quels navires sont à Owendo ? ». | Référentiel `data/open-data/gabon/ports.json` + `GET /ais/ports` + champs `port_proche`, `statut_nav`, `type_label`, `destination`, `age_s` sur chaque navire. |
| **Mesure du 2026-09-20 :** clé AISStream valide (64 navires en 15 s sur la Manche) mais **0 message en 150 s sur tout le Gabon** et 5 navires par minute sur l'ensemble Lagos → Luanda. Open Waters : 0 navire. Les réseaux communautaires n'ont pratiquement **aucune station réceptrice** sur le littoral gabonais. | **Ingestion de récepteurs AIS locaux** (`POST /ais/ingest`) : un récepteur VHF à Owendo et un à Port-Gentil voient tous les navires à quai et au mouillage dans un rayon de 20 à 40 milles. |

## Fiche navire, approches et pavillon (ajout 2026-09-20, soir)

- `GET /ais/vessels/{mmsi}` : **identification** (nom, MMSI, IMO, indicatif, type,
  longueur, destination, pavillon déduit du MMSI via la table UIT des MID),
  **régularité** (correspondance avec le registre PIGAP par nom, indicatif ou
  MMSI ; zones réglementées touchées via PostGIS ; statut du pêcheur ; pavillon de
  libre immatriculation), **localisation** (position, port, vitesse et route,
  dernier message, route récente jusqu'à 120 positions, position estimée à
  l'estime, entrée prévue). Verdict `conforme`, `a_verifier` ou `alerte` avec motifs.
- **Zone de veille élargie** (`AIS_WIDE_BBOX`, défaut golfe de Guinée de la Côte
  d'Ivoire à l'Angola) : les navires hors eaux gabonaises sont conservés et leur
  route est extrapolée (cap et vitesse constants, `navigation.py`). Ceux dont la
  route coupe les eaux gabonaises dans l'horizon (`AIS_PREDICTION_HORIZON_H`, 48 h)
  apparaissent dans `approches` avec l'heure et le point d'entrée prévus. C'est le
  « croisement des signaux » entre le nord et le sud du golfe : un navire vu au
  large du Nigeria ou de l'Angola est annoncé avant d'entrer dans la ZEE.
- Limite : l'extrapolation suppose une route constante ; elle est présentée comme
  une estimation, jamais comme une position mesurée.

## Endpoints

| Méthode | Chemin | Rôles | Description |
|---------|--------|-------|-------------|
| GET | `/api/v1/ais/live?refresh=` | agent, autorité, admin, chercheur | Flotte accumulée + état du flux + présence par port |
| GET | `/api/v1/ais/ports` | idem | Détail par port (effectifs et liste des navires) |
| GET | `/api/v1/ais/status` | idem | État de la connexion AISStream |
| GET | `/api/v1/ais/vessels/{mmsi}` | idem | Fiche navire : identification, régularité, localisation, route récente |
| POST | `/api/v1/ais/ingest` | clé `X-AIS-Ingest-Key` | Messages d'un récepteur local (JSON AIS-catcher ou NMEA brut) |

## Sources (fusionnées dans le même état de flotte)

1. **Récepteurs locaux** (`local:<id>`) — seule source fiable pour les ports gabonais.
2. **AISStream** WebSocket permanent (clé gratuite [aisstream.io](https://aisstream.io)) — messages de position (classe A et B) et données statiques (nom, type, destination, dimensions).
3. **Open Waters** REST (complément, désactivable `AIS_OPENWATERS_ENABLED=false`).
4. Snapshot disque `data/open-data/gabon/ais_zee_snapshot.geojson` rechargé au démarrage (positions marquées `snapshot`, expirées après 24 h).
5. Démo uniquement si `AIS_DEMO_WHEN_EMPTY=true`.

## Raccorder un récepteur AIS local

Matériel : récepteur AIS double canal (dAISy, ou clé RTL-SDR + antenne VHF marine
placée en hauteur au port) et un petit ordinateur (Raspberry Pi) exécutant
[AIS-catcher](https://github.com/jvde-github/AIS-catcher) (logiciel libre, MIT).

```bash
# Sur l'ordinateur du port — envoi HTTP JSON vers la plateforme toutes les 30 s
AIS-catcher -d:0 -gr TUNER auto \
  -H https://<api>/api/v1/ais/ingest INTERVAL 30 \
     HEADER "X-AIS-Ingest-Key: <clé>" \
     ID owendo-quai-1 PROTOCOL aprs
```

Si le récepteur ne sait émettre que du NMEA (UDP), un relais minimal envoie les
trames sous la forme `{"recepteur": "pg-quai-1", "nmea": ["!AIVDM,…"]}` ; le
décodage est assuré par `pyais`.

Côté plateforme :

```bash
AIS_INGEST_KEY=$(openssl rand -hex 24)   # à partager avec le récepteur
```

Le panneau Surveillance affiche « N récepteur(s) local(aux) actif(s) » dès la
première trame reçue (fenêtre de 15 min).

## Configuration

```bash
AIS_ENABLED=true
AISSTREAM_API_KEY=            # flux communautaire (complément)
AIS_COASTAL_BUFFER_DEG=0.12   # marge côtière ajoutée à la ZEE
AIS_TTL_MOVING_MIN=30         # conservation d'une position en route
AIS_TTL_MOORED_MIN=180        # conservation d'une position immobile
AIS_INGEST_KEY=               # récepteurs locaux (vide = désactivé)
AIS_OPENWATERS_ENABLED=true
# AIS_PORTS_PATH=             # référentiel ports alternatif
```

## Référentiel des ports

`data/open-data/gabon/ports.json` : identifiant, nom, coordonnées, rayon (km),
type. Coordonnées indicatives **à valider avec la DGPA / OPRAG** ; modifiable
sans redéploiement.

## Tests

```bash
cd backend && source .venv/bin/activate
pytest app/tests/test_ais_gabon.py -q
```

Couverture : marge côtière (Port-Gentil accepté, terre refusée), présence par
port, conservation d'un navire à quai entre deux messages, expiration, parsing
AIS-catcher et NMEA, authentification de l'ingestion.

## Limites

- Aucun AIS sur les pirogues artisanales ni sur les fleuves : le suivi PIGAP reste le GPS mobile.
- Sans récepteur local, la couverture des ports gabonais dépend des réseaux communautaires, quasi absents sur ce littoral (mesure du 2026-09-20).
- Pas d'historique AIS persisté au-delà du snapshot.
- L'AIS satellitaire (fournisseurs commerciaux) reste hors périmètre MVP.

## Données embarquées

Les fichiers de `data/open-data/gabon/` utilisés à l'exécution sont copiés dans `backend/app/data/gabon/` pour l'image Docker : après toute modification, lancer `python scripts/sync_data.py` (le test `test_datafiles.py` vérifie la synchronisation).
