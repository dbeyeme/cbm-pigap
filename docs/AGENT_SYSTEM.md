# Système d'agents CBM-PIGAP

Vue d'ensemble du dispositif Cursor pour développer et suivre le MVP.

```
┌─────────────────────────────────────────────────────────┐
│  Agent principal (lit AGENTS.md + rules alwaysApply)     │
└───────────────┬─────────────────────────────────────────┘
                │ délègue
    ┌───────────┼───────────┬────────────┬──────────────┐
    ▼           ▼           ▼            ▼              ▼
module-     backend-    mobile-     web-          security-
builder     geospatial  offline     dashboard     auditor
    │           │           │            │              │
    └───────────┴───────────┴────────────┘              │
                │                                       │
                ▼                                       ▼
         module-verifier ◄──────────────────────────────┘
                │
                ▼
         journal-keeper  →  JOURNAL.md + STATUS.md
```

## Fichiers clés

| Chemin | Rôle |
|--------|------|
| `AGENTS.md` | Contrat global |
| `.cursor/agents/*.md` | Sous-agents |
| `.cursor/rules/*.mdc` | Règles auto / par glob |
| `.cursor/skills/*/SKILL.md` | Workflows réutilisables |
| `.cursor/hooks.json` | Rappel statut + journal |
| `docs/STATUS.md` | Où en est-on |
| `docs/JOURNAL.md` | Qu'a-t-on fait et pourquoi |
| `docs/checklists/` | Phase 0 + DoD module |

## Invocation manuelle

Dans le chat Cursor :

- `/module-builder` — implémenter le module courant
- `/module-verifier` — valider avant done
- Skills via menu `/` : `start-module`, `finish-module`, `pigap-status`, etc.
