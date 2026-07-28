# Checklist — Definition of Done (module)

À utiliser avant `finish-module` / `module-verifier`.

Module : `Mx` — Date : `YYYY-MM-DD`

- [ ] Modèle de données + migration (si applicable)
- [ ] Endpoints API + validation Pydantic **ou** écrans mobile/web du périmètre
- [ ] Rôles déclarés sur les routes protégées
- [ ] Tests automatisés couvrant **tous** les critères d'acceptation §5 du module
- [ ] Tests des modules précédents toujours verts
- [ ] README court du module (objectif, endpoints, comment tester)
- [ ] Entrée `docs/JOURNAL.md` au format §11
- [ ] `docs/STATUS.md` mis à jour
- [ ] Écarts éventuels documentés (ADR + journal)
- [ ] `module-verifier` → **PASS**
