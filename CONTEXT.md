# CONTEXT.md — pointeur rapide

Document de travail principal pour les agents et le porteur :

1. **Cahier technique (contrat)** → [`cdc-mvp-pigap.md`](cdc-mvp-pigap.md)
2. **Instructions agents** → [`AGENTS.md`](AGENTS.md)
3. **État d'avancement** → [`docs/STATUS.md`](docs/STATUS.md)
4. **Journal de réalisation** → [`docs/JOURNAL.md`](docs/JOURNAL.md)
5. **ADR** → [`docs/adr/`](docs/adr/)

## Prompt de démarrage recommandé

> Tu dois suivre strictement `cdc-mvp-pigap.md` et `AGENTS.md`. Consulte `docs/STATUS.md` avant d'agir. Tu avances module par module. Après chaque module, mets à jour `docs/JOURNAL.md`. Tu ne passes pas au suivant sans tests verts. En cas d'ambiguïté, pose une question.

## Démarrer / clôturer un module

- Skill `start-module` puis sous-agent `module-builder`
- Sous-agent `module-verifier` puis skill `finish-module`
