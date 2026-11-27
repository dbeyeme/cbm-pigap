# ADR-014 — Commandes client vers pêcheur (lot 7)

- **Statut :** Accepté
- **Date :** 2026-11-27
- **Décideurs :** Christian BEYEME (+ agent)
- **Liens :** [chantier novembre 2026](../chantier-evolutions-2026-11.md), [ADR-007](ADR-007-abonnements-mobile-money.md)

## Contexte

Le cahier MVP (§2.2) exclut les commandes et le commerce entre acteurs. Le porteur a demandé une mise en relation client → pêcheur, sans paiement en ligne. Les règles tranchées le 2026-11-27 :

1. circuit **client → pêcheur** seulement (pas de revendeur dans ce lot) ;
2. réservation gratuite ; **prix facultatif** (montant prévu si renseigné) ; **aucun paiement** sur la plateforme ;
3. confirmation de livraison par **double validation** (vendeur puis client), sans code de paiement.

## Options envisagées

1. Reporter jusqu’à validation formelle de Kimba Connect et Phase 4.
2. Livrer un module minimal : rôle `client`, réservation, prix optionnel, double validation, hors paiement.
3. Inclure revendeurs et acompte Mobile Money dès maintenant.

## Décision

**Option 2.** Écart cahier §2.2 documenté ici. Module `commandes` :

- nouveau rôle `client` (enum Postgres) ;
- inscription client simple (compte + connexion) ;
- commande liée à un pêcheur (et optionnellement à une capture / espèce / quantité) ;
- `montant_prevu_fcfa` facultatif ;
- états : `reservee` → `acceptee` (pêcheur) → `confirmee_vendeur` → `confirmee_client` (livrée) ou `annulee` ;
- aucun appel Mobile Money sur ce parcours (réservé aux abonnements / licences, ADR-007).

## Conséquences

- **Positives :** valeur pour le pêcheur testable en Phase 3 ; traçabilité des réservations.
- **Négatives / dettes :** hors périmètre cahier ; pas de litige ni remboursement (pas de paiement) ; revendeur reporté ; validation Kimba Connect à confirmer a posteriori si le contrat l’exige.
- **Impact cahier :** oui, §2.2 (écart volontaire).

## Liens

- Modules : lot 7 (commandes), auth / utilisateurs
- Entrée journal : 2026-11-27
