# STATUS — CBM-PIGAP

> Source de vérité de l'avancement. À mettre à jour à chaque début/fin de module ou changement de phase.
> Cahier : [`../cdc-mvp-pigap.md`](../cdc-mvp-pigap.md) · Journal : [`JOURNAL.md`](JOURNAL.md)

## État actuel

| Champ | Valeur |
|-------|--------|
| **Phase** | Phase 2 — Prototype (clôturée) · préparation Phase 3 |
| **Module courant** | M7 — Alertes intelligentes |
| **Statut module** | ✅ done |
| **Branche active** | `fix/lot-0-fonds-de-carte` |
| **Dernière mise à jour** | 2026-11-26 |
| **Prochain jalon** | Phase 3 — Expérimentation terrain |
| **Bloqueurs** | Aucun |
| **Chantier en cours** | Évolutions de novembre 2026 : lots 0 à 6, 9 et 10 livrés en code (serveur + portail, mobile pour 3/6/10) ; lots 7 et 8 reportés (ADR / Kimba Connect, multi-zones). |
| **Note récente** | 2026-11-26 (avant 8 h) : lot 6 clos en code (prix facultatif, courbes anonymes, carnet) ; CompactList restants convertis ; courbes de prix sur Pêches pour l'agent ; API production déjà à jour (`/prix`, `/alertes`) ; portail à redéployer ; lots 7 et 8 non démarrés · 2026-11-25 : lots commités sur `fix/lot-0-fonds-de-carte` |
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
| Sécurité | **GO réserves** (~~CORS~~ fermé 2026-10-01, JWT, vue agent, batch GPS) | Conditionnel |
| Backend / PostGIS | **GO réserves** (LogAcces, GIST, format 401) | Conditionnel |
| Web / UX | **GO démo** (logout mobile, a11y, popups carte) | Oui démo |
| Mobile offline | **GO réserves** (~~GPS online~~ file hors-ligne 2026-10-01, sync manuelle, Jest) | Conditionnel |
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
- Agrégateur Mobile Money live (SingPay/PViT) + calendrier `ABONNEMENT_ENFORCE=true`
- _(ADR-001…008 acceptés ; ADR-009 proposé : suivi temps réel, triangulation GSM/GPS écartée ; ingestion `source=balise` livrée avec données fictives ; ADR-010 accepté : fonds de carte sans clé)_
- Commandes entre pêcheurs, clients et revendeurs : hors périmètre du cahier (§2.2), ADR et validation de Kimba Connect à venir ; acompte de 30 % par Mobile Money décidé en option le 2026-11-24
- Règles « Proposé » du chantier de novembre 2026 (prix, rentabilité, seuils d'alerte des navires, confirmation de livraison) à valider avant les lots 4 et 5
- Comptes de démonstration en ligne, imagerie satellitaire sans clé, accès Skylight et station AIS : décisions du porteur
- Global Fishing Watch (ADR-011) : essai de faisabilité hors service décidé le 2026-11-24 ; API réservées à un usage non commercial, mise en service soumise à l'accord de l'éditeur (traité par le porteur)
- Commit de tous les lots faits : demandé par le porteur le 2026-11-25, fait ; fusion dans `main` non demandée dans la session principale (standards, section 5.1), à confirmer
- ADR-013 (base de test dédiée) : Proposé, à valider
- Lot 8 (périmètre de suivi) : effet d'une désactivation sur les données et rôle habilité, à décider · Lot 9 (alertes) : liste des états de traitement, à décider (questions posées le 2026-11-25)
- Lot 10, un appareil, un seul compte pêcheur (ADR-012) : règle R1 décidée le 2026-11-25 ; règles R2 à R6 « Proposé » ; mise en service après fixation de la clé de signature de l'application
- Décidé le 2026-11-24 : commandes sans paiement en ligne (réservation gratuite indiquant le montant prévu), page de profil visible des comptes connectés et ouvrable au public par l'acteur, bannières du portail conservées · restent « Proposé » : informations d'inscription à ajouter, espèces du profil tirées des captures

## Comment mettre à jour

Utiliser le skill `update-journal` / sous-agent `journal-keeper`, ou le skill `finish-module` en fin de module.
