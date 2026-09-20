# Abonnements PIGAP

Licence d'usage B2C (3 000 / 30 000 FCFA) et exploitation B2B (Autorité / Flotte),
alignées sur `docs/modele-economique.md`.

## Endpoints

| Méthode | Chemin | Auth |
|---------|--------|------|
| GET | `/api/v1/abonnements/offres` | public |
| GET | `/api/v1/abonnements` | staff |
| GET | `/api/v1/abonnements/me` | pêcheur |
| GET | `/api/v1/abonnements/couverture/{pecheur_id}` | staff / soi |
| POST | `/api/v1/abonnements/initier-b2c` | pêcheur / staff |
| POST | `/api/v1/abonnements/initier-b2b` | staff |
| POST | `/api/v1/abonnements/paiements/{id}/confirmer-demo` | auth |
| POST | `/api/v1/abonnements/webhook/mobile-money` | secret |
| POST | `/api/v1/abonnements/{id}/activer-manuel` | staff |

## Tester

```bash
# Catalogue
curl -s localhost:8000/api/v1/abonnements/offres | jq

# Initier B2C (token agent) puis confirmer démo
curl -s -X POST localhost:8000/api/v1/abonnements/initier-b2c \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"code_offre":"b2c_annuel","numero_licence":"LIC-XXX","operateur":"demo"}'
```

## Env

- `MOBILE_MONEY_MODE=demo|live` (défaut `demo`)
- `ABONNEMENT_ENFORCE=false` — si `true`, captures/positions pêcheur exigent couverture
- `MOBILE_MONEY_WEBHOOK_SECRET` — optionnel (webhook legacy)
- `PAWAPAY_API_TOKEN` — Bearer Merchant API (Gabon)
- `PAWAPAY_BASE_URL` — `https://api.pawapay.io` (prod) ou `https://api.sandbox.pawapay.io`

## PawaPay live (Gabon)

1. `MOBILE_MONEY_MODE=live` + `PAWAPAY_API_TOKEN`
2. Callback dashboard PawaPay → `POST /api/v1/abonnements/webhook/pawapay/deposits`
3. Client : numéro Airtel (`077…`) → push PIN → poll `POST …/paiements/{id}/synchroniser`
4. Opérateur unique supporté : **AIRTEL_GAB** / XAF
