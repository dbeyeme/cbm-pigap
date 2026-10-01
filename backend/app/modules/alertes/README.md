# M7 — Alertes intelligentes

Règles MVP (§5.7), sans ML :

1. **zone_interdite** — position GPS / capture géolocalisée ∩ zone `interdite` (`ST_Intersects`)
2. **depassement_quota** — déjà émis par M5 (90 % / 100 %)
3. **anomalie** — volume 7 jours > 2× moyenne historique 7j de l’embarcation
4. **anomalie / `sortie_limite_geographique`** (§5.3, ajout 2026-10-01) — position maritime hors de toute zone de type `autorisee` active (zones de pêche autorisées, limites territoriales) ; sans zone autorisée définie, la limite est la ZEE gabonaise élargie de la marge côtière. Gravité critique, une alerte par embarcation et par jour. Positions fluviales ignorées.
5. **anomalie / `concentration_zone`** (§5.7, ajout 2026-10-01) — au moins `ALERTE_CONCENTRATION_SEUIL` embarcations distinctes (défaut 10) dans un rayon de `ALERTE_CONCENTRATION_RAYON_KM` (défaut 2 km) et une fenêtre de ± `ALERTE_CONCENTRATION_FENETRE_MIN` (défaut 60 min) autour d'une position. Alerte d'attention au niveau de la zone (sans embarcation ciblée), une par cellule de grille (~2 km) et par heure ; `zone_nom` renseigné si la position est dans une zone réglementée. Seuils indicatifs à calibrer avec la DGPA.
6. **anomalie / `meteo_marine`, `crue_fleuve`** — risques environnementaux (module météo-marine).
7. **anomalie / `espece_protegee`** (2026-10-01) — capture déclarée d'une espèce du référentiel des espèces protégées (gravité critique).
8. **anomalie / `licence_expiree`, `pecheur_suspendu`** (2026-10-01) — capture ou position d'un pêcheur dont l'autorisation annuelle est expirée (`LICENCE_VALIDITE_JOURS`, défaut 365) ou suspendu ; une alerte par pêcheur et par mois.
9. **anomalie / `declaration_manquante`** (2026-10-01) — retour au port détecté par le GPS depuis plus de `ALERTE_RAPPEL_DECLARATION_HEURES` (défaut 2) après une sortie, sans capture déclarée (gravité info, une par sortie).
10. **anomalie / `infraction_constatee`** (2026-10-01) — émise par le module contrôles.

Chaque alerte a un `declencheur` JSON obligatoire.

## Endpoints

| Méthode | Chemin | Rôles |
|---------|--------|-------|
| GET | `/api/v1/alertes` | autorité, agent, admin, chercheur |
| PATCH | `/api/v1/alertes/{id}` | autorité, agent, admin (statut) |

## Tester

```bash
cd backend && .venv/bin/python -m pytest app/tests/test_m7_alertes.py app/tests/test_alertes_limite_concentration.py -q
```
