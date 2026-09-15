# ADR-007 — Abonnements & Mobile Money (écart cahier §2.2)

- **Statut :** Accepté
- **Date :** 2026-09-15
- **Décideurs :** Christian BEYEME (+ agent)

## Contexte

Le cahier MVP (§2.2) excluait « Paiement, facturation, gestion d’abonnement ». Le porteur a demandé l’implémentation des abonnements B2C / B2B (Mobile Money Gabon) pour préparer la monétisation Phase 4, en s’appuyant sur [`docs/modele-economique.md`](../modele-economique.md).

## Options envisagées

1. Rester hors code (document seul) jusqu’à Phase 4 formelle.
2. Implémenter le cycle d’abonnement + paiement **démo** (confirmable) + webhook stub, sans agrégateur live.
3. Intégrer immédiatement SingPay / PViT en production.

## Décision

**Option 2** — module `abonnements` avec :
- tarifs catalogue alignés modèle économique ;
- initier B2C / B2B, confirmer-demo, webhook secret ;
- couverture flotte (anti double facturation) ;
- `ABONNEMENT_ENFORCE=false` par défaut (pilote Phase 3 non bloqué).

## Conséquences

- Positives : parcours monétisable testable ; déploiement Railway applique la migration Alembic.
- Négatives / dettes : pas encore d’agrégateur live ; facturation HT/TVA à confirmer ; écart cahier documenté ici.
- Suivi : brancher SingPay/PViT quand les credentials marchands sont prêts ; activer `ABONNEMENT_ENFORCE=true` en Phase 4.
