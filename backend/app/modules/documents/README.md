# Documents officiels (licence, fiche, bilan, rapport)

Génération PDF (ReportLab) à partir des données M1 / M4 / M6 — pas un 8ᵉ module métier.
Le rapport existe aussi en CSV (export annoncé Phase 3).

## Endpoints (`/api/v1/documents`)

| Méthode | Chemin | Rôles | Fichier |
|---------|--------|-------|---------|
| GET | `/licence/{pecheur_id}` | agent, admin, autorité | PDF licence |
| GET | `/fiche/pecheur/{pecheur_id}` | idem | PDF fiche d’enregistrement |
| GET | `/fiche/demande/{demande_id}` | idem | PDF fiche (demande FO) |
| GET | `/bilan/{pecheur_id}?debut=&fin=` | + chercheur | PDF bilan d’activité |
| GET | `/rapport?debut=&fin=&format=pdf\|csv` | + chercheur | PDF ou CSV de pilotage |

Chaque export écrit une ligne `LogAcces` (§7).

Les documents portent un bandeau Gabon et un avertissement : usage officiel soumis à validation de l’autorité ; données fictives jusqu’à la phase pilote.

## Tester

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_documents.py -q
```
