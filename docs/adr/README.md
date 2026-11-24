# Architecture Decision Records (ADR)

Décisions techniques structurantes de CBM-PIGAP.

## Index

| ID | Titre | Statut | Date |
|----|-------|--------|------|
| [ADR-001](ADR-001-expo-vs-bare.md) | Mobile : Expo vs React Native bare | Accepté | 2026-07-27 |
| [ADR-002](ADR-002-maplibre-vs-leaflet.md) | Carto web : MapLibre vs Leaflet | Accepté | 2026-07-27 |
| [ADR-003](ADR-003-organisation-extensible.md) | Organisation / société extensible | Accepté | 2026-07-27 |
| [ADR-004](ADR-004-gabon-open-data-water-mask.md) | Masque d’eau Gabon (ZEE + OSM) | Accepté | 2026-07-27 |
| [ADR-005](ADR-005-ais-zee-gabon-open-data.md) | Couche AIS open data filtrée ZEE | Accepté | 2026-09-09 |
| [ADR-006](ADR-006-ml-leger-predictions.md) | Graphiques de séries + ML léger (prédictions) | Accepté | 2026-09-10 |
| [ADR-007](ADR-007-abonnements-mobile-money.md) | Abonnements & Mobile Money (écart §2.2) | Accepté | 2026-09-15 |
| [ADR-008](ADR-008-meteo-marine-open-data.md) | Bulletin météo-marine et zones calculées (open data) | Accepté | 2026-09-20 |
| [ADR-009](ADR-009-suivi-temps-reel-sources-position.md) | Suivi temps réel : triangulation GSM/GPS écartée, balises NEMO de l'État | Proposé | 2026-10-01 |
| [ADR-010](ADR-010-fonds-de-carte-sans-cle.md) | Fonds de carte du portail : service sans clé, cible auto-hébergée | Accepté | 2026-11-24 |
| [ADR-011](ADR-011-global-fishing-watch-source-differee.md) | Global Fishing Watch : source différée pour les navires industriels | Accepté pour essai hors service | 2026-11-24 |
| [ADR-012](ADR-012-un-appareil-un-pecheur.md) | Un appareil, un seul compte pêcheur : rattachement côté serveur | Accepté sur le principe, modalités « Proposé » | 2026-11-25 |
| [ADR-013](ADR-013-base-de-test-dediee.md) | Base PostgreSQL et PostGIS dédiée aux tests du serveur | Proposé | 2026-11-24 |

## Convention

- Fichier : `ADR-NNN-slug-kebab.md`
- Rédaction via skill `write-adr`
- Toute déviation au cahier `cdc-mvp-pigap.md` §3 doit avoir un ADR **Accepté** et une validation de Christian
