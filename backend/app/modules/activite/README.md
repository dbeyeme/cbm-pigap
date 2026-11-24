# Activité par zone (lot 5 du chantier de novembre 2026)

## Objectif

Montrer où et combien de temps les embarcations suivies par la plateforme sont
en mer, par maille de carte, puis réunir pour une zone les heures d'activité,
les embarcations présentes, les captures déclarées et les alertes.

Source : les positions de la plateforme (application et balises), les seules à
couvrir les pirogues, et les captures déclarées. Les navires industriels vus par
un éditeur tiers relèvent du module `gfw`, à part.

## Règle de calcul : Proposé (valideurs : Christian, expert halieutique)

Paramètres dans `backend/app/data/regles/activite_zones.json`, relus dès que le
fichier change. Rien n'est codé en dur : une clé absente arrête le calcul (503).

1. Les relevés d'une embarcation sont lus dans l'ordre du temps.
2. L'intervalle entre deux relevés consécutifs compte s'il dure au plus
   `intervalle_max_minutes` et, quand `vitesse_max_noeuds` est renseignée, si la
   vitesse moyenne sur l'intervalle ne la dépasse pas.
3. Un intervalle est localisé par son relevé de départ : maille, zone, abords
   d'un port (`exclusion_ports`).
4. Un intervalle appartient à la période si son relevé de départ s'y trouve :
   deux périodes qui se suivent s'additionnent sans perte ni double compte.

Les captures sans lieu de pêche et les alertes sans position sont comptées à
part, jamais attribuées à une zone par supposition.

## Points d'accès (`/api/v1/activite`)

| Méthode | Chemin | Rôles | Réponse |
|---------|--------|-------|---------|
| GET | `/secteurs` | autorité, agent, administrateur, chercheur, pêcheur | Secteurs de mer du référentiel |
| GET | `/mailles` | idem, filtré par périmètre | GeoJSON : une maille par entité, heures d'activité |
| GET | `/captures-par-zone` | idem, filtré par périmètre | Volumes par espèce dans la zone, sans position à part |
| GET | `/rapport-zone` | autorité, agent, administrateur, chercheur | Rapport de zone (JSON) |
| GET | `/documents/rapport-zone` | autorité, agent, administrateur, chercheur | Rapport de zone (PDF, module `documents`) |

Périmètre : le pêcheur ne voit que ses embarcations et ses captures, les rôles
de pilotage toute la flotte. Une embarcation hors périmètre répond 404. Le rôle
organisation n'est pas admis : il n'a pas accès aux positions de ses membres
ailleurs dans l'API (décision à prendre par le porteur). Le rapport de zone est
inscrit au journal des accès.

Contrat détaillé et exemples : `docs/lot-5-activite-zones-serveur.md`.

## Tester

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_lot5_activite_zones.py -q
```
