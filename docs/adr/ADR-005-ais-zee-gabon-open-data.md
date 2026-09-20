# ADR-005 — Couche AIS open data filtrée ZEE Gabon

- **Statut :** Accepté — **amendé le 2026-09-20** (voir ci-dessous)
- **Date :** 2026-09-09
- **Décideurs :** Christian BEYEME (+ agent)

## Contexte

Le portail dispose d’une vue near-live des embarcations **PIGAP** (GPS mobile / semis). Les autorités demandent aussi de voir les **navires réels** en circulation dans les eaux gabonaises, via des flux open data, sans confondre avec les pirogues artisanales enregistrées.

L’IoT / balises physiques restent hors MVP (§2.2). L’AIS n’est pas une balise PIGAP : c’est une **couche surveillance externe** (côte / ZEE).

## Options envisagées

1. Ne rien faire — simulation seule (insuffisant pour la demande métier).
2. **Ingestion open AIS (Open Waters / AISStream) + filtre polygone ZEE** — séparer clairement des positions `source=mobile`.
3. Partenariat Global Fishing Watch / CLS NEMO — hors MVP (accords institutionnels).

## Décision

Option 2 :
- Module `ais_gabon` : poll périodique (défaut Open Waters `GET /v1/vessels?bbox=…`), cache mémoire.
- Filtrage strict avec `eez_marineregions.geojson` (Marine Regions CC-BY-4.0).
- API `GET /api/v1/ais/live` (rôles autorités / agent / admin / chercheur).
- UI : overlay optionnel « AIS ZEE (open data) », marqueurs distincts des pirogues PIGAP.
- Optionnel : `AISSTREAM_API_KEY` pour un stream WebSocket plus dense (même filtre EEZ).

## Conséquences

- Positives : navires industriels / étrangers visibles en ZEE ; données open ; pas de mélange avec le registre pêcheurs.
- Négatives : couverture AIS inégale au large du Gabon ; **aucune** pirogue artisanale / fleuve ; dépendance fournisseur tiers ; pas de persistance historique AIS en MVP.
- Impact cahier : **extension** documentée (pas d’IoT MQTT) ; point d’entrée surveillance aligné §3.3 « temps réel ».

## Liens

- Modules : M2 (géoloc) + portail surveillance
- Données : `data/open-data/gabon/eez_marineregions.geojson`, ADR-004
- Journal : 2026-09-09 AIS ZEE

## Amendement 2026-09-20 — flotte accumulée, ports, récepteurs locaux

**Constat mesuré.** Clé AISStream valide (64 navires reçus en 15 s sur la Manche en contrôle), mais 0 message en 150 s sur l'ensemble des eaux gabonaises et 5 navires par minute de Lagos à Luanda ; Open Waters renvoie 0 navire. Les réseaux AIS communautaires n'ont pratiquement aucune station réceptrice sur le littoral gabonais. Par ailleurs la collecte par fenêtres de 25 s remplaçait l'état à chaque cycle (un navire à quai émet toutes les 3 min), et le polygone ZEE strict exclut le bassin de Port-Gentil.

**Décision.**
1. Connexion AISStream **permanente** alimentant un **état de flotte accumulé** (dernière position par MMSI, expiration 30 min en route / 180 min immobile), données statiques fusionnées (nom, type, destination, dimensions).
2. Filtre géographique = ZEE **élargie d'une marge côtière** (0,12° par défaut) pour inclure quais, estuaires et lagunes.
3. Référentiel des **ports et mouillages** (`data/open-data/gabon/ports.json`) ; chaque navire reçoit un statut opérationnel (à quai, au mouillage, en route, en pêche) et son port de rattachement ; endpoint `GET /ais/ports`.
4. **Ingestion de récepteurs AIS locaux** (`POST /ais/ingest`, clé partagée) au format AIS-catcher JSON ou NMEA (`pyais`). C'est la source retenue pour la présence en temps réel à Owendo et Port-Gentil ; matériel libre et peu coûteux (récepteur VHF + AIS-catcher).

**Conséquences.** Le portail peut répondre à « quels navires sont au port d'Owendo ? » dès qu'un récepteur y est raccordé ; sans récepteur, l'interface indique explicitement l'absence de couverture au lieu d'une carte vide. L'AIS satellitaire commercial reste hors MVP. Journal : 2026-09-20.
