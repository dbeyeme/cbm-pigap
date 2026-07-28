# STATUS — CBM-PIGAP

> Source de vérité de l'avancement. À mettre à jour à chaque début/fin de module ou changement de phase.
> Cahier : [`../cdc-mvp-pigap.md`](../cdc-mvp-pigap.md) · Journal : [`JOURNAL.md`](JOURNAL.md)

## État actuel

| Champ | Valeur |
|-------|--------|
| **Phase** | Phase 2 — Prototype |
| **Module courant** | M7 — Alertes intelligentes |
| **Statut module** | ✅ done |
| **Branche active** | `feature/m7-alertes` |
| **Dernière mise à jour** | 2026-07-28 |
| **Prochain jalon** | Phase 2 clôturée (M1–M7) · préparation Phase 3 |
| **Bloqueurs** | Aucun |
| **Note récente** | Gate M1–M7 : GO Phase 3 avec réserves (sécu ops + métier) |
| **Dernière validation humaine** | Phase 1 validée + M1 livré |

## Tableau des modules (Phase 2)

| Module | Nom | Statut | Tests acceptation | Journal |
|--------|-----|--------|-------------------|---------|
| M1 | Enregistrement pêcheurs & embarcations | ✅ done | OK (§5.1) | 2026-07-27 |
| M2 | Géolocalisation & suivi GPS | ✅ done | OK (§5.2) | 2026-07-27 |
| M3 | Cartographie des zones réglementées | ✅ done | OK (§5.3) | 2026-07-27 |
| M4 | Déclaration & suivi des captures | ✅ done | OK (§5.4) | 2026-07-28 |
| M5 | Gestion des quotas | ✅ done | OK (§5.5) | 2026-07-28 |
| M6 | Tableau de bord de pilotage | ✅ done | OK (§5.6) | 2026-07-28 |
| M7 | Alertes intelligentes | ✅ done | OK (§5.7) | 2026-07-28 |

Légende : ⬜ todo · 🔄 en cours · ✅ done · ⛔ bloqué

## Gate multi-experts M1–M4 (2026-07-28)

| Expert | Verdict | Go M5 |
|--------|---------|-------|
| Sécurité | RÉSERVES → **Haute corrigées** (IDOR, dossier, DELETE GPS) | Go après correctifs |
| Mobile offline | RÉSERVES (cache embarcations → **corrigé**) | Go conditionnel |
| Halieutique | RÉSERVES (espèces côtières) | Go |
| Maritime | RÉSERVES | Go |
| Design | RÉSERVES | Go |

**Décision :** **Go M5** avec dettes documentées (espèces pilote, LogAcces, CORS, buffer fluvial).

## Gate multi-experts M1–M7 (2026-07-28) — entrée Phase 3

| Expert | Verdict | Go Phase 3 |
|--------|---------|------------|
| Sécurité | **GO réserves** (CORS, JWT, vue agent, batch GPS) | Conditionnel |
| Backend / PostGIS | **GO réserves** (LogAcces, GIST, format 401) | Conditionnel |
| Web / UX | **GO démo** (logout mobile, a11y, popups carte) | Oui démo |
| Mobile offline | **GO réserves** (GPS online, sync manuelle, Jest) | Conditionnel |
| Maritime | **RÉSERVES** (buffer, Ogooué densifié) | Oui |
| Halieutique | **GO conditionnel** (espèces / seuils pilote) | Conditionnel |
| Architecte | **GO réserves** (E2E §9, staging, §10) | Conditionnel |

**Décision :** **GO Phase 3 avec réserves** — pas de données réelles avant correctifs Haute + validation espèces zone pilote. Canvas : `gate-experts-phase2`.

## Phases

| Phase | Statut |
|-------|--------|
| 0 — Amorçage | ✅ done |
| 1 — Étude & conception | ✅ done (validée 2026-07-27) |
| 2 — Prototype M1→M7 | ✅ done (M1–M7) |
| 3 — Expérimentation terrain | ⬜ |
| 4 — Déploiement & formation | ⬜ |

## Décisions ouvertes

- Liste fermée espèces/méthodes MVP à valider zone pilote (avant quotas réalistes)
- _(ADR-001/002/003/004 acceptés)_

## Comment mettre à jour

Utiliser le skill `update-journal` / sous-agent `journal-keeper`, ou le skill `finish-module` en fin de module.
