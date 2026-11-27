# Module commandes (lot 7, ADR-014)

Mise en relation **client → pêcheur** : réservation gratuite, montant prévu facultatif, **aucun paiement** sur la plateforme. Confirmation de livraison par double validation (pêcheur puis client).

## États

`reservee` → `acceptee` → `confirmee_vendeur` → `confirmee_client`, ou `annulee` tant que le cycle n'est pas terminé.

## Endpoints (`/api/v1/commandes`)

| Méthode | Chemin | Rôle | Description |
|---------|--------|------|-------------|
| POST | `/inscription` | public | Crée un compte `client` |
| POST | `/` | client | Crée une commande `reservee` |
| GET | `/` | client, pêcheur, staff | Liste filtrée par périmètre |
| GET | `/{id}` | client, pêcheur, staff | Détail si visible |
| POST | `/{id}/accepter` | pêcheur | `reservee` → `acceptee` |
| POST | `/{id}/confirmer-vendeur` | pêcheur | `acceptee` → `confirmee_vendeur` |
| POST | `/{id}/confirmer-client` | client | `confirmee_vendeur` → `confirmee_client` |
| POST | `/{id}/annuler` | client ou pêcheur | Annulation si non final |

## Tests

```bash
cd backend && pytest app/tests/test_lot7_commandes.py -q
```