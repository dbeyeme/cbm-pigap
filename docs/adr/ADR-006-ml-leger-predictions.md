# ADR-006 — Graphiques de séries et ML léger (prédictions consultatives)

- **Statut :** Accepté
- **Date :** 2026-09-10
- **Décideurs :** Christian BEYEME (+ agent)

## Contexte

Le tableau de bord M6 affiche des KPI scalaires exacts (§5.6) sans série temporelle. Le cahier §2.2 exclut l’analyse prédictive avancée des stocks du MVP (règle de tendance 7j seulement, §5.7). Les autorités ont besoin, pour le pilotage post-MVP, de **graphiques de tendances saisonnières** et d’un **moteur de prédiction** (intrusions, pénuries d’espèces, pêches, zones d’incidents).

Les données de démo ne couvraient que quelques heures : un historique synthétique de 12 mois est nécessaire pour que sklearn et les graphiques aient du sens.

## Options envisagées

1. Graphiques seuls, prédiction plus tard.
2. **ML léger (sklearn Ridge + PoissonRegressor) sur agrégats SQL**, avec `justification` obligatoire, sans alerte opérationnelle auto.
3. Modèle statistique / réseau complet (hors sobriété §3.1, hors explicabilité).

## Décision

Option 2, incrément Phase 3 / post-MVP (pas un module M8 parallèle) :

- `GET /api/v1/dashboard/series` : buckets exacts jour / semaine / mois.
- Module `predictions` : `GET /api/v1/predictions?horizon_jours=7|30`.
- Dépendances ajoutées : `numpy`, `scikit-learn` (stack §3.2 inchangée).
- Pas de pandas, pas de pickle versionné, entraînement en mémoire (TTL).
- Calendrier d’**affichage** (à valider expert halieutique) : `saison_seche` = juin–septembre, `saison_pluies` = octobre–mai. Grain d’analyse = semaine / mois.
- Seuil pénurie explicite : volume 4 semaines **et** prévision 30 j &lt; 50 % de la moyenne saisonnière de la même fenêtre.
- Les prédictions **n’émettent pas** d’alertes M7 (taux de faux positifs §10).

## Conséquences

- Positives : tendances lisibles ; prévisions traçables ; démo saisonnière possible.
- Négatives / dettes : historique synthétique (pas des captures réelles) ; saisons calendaires à valider ; sklearn synchrone (hors hot path GPS).
- Impact cahier (`cdc-mvp-pigap.md`) : **oui** — écart §2.2 / §5.7. Le MVP reste règles M7. Patch proposé, **non appliqué silencieusement** :

> Itération post-MVP (ADR-006) : séries temporelles exactes au dashboard et moteur sklearn consultatif (pêches, pénuries, intrusions, zones). Pas de déclenchement automatique d’alertes. Le modèle halieutique complet des stocks reste hors périmètre.

## Liens

- Modules concernés : M6 (séries), incrément `predictions`, portail Rapports
- Entrée journal : 2026-09-10 — graphiques KPI + prédictions
