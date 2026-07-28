# CBM-PIGAP — Cahier technique de réalisation du MVP
### Plateforme Intelligente Gabonaise des Activités de Pêche

**Porteur de projet :** Christian BEYEME (CBM)
**Client :** Kimba Connect — République Gabonaise
**Document destiné à :** l'agent de développement (Cursor) ET au porteur de projet, comme référentiel commun
**Statut :** Cahier de réalisation v1.0

---

## 0. Comment utiliser ce document

Ce document est le **contrat de travail entre toi (Christian) et l'agent Cursor**. Il doit rester ouvert (ou placé à la racine du repo, ex. `CONTEXT.md` ou `.cursor/rules/pigap.mdc`) pendant toute la durée du développement.

**Règle d'or à donner à Cursor dès le premier prompt :**

> « Tu dois suivre strictement le document `CBM-PIGAP_Cahier_Technique_MVP.md`. Tu avances module par module, dans l'ordre du plan de réalisation (section 9). Après chaque module livré, tu mets à jour le `JOURNAL.md` avec : ce qui a été construit, pourquoi (quel principe / quelle exigence du cahier des charges), et quelles technologies ont été utilisées. Tu ne passes jamais au module suivant sans que les tests du module courant passent. En cas d'ambiguïté sur une exigence, tu poses une question plutôt que de supposer. »

Ce document répond à trois besoins :
1. **Fidélité au contexte** — section 1 et 2 : pourquoi on construit ça, pour qui, dans quelles limites.
2. **Méthode chirurgicale** — section 9 : un découpage en tâches vérifiables, une à la fois, avec critères d'acceptation.
3. **Compréhension et suivi** — section 11 et `JOURNAL.md` : à chaque étape, Cursor explique ce qu'il a fait et pourquoi, dans un langage clair.

---

## 1. Contexte et objectif du projet

Le Gabon fait face à un déficit de visibilité en temps réel sur les activités de pêche : absence de registre centralisé, difficulté à contrôler les zones réglementées, risques de surexploitation des ressources, et faible traçabilité des captures. Kimba Connect a lancé un défi pour développer une plateforme numérique intelligente répondant à ce besoin.

**CBM-PIGAP** est la réponse technique à ce défi : une plateforme modulaire composée d'une application mobile (pêcheurs, agents de terrain) et d'un portail web (autorités), reliées à un backend géospatial capable de :
- centraliser l'enregistrement des acteurs et embarcations,
- suivre les déplacements et contrôler le respect des zones réglementées,
- gérer les quotas de pêche par espèce/zone/période,
- détecter automatiquement les anomalies (intrusion en zone interdite, dépassement de quota, comportement suspect),
- fonctionner de manière fiable même en connectivité réseau intermittente.

**Objectif du MVP (Minimum Viable Product) :** démontrer, sur une zone pilote et avec un groupe restreint d'utilisateurs réels, que ces sept fonctions tiennent la route en conditions de terrain — pas seulement en démonstration contrôlée.

---

## 2. Périmètre du MVP

### 2.1 Dans le périmètre (in scope)

| # | Module | Fonction minimale attendue pour le MVP |
|---|--------|------------------------------------------|
| M1 | Enregistrement pêcheurs & embarcations | CRUD complet, licence associée, recherche |
| M2 | Géolocalisation & suivi GPS | Envoi de position depuis mobile, historique, affichage carte |
| M3 | Cartographie des zones réglementées | Définition de polygones (zones interdites/protégées), détection d'intersection |
| M4 | Déclaration & suivi des captures | Formulaire mobile (espèce, volume, zone, date), fonctionnement hors-ligne |
| M5 | Gestion des quotas | Définition de seuils par espèce/zone/période, calcul de consommation, alerte à 90 % |
| M6 | Tableau de bord de pilotage | Vue web avec indicateurs clés et carte des activités |
| M7 | Alertes intelligentes | Détection d'entrée en zone interdite + dépassement de quota (règles), notification |

### 2.2 Hors périmètre du MVP (explicitement exclu pour éviter la dérive de scope)

