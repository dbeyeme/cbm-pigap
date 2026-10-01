# Contrôles — missions, contrôles d'embarcation, vérification de licence

Ajout du 2026-10-01 (chaîne « de la mission à la sanction » décrite dans le rapport
NTSAGUI-2026-PGH-001, rattachée au registre PIGAP).

- **Mission** (`MC-AAAA-NNNN`) : type, dates, zone, responsable, statut.
- **Contrôle** : embarcation et pêcheur retrouvés par le numéro de licence (QR code de la
  licence PDF), validité de l'autorisation annuelle, engin déclaré contre engin trouvé,
  pêcheurs à bord, infraction (catégorie du référentiel), saisies, sanction. Une infraction
  crée une alerte critique `infraction_constatee`.
- **Vérification** : `GET /controles/verifier-licence?numero=` (agents, fiche complète) et
  `GET /public/verif/licence/{numero}` (QR code, validité seule, aucune donnée personnelle).

| Méthode | Chemin | Rôles |
|---|---|---|
| GET / POST | `/api/v1/controles/missions` | agents, autorité, admin (lecture : chercheur) |
| PATCH | `/api/v1/controles/missions/{id}` | agents, autorité, admin |
| GET / POST | `/api/v1/controles` | idem |
| GET | `/api/v1/controles/categories-infraction` | idem |
| GET | `/api/v1/controles/verifier-licence` | agents, autorité, admin |
| GET | `/api/v1/public/verif/licence/{numero}` | public |

```bash
cd backend && .venv/bin/python -m pytest app/tests/test_controles.py -q
```
