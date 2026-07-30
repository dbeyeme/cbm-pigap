# Module utilisateurs — staff (agents & admins)

CRUD des comptes `agent_controle` et `admin` (hors pêcheurs, gérés en M1).

## Endpoints

| Méthode | Chemin | Auth | Notes |
|---------|--------|------|-------|
| POST | `/api/v1/utilisateurs` | admin | Créer agent ou admin |
| GET | `/api/v1/utilisateurs` | admin | Liste ; filtres `role`, `q` |
| GET | `/api/v1/utilisateurs/{id}` | admin | Détail |
| PATCH | `/api/v1/utilisateurs/{id}` | admin | Nom, rôle, contact, mot de passe |
| DELETE | `/api/v1/utilisateurs/{id}` | admin | Interdit sur soi / dernier admin |

## Tester

```bash
cd backend && pytest app/tests/test_utilisateurs_staff.py -q
```

Seed local :

```bash
python scripts/seed_agent.py
python scripts/seed_admin.py
```