- Analyse prédictive avancée des stocks (modèle statistique complet) — le MVP se limite à une **règle de tendance simple** (voir 5.7), le modèle prédictif complet est une itération post-MVP.
- Authentification fédérée / SSO administration — un système d'authentification simple (JWT) suffit pour le MVP.
- Application iOS native complète — le MVP cible Android en priorité (majorité du parc terrain), iOS en confirmation ultérieure.
- Paiement, facturation, gestion d'abonnement.
- Généralisation multi-zones — le MVP se concentre sur **une seule zone pilote**, mais l'architecture doit rester extensible (voir 3.1, principe de modularité).
- Intégration de balises IoT physiques — le MVP simule la position via l'application mobile ; l'intégration de balises connectées est prévue en V2 (l'architecture doit néanmoins prévoir le point d'entrée, voir 3.3).

> **Principe directeur pour Cursor : mieux vaut un module simple qui fonctionne réellement de bout en bout, qu'un module sophistiqué mais fragile. En cas de doute sur la complexité à implémenter, choisir la version la plus simple qui satisfait le critère d'acceptation.**

---

## 3. Architecture technique

### 3.1 Principes d'architecture (à respecter strictement)

1. **Modularité** — chaque module (M1-M7) est un ensemble cohérent de routes API + modèles de données + logique métier, faiblement couplé aux autres. Un module doit pouvoir être testé isolément.
2. **Offline-first côté mobile** — toute donnée saisie sur le mobile est d'abord écrite localement (stockage local), puis synchronisée. L'UI ne doit jamais bloquer en attente du réseau.
3. **Sécurité par conception** — aucune donnée sensible en clair, gestion des rôles dès le premier endpoint, pas de "on sécurisera plus tard".
4. **Explicabilité** — toute alerte générée automatiquement doit être traçable : quelle règle, quel seuil, quelles données l'ont déclenchée.
5. **Sobriété technique** — utiliser des briques éprouvées (FastAPI, PostgreSQL/PostGIS, React Native) plutôt que des outils expérimentaux. Le MVP n'est pas un terrain d'essai technologique.

### 3.2 Stack technique retenue

| Couche | Technologie | Justification |
|---|---|---|
| Backend API | Python 3.11+, FastAPI, Pydantic v2, asyncio | Performance asynchrone, typage fort, documentation OpenAPI générée automatiquement |
| Base de données | PostgreSQL 15+ avec extension PostGIS | Standard de facto pour les données géospatiales, calculs d'intersection natifs |
| ORM | SQLAlchemy 2.0 (async) + GeoAlchemy2 | Mapping objet-relationnel compatible PostGIS |
| Migrations | Alembic | Suivi versionné du schéma de base de données |
| Authentification | JWT (via `python-jose` ou équivalent), hashage `bcrypt`/`argon2` | Standard simple, suffisant pour le périmètre MVP |
| Application mobile | React Native (Expo ou bare, à trancher en Phase 1) | Un seul code base Android/iOS, écosystème mature pour le offline-first |
| Stockage local mobile | SQLite (via `expo-sqlite` ou `WatermelonDB`) + file de synchronisation | Fiabilité de la persistance hors-ligne |
| Portail web (autorités) | React + TypeScript, cartographie via **MapLibre GL** ou **Leaflet** (open-source, pas de dépendance payante) | Cohérence avec l'écosystème React, coût nul de licence |
| Infrastructure | Docker + docker-compose (dev), CI/CD GitHub Actions | Reproductibilité de l'environnement, déploiement automatisé |
| Tests | `pytest` + `pytest-asyncio` (backend), `Jest` + `React Native Testing Library` (mobile/web) | Standards de l'écosystème |
| Observabilité | Logs structurés (`structlog`), endpoint `/health` | Diagnostic minimal en phase pilote |

> **Note pour Cursor :** si une alternative technique est envisagée (ex. remplacer PostGIS par une solution non-géospatiale), il faut **s'arrêter et demander confirmation** avant de dévier — c'est un choix structurant du dossier soumis à Kimba Connect, pas un détail d'implémentation.

### 3.3 Vue en couches

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT                                                       │
│  App mobile React Native (offline-first)  |  Portail web      │
└───────────────────────────┬───────────────────────────────────┘
                            │ REST (HTTPS) + WebSocket (temps réel)
