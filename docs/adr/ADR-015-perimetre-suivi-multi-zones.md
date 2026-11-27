# ADR-015 — Périmètre de suivi multi-zones (lot 8)

- **Statut :** Accepté
- **Date :** 2026-11-27
- **Décideurs :** Christian BEYEME (+ agent)
- **Liens :** [chantier novembre 2026](../chantier-evolutions-2026-11.md), cahier §2.2 (multi-zones hors MVP)

## Contexte

Le cahier concentre le MVP sur **une zone pilote** et exclut la généralisation multi-zones, tout en demandant une architecture extensible. Le porteur a demandé l’activation / désactivation, à choix multiples, de pays et de zones de suivi (ville, province, côtes, fleuves), avec défauts : Gabon, Estuaire, Libreville, Owendo, Akanda, Cap Estérias.

Règles tranchées le 2026-11-27 :

1. seul l’**administrateur** active ou désactive un élément du périmètre ;
2. une **désactivation masque aussi l’historique** (plus seulement les nouveaux suivis).

## Options envisagées

1. Rester sur une seule zone pilote jusqu’à Phase 4.
2. Référentiel de périmètre activable, filtre serveur sur lectures géolocalisées / cartes / alertes historiques, admin seul.
3. Multi-tenant complet (bases ou schémas séparés par pays).

## Décision

**Option 2.** Écart cahier documenté ici. Module `perimetre` :

- table de zones de périmètre (code, libellé, type, géométrie ou emprise, `actif`) ;
- défauts seedés actifs (Gabon, Estuaire, Libreville, Owendo, Akanda, Cap Estérias) ;
- API admin pour activer / désactiver ;
- lectures filtrées : si un élément est inactif, les positions, trajets et alertes liées à son emprise ne sont **pas renvoyées** (historique compris) ;
- pas de suppression physique des données.

## Conséquences

- **Positives :** cadrage géographique pilotable sans redéploiement ; sobriété vs multi-tenant.
- **Négatives / dettes :** écart cahier §2.2 ; contours géographiques initiaux approximatifs (fictifs / à valider DGPA) ; perf à surveiller si le filtre s’applique à de grosses tables.
- **Impact cahier :** oui, §2.2 multi-zones.

## Liens

- Modules : lot 8 (périmètre), géolocalisation, alertes, tableau de bord
- Entrée journal : 2026-11-27
