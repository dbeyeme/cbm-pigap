# Prédictions consultatives (post-MVP, ADR-006)

Moteur sklearn léger (Ridge / Poisson) sur agrégats hebdomadaires. **Ne crée pas d’alertes M7.**

Calendrier d’affichage (à valider) : saison sèche = juin–septembre, saison des pluies = octobre–mai.

## Endpoint

| Méthode | Chemin | Rôles |
|---------|--------|-------|
| GET | `/api/v1/predictions?horizon_jours=7\|30` | autorité, agent, admin, chercheur |

`justification` obligatoire sur chaque prédiction (modèle, features, seuils).

Si l’historique a moins de 8 semaines : `mode=insuffisant` + moyenne récente (pas de faux modèle confiant).

Pénurie **élevée** si volume 4 semaines **et** prévision 30 j < 50 % de la moyenne saisonnière.

## Tester

```bash
cd backend && .venv/bin/python -m pytest app/tests/test_predictions.py -q
```
