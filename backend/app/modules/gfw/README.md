# Essai Global Fishing Watch (ADR-011)

## Objectif

Essai de faisabilité, hors service : voir ce que l'éditeur apporte sur les
navires industriels de la ZEE du Gabon (heures de pêche apparente, navires
observés, détections radar, identité d'un navire). Ces données sont publiées
avec plusieurs jours de retard et ne couvrent pas les pirogues.

## Garde-fous

- À l'arrêt par défaut : `GFW_ENABLED` est faux. Tant qu'il l'est, ou que le
  jeton manque, les routes de données répondent 503 sans appeler l'éditeur.
- Usage non commercial seulement chez l'éditeur : pas de mise en service sans
  son accord écrit (décision et démarche du porteur).
- Jeton lu côté serveur dans `GFW_API_TOKEN` (le premier nom de la ligne du
  fichier d'environnement est accepté), jamais affiché ni journalisé.
- Un seul rapport à la fois (verrou), réponses mises en cache, budget de
  requêtes par jour : `backend/app/data/regles/gfw_source.json`.
- Chaque réponse porte la période, la date de fraîcheur et la mention
  « Powered by Global Fishing Watch. » avec son lien, à afficher sur tout écran
  qui montre ces données.
- Aucune alerte : le module ne lit ni n'écrit la base. Les libellés parlent de
  pêche apparente et d'indice, jamais d'infraction.

## Points d'accès (`/api/v1/gfw`)

Rôles : autorité, agent de contrôle, administrateur.

| Méthode | Chemin | Réponse |
|---------|--------|---------|
| GET | `/etat` | Essai activé ou non, sans appel à l'éditeur |
| GET | `/peche-apparente?debut=&fin=` | Heures par mois et par pavillon |
| GET | `/navires?debut=&fin=` | Navires observés et heures par navire |
| GET | `/detections-radar?debut=&fin=` | Détections par mois et par pavillon |
| GET | `/navires/{vessel_id}` | Fiche d'identité : registres et identité émise |

Contrat détaillé et exemples : `docs/lot-5-activite-zones-serveur.md`.

## Tester

Sans réseau (éditeur simulé) :

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_lot5_gfw.py -q
```

Essai réel, à la main, quatre requêtes sur le quota de l'éditeur :

```bash
cd backend
.venv/bin/python scripts/essai_gfw.py --debut 2026-08-01 --fin 2026-11-01
```