┌───────────────────────────▼───────────────────────────────────┐
│  API — FastAPI / Pydantic / asyncio                            │
│  Auth (JWT) · Validation · Routage métier                      │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│  LOGIQUE MÉTIER                                                 │
│  Moteur de règles (zones, quotas) · Détection d'anomalies      │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│  DONNÉES — PostgreSQL + PostGIS                                 │
└─────────────────────────────────────────────────────────────┘

      Point d'extension future (hors MVP) : ingestion IoT/MQTT
      → à prévoir dans le design des endpoints de géolocalisation,
        sans l'implémenter maintenant.
```

### 3.4 Structure de dépôt (monorepo recommandé)

```
cbm-pigap/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/            # config, sécurité, dépendances communes
│   │   ├── db/               # session, base, migrations Alembic
│   │   ├── modules/
│   │   │   ├── pecheurs/     # M1
│   │   │   ├── geolocalisation/  # M2
│   │   │   ├── zones/        # M3
│   │   │   ├── captures/     # M4
│   │   │   ├── quotas/       # M5
│   │   │   ├── dashboard/    # M6
│   │   │   └── alertes/      # M7
│   │   └── tests/
│   ├── alembic/
│   ├── Dockerfile
│   └── requirements.txt
├── mobile/                   # application React Native
├── web/                      # portail web autorités
├── infra/
│   ├── docker-compose.yml
│   └── .github/workflows/    # CI/CD
├── docs/
│   ├── CBM-PIGAP_Cahier_Technique_MVP.md   (ce document)
│   ├── JOURNAL.md
│   └── adr/                  # Architecture Decision Records
└── README.md
```

---

## 4. Modèle de données (entités principales)

> Cursor doit produire le schéma Alembic correspondant en Phase 1, à partir de ce modèle logique. Les types PostGIS sont indiqués entre crochets.

**Utilisateur**
`id, nom, role (pecheur | agent_controle | autorite | chercheur | admin), telephone, email, mot_de_passe_hash, date_creation`

**Pêcheur**
`id, utilisateur_id (FK), nom, prenom, numero_licence, date_delivrance_licence, statut (actif|suspendu), organisation_id (FK, nullable)`

**Embarcation**
`id, pecheur_id (FK), nom, immatriculation, type, longueur, equipements (texte libre ou JSON)`

**Position** (historique de géolocalisation)
`id, embarcation_id (FK), position [Geometry(Point, 4326)], horodatage, source (mobile|balise), synchronise_a`

**ZoneReglementee**
`id, nom, type (interdite|protegee|sensible), geometrie [Geometry(Polygon, 4326)], periode_debut (nullable), periode_fin (nullable), actif`

**Capture**
`id, pecheur_id (FK), embarcation_id (FK), espece, quantite_kg, methode, position_capture [Geometry(Point, 4326)], point_debarquement, date_capture, synchronise_a`

**Quota**
`id, espece, zone_id (FK, nullable), periode_debut, periode_fin, volume_autorise_kg, volume_consomme_kg (calculé)`

**Alerte**
`id, type (zone_interdite|depassement_quota|anomalie), niveau_gravite, embarcation_id (FK, nullable), declencheur (JSON — quelle règle, quelles données), horodatage, statut (nouvelle|traitee|ignoree)`

> **Principe de traçabilité :** le champ `declencheur` de la table `Alerte` n'est pas optionnel. Chaque alerte doit pouvoir répondre à la question « pourquoi ai-je été générée ? » sans avoir à consulter les logs applicatifs.

---

## 5. Spécification fonctionnelle détaillée par module

Pour chaque module : objectif, règles métier, critères d'acceptation. Cursor doit implémenter dans cet ordre exact (voir aussi section 9).

### 5.1 Module 1 — Enregistrement pêcheurs & embarcations
- CRUD pêcheur, embarcation, licence.
- Un pêcheur ne peut être créé sans au moins un numéro de licence (même provisoire).
- **Acceptation :** un agent peut créer un pêcheur + une embarcation en moins de 2 minutes via l'interface, et le retrouver par recherche (nom ou numéro de licence).

### 5.2 Module 2 — Géolocalisation & suivi GPS
- L'application mobile envoie la position toutes les X minutes (paramétrable) quand l'embarcation est en activité.
- Historique consultable sur une carte (portail web), avec filtre par embarcation et par période.
- **Acceptation :** une trajectoire simulée de 10 points GPS s'affiche correctement sur la carte, dans l'ordre chronologique.

### 5.3 Module 3 — Cartographie des zones réglementées
- Création/édition de polygones de zones via une interface d'administration simple (ou import GeoJSON pour le MVP — pas besoin d'un éditeur graphique sophistiqué).
- Calcul d'intersection position/zone en base de données (fonction PostGIS `ST_Intersects`), pas en code applicatif.
- **Acceptation :** une position simulée à l'intérieur d'une zone interdite déclenche systématiquement une détection ; une position à l'extérieur, jamais (test de faux positifs).

### 5.4 Module 4 — Déclaration & suivi des captures
- Formulaire mobile : espèce (liste fermée), quantité, méthode, point de débarquement, date.
- **Fonctionnement hors-ligne obligatoire** : la déclaration est stockée localement puis synchronisée dès que le réseau est disponible, avec indicateur visuel de statut (« en attente de synchronisation » / « synchronisé »).
- **Acceptation :** une déclaration saisie en mode avion est bien présente en base de données après réactivation du réseau, sans duplication ni perte.

### 5.5 Module 5 — Gestion des quotas
- Définition d'un quota par espèce (+ zone et période optionnelles).
- Calcul automatique du volume consommé à chaque nouvelle capture validée.
- Alerte automatique au franchissement de 90 % du quota, puis à 100 %.
- **Acceptation :** après une série de captures simulées atteignant 90 % du quota défini, une alerte est visible dans le tableau de bord en moins de 5 minutes.

### 5.6 Module 6 — Tableau de bord de pilotage
- Indicateurs minimums : nombre de pêcheurs actifs, volume total capturé (période sélectionnable), répartition par espèce, liste des alertes actives, carte des zones à forte activité.
- **Acceptation :** les chiffres affichés correspondent exactement aux données injectées en base pendant les tests (pas d'agrégation approximative).

### 5.7 Module 7 — Alertes intelligentes
- Pour le MVP, la « détection d'anomalies » se limite à des **règles explicites et vérifiables**, pas à un modèle de machine learning entraîné (hors périmètre, voir 2.2) :
  - Intrusion en zone interdite (M3).
  - Dépassement de quota à 90 %/100 % (M5).
  - Règle de tendance simple : volume déclaré sur 7 jours glissants > 2x la moyenne historique de l'embarcation → alerte « activité inhabituelle ».
- Chaque alerte doit inclure le champ `declencheur` (voir section 4).
- **Acceptation :** les trois types de règles se déclenchent correctement sur des jeux de données de test dédiés (un jeu de test par règle, avec cas positif et cas négatif).

---

## 6. API — conventions

- Toutes les routes sous `/api/v1/`.
- Nommage REST standard : `GET /pecheurs`, `POST /pecheurs`, `GET /pecheurs/{id}`, etc.
- Réponses d'erreur au format uniforme : `{ "detail": "...", "code": "..." }`.
- Chaque route protégée déclare explicitement les rôles autorisés (dépendance FastAPI `Depends(require_role(...))`).
- Documentation OpenAPI générée automatiquement (`/docs`) — **ne jamais désactiver**, c'est l'outil de vérification principal pendant le développement.

---

## 7. Sécurité et gouvernance des données

- Mots de passe hashés (`argon2` recommandé), jamais stockés en clair, jamais loggés.
- Toute donnée de géolocalisation est associée à un rôle d'accès : un pêcheur ne voit que ses propres données, un agent de contrôle voit sa zone, une autorité voit l'ensemble.
- Chiffrement en transit obligatoire (HTTPS/TLS) dès l'environnement de test.
- Journalisation des accès aux données sensibles (qui a consulté quoi, quand) — table `LogAcces` minimale suffit pour le MVP.
- Aucune donnée réelle de test ne doit être un vrai nom/numéro de téléphone de pêcheur — utiliser des jeux de données fictifs jusqu'à la phase pilote.

---

## 8. Standards de code et bonnes pratiques

| Aspect | Règle |
|---|---|
| Style Python | `black` + `ruff` (lint), typage strict avec `mypy` si possible |
| Style JS/TS | `eslint` + `prettier`, TypeScript strict activé |
| Tests | Un module = un dossier de tests. **Pas de module considéré terminé sans tests couvrant les critères d'acceptation de la section 5.** |
| Commits | Convention `type(scope): message` (ex. `feat(quotas): ajoute calcul de consommation`) |
| Branches | `main` protégée, une branche par module (`feature/m1-pecheurs`, etc.), fusion après tests verts |
| Documentation | Chaque module a un `README.md` court : objectif, endpoints, comment tester |
| Revue avant passage au module suivant | Voir checklist section 9 — Cursor s'auto-vérifie avant de continuer |

---

## 9. Plan de réalisation méthodique (à cocher au fur et à mesure)

> Ce plan reprend les 4 phases de la proposition commerciale soumise à Kimba Connect. Cursor doit avancer **une case à la fois**, dans l'ordre, et ne pas paralléliser les modules M1 à M7 pour garder un système toujours fonctionnel de bout en bout.

### Phase 0 — Amorçage technique (préalable, non facturé séparément)
- [x] Socle Cursor : agents, règles, skills, hooks, `docs/STATUS.md` + `docs/JOURNAL.md` (2026-07-27)
- [x] Initialiser le monorepo selon la structure de la section 3.4 (2026-07-27)
- [x] `docker-compose` avec PostgreSQL+PostGIS fonctionnel en local (2026-07-27)
- [x] Squelette FastAPI avec route `/health` répondant 200 (2026-07-27)
- [x] Pipeline CI GitHub Actions : lint + tests à chaque push (2026-07-27) — workflows en `.github/workflows/` (racine)
- [x] `JOURNAL.md` créé avec la première entrée (date, décisions de Phase 0)

### Phase 1 — Étude et conception (semaines 1-2)
- [x] Schéma de base de données finalisé (Alembic, migration initiale) à partir de la section 4 (2026-07-27)
- [x] Contrats d'API rédigés (au moins les schémas Pydantic des 7 modules) avant tout code métier (2026-07-27)
- [x] Maquettes d'écrans mobile (parcours pêcheur) et web (tableau de bord) validées — wireframes basse fidélité (validées 2026-07-27)
- [x] Décision technique actée : Expo (ADR-001 Accepté) ; MapLibre (ADR-002 Accepté) — 2026-07-27
- [x] **Point de validation avec Christian avant de passer en Phase 2** (2026-07-27)

### Phase 2 — Développement du prototype (semaines 3-10)
Pour chaque module, dans l'ordre M1 → M7 :
- [x] Modèle de données + migration (M1)
- [x] Endpoints API + validation Pydantic (M1)
- [x] Tests automatisés couvrant les critères d'acceptation (section 5) (M1)
- [x] Écran(s) mobile ou web correspondant(s) (M1 agent Expo)
- [x] Entrée dans `JOURNAL.md` : ce qui a été fait, quelles technologies/principes appliqués, ce qui reste en dette technique (M1)
- [x] Module marqué "done" seulement si tous les tests passent en CI (M1 — tests locaux verts)

Sous-jalons explicites :
- [x] M1 — Enregistrement pêcheurs & embarcations : terminé et testé
- [x] M2 — Géolocalisation & suivi GPS : terminé et testé
- [x] M3 — Cartographie des zones réglementées : terminé et testé
- [x] M4 — Déclaration des captures (offline-first) : terminé et testé, y compris test de synchronisation après coupure réseau
- [x] M5 — Gestion des quotas : terminé et testé
- [x] M6 — Tableau de bord de pilotage : terminé et testé
- [x] M7 — Alertes intelligentes (règles) : terminé et testé
- [ ] Test d'intégration de bout en bout : un scénario complet (déclaration → synchronisation → contrôle zone/quota → alerte → visible au tableau de bord) fonctionne sans intervention manuelle

### Phase 3 — Expérimentation terrain (semaines 11-14)
- [ ] Déploiement sur environnement de staging accessible aux utilisateurs pilotes
- [ ] Jeu de données réelles (anonymisées si besoin) chargé pour la zone pilote
- [ ] Session de formation des utilisateurs pilotes documentée
- [ ] Collecte structurée des retours (fichier `docs/retours-pilote.md`)
- [ ] Ajustements priorisés et implémentés (pas de refonte — corrections ciblées)

### Phase 4 — Déploiement et formation (semaines 15-16)
- [ ] Documentation d'exploitation finalisée (guide administrateur, guide utilisateur)
- [ ] Formation des équipes administratives
- [ ] Bilan des indicateurs de performance (Annexe C de la proposition commerciale) mesurés et documentés
- [ ] Livraison finale : code source, documentation, accès

---

## 10. Indicateurs de performance à mesurer (rappel de l'offre commerciale)

| Indicateur | Cible |
|---|---|
| Taux d'usage effectif de l'application mobile | ≥ 70 % des pêcheurs pilotes déclarent ≥ 1 capture/semaine |
| Taux de synchronisation réussie | 100 % des déclarations hors-ligne synchronisées sans perte |
| Taux de faux positifs des alertes | < 15 % jugées non pertinentes par les agents |
| Délai moyen de notification d'alerte | < 5 minutes |
| Disponibilité de la plateforme | ≥ 98 % pendant la phase pilote |

Ces indicateurs doivent être mesurables techniquement dès la Phase 2 (logs, requêtes de suivi), pas improvisés en Phase 3.

---

## 11. Mode de collaboration attendu avec Cursor

1. **Avance module par module**, jamais en parallèle sur plusieurs modules à la fois.
2. **N'invente pas de règle métier non spécifiée** dans ce document. En cas de doute, pose la question plutôt que de choisir une interprétation.
3. **Documente en même temps que tu codes**, pas après coup : chaque module terminé = une entrée dans `JOURNAL.md`.
4. **Explique tes choix techniques en langage clair**, pas seulement en jargon — Christian doit pouvoir comprendre pourquoi telle librairie ou tel pattern a été choisi.
5. **Teste avant de déclarer terminé.** Un module sans test n'est pas un module fini.
6. **Ne casse jamais ce qui fonctionne.** Avant de commencer un nouveau module, vérifie que les tests des modules précédents passent toujours.
7. **Signale les écarts** entre ce cahier technique et ce qui a réellement été implémenté, s'il y en a — mieux vaut un écart documenté qu'un écart silencieux.

### Format attendu pour chaque entrée de `JOURNAL.md`

```markdown
## [Date] — Module Mx : <nom du module>

