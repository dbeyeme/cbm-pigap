# ADR-005 — Couche AIS open data filtrée ZEE Gabon

- **Statut :** Accepté
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