**Ce qui a été construit :**
- ...

**Pourquoi (lien avec le cahier des charges / ce document) :**
- ...

**Technologies / principes utilisés :**
- ...

**Tests réalisés :**
- ...

**Points ouverts / dette technique :**
- ...
```

---

## 12. Glossaire technique

- **PostGIS** — extension géospatiale de PostgreSQL, permet de stocker et d'interroger des positions et des zones géographiques directement en base de données.
- **Offline-first** — approche où l'application est conçue pour fonctionner sans connexion réseau en priorité, la synchronisation étant un mécanisme secondaire.
- **JWT (JSON Web Token)** — méthode d'authentification par jeton signé, sans session serveur à maintenir.
- **ORM (Object-Relational Mapping)** — couche logicielle qui permet de manipuler la base de données via des objets du langage de programmation plutôt qu'en SQL brut.
- **ADR (Architecture Decision Record)** — court document qui trace une décision technique structurante et sa justification, pour ne pas la perdre ou la refaire sans savoir pourquoi elle a été prise.
- **Definition of Done** — liste de critères qu'une fonctionnalité doit remplir pour être considérée réellement terminée (pas seulement « le code compile »).

---

## 13. Definition of Done — MVP global

Le MVP est considéré terminé quand, et seulement quand :

- [ ] Les 7 modules sont fonctionnels et testés individuellement (section 9, Phase 2)
- [ ] Le scénario de bout en bout (déclaration hors-ligne → synchronisation → contrôle → alerte → tableau de bord) fonctionne sans intervention manuelle
- [ ] La phase pilote a été menée avec des utilisateurs réels et les retours documentés
- [ ] Les 5 indicateurs de performance (section 10) ont été mesurés au moins une fois
- [ ] La documentation d'exploitation existe et a été testée par une personne extérieure au développement
- [ ] Aucune donnée sensible n'est exposée sans contrôle de rôle
- [ ] `JOURNAL.md` retrace l'intégralité des décisions prises, module par module

---

*Ce document doit être tenu à jour. Toute évolution du périmètre (section 2) ou de l'architecture (section 3) doit être actée par un ADR dans `docs/adr/` et reflétée ici.*