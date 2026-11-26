# Lot 9, partie serveur : traitement des alertes et journal de traçabilité

- **Statut :** compte rendu interne, projet soumis à validation humaine
- **Date :** 2026-11-24
- **Auteur :** session serveur (agent), pour Christian BEYEME
- **État :** présent en code dans `backend/`, non commité, non déployé ; migration appliquée à la base de développement seulement

## 1. Compréhension

### 1.1 Demande

Demande du porteur, citée telle quelle : « Les alectes doivent plus détaillé ou décrit et sujet à des traitement de plusieurs statut avec commentaire et traçabilté des traitement et de l'agent ayant traiter le sujet , donc il faut un jkurnal de traçabilté ».

Constat de départ : une alerte n'avait que trois statuts (`nouvelle`, `traitee`, `ignoree`), changés sans commentaire ni trace de l'auteur ; sa seule explication était le contenu technique de son déclencheur ; la liste était plafonnée à 100 alertes, sans pagination ni filtre de gravité ou de période.

### 1.2 Choix retenus et choix écartés

| Sujet | Retenu | Écarté, et pourquoi |
|-------|--------|---------------------|
| États de traitement | Colonne `etat_traitement` ; le statut historique en est déduit à chaque changement | Remplacer le statut : le tableau de bord, les notifications, les contrôles et le portail le lisent |
| États et transitions | Fichier `alertes_traitement.json`, au statut « Proposé » | Une énumération en base : chaque ajustement demanderait une migration |
| Journal | Table `alertes_journal`, une ligne par changement ; la base refuse modification, suppression et vidage | Une trace dans le journal des accès : il ne garde ni l'état avant, ni l'état après |
| Auteur | Référence du compte, avec son nom et son rôle figés au moment de l'action | La seule référence : un compte supprimé effacerait l'auteur |
| Description | Calculée à la lecture, à partir du déclencheur, par des modèles de phrase du paramétrage | Une description stockée : elle ne bénéficierait pas d'une correction de libellé |
| Ancien point d'accès `PATCH /alertes/{id}` | Conservé ; le statut est traduit en état et inscrit au journal | Le retirer : le portail existant cesserait de fonctionner |
| Pagination | `limit` et `offset`, total dans l'en-tête `X-Total-Count`, la liste reste un tableau | Un objet enveloppe : il casserait le contrat lu par le portail |
| Journal et chercheur | Le chercheur lit la liste, pas le détail nominatif | Lui ouvrir le journal : il porte le nom des agents |

### 1.3 Règles et statut

| Règle | Statut | Valideur |
|-------|--------|----------|
| Cinq états : à traiter, prise en charge, en vérification, clôturée fondée, clôturée non fondée | Proposé | Christian |
| Passages permis (section 2.3) | Proposé | Christian |
| Commentaire obligatoire, de 5 à 2 000 caractères | Proposé | Christian |
| Ancien écran : statut traduit en état, sans contrôle des passages, commentaire par défaut au journal | Proposé | Christian |
| Journal ni modifiable ni supprimable ; seule la mise à vide de l'auteur, quand son compte est supprimé, reste permise | Proposé | Christian |
| Le chercheur ne lit pas le journal nominatif | Proposé | Christian |

## 2. Exécution

### 2.1 Fichiers

| Fichier | Rôle |
|---------|------|
| `backend/app/data/regles/alertes_traitement.json` | États, passages, commentaire, ancien écran, pagination, fuseau, libellés et modèles de description |
| `backend/app/modules/alertes/traitement.py` | Lecture du paramétrage, description lisible, état posé à la création, changement d'état, journal |
| `backend/app/modules/alertes/service.py`, `router.py`, `schemas.py` | Liste filtrée et paginée, détail, traitement, états, ancien point d'accès |
| `backend/app/db/models.py` | `Alerte.etat_traitement`, classe `AlerteJournal` |
| `backend/alembic/versions/b1d4e5f6a738_lot9_traitement_alertes.py` | Migration additive, reprise de l'existant, déclencheurs qui protègent le journal |
| `backend/app/main.py` | En-tête `X-Total-Count` lisible par le portail (CORS) |
| `backend/scripts/seed_production_demo.py`, `seed_series_saisonnieres.py` | Leurs purges épargnent les alertes qui ont un journal |
| `backend/app/tests/test_lot9_alertes.py` | 12 tests |

Reprise de l'existant : `nouvelle` devient « à traiter », `traitee` « clôturée, fondée », `ignoree` « clôturée, non fondée ». Base de développement : 24 873, 254 et 3 alertes. Retour arrière : `alembic downgrade a9c3e4f5b627` (il efface le journal).

### 2.2 Points d'accès

| Méthode et chemin | Rôles | Effet |
|-------------------|-------|-------|
| `GET /api/v1/alertes/etats` | autorité, agent de contrôle, administrateur, chercheur | États, libellés, passages permis, bornes du commentaire |
| `GET /api/v1/alertes` | les mêmes | Liste filtrée et paginée, avec description ; total dans `X-Total-Count` |
| `GET /api/v1/alertes/{id}` | autorité, agent de contrôle, administrateur | Description, journal, passages possibles |
| `POST /api/v1/alertes/{id}/traitements` | les mêmes | Changement d'état avec commentaire |
| `PATCH /api/v1/alertes/{id}` | les mêmes | Ancien point d'accès, inchangé pour le portail ; commentaire facultatif |

Sans session : 401. Rôle non admis : 403. Alerte inconnue : 404 `ALERTE_NOT_FOUND`.

**Filtres de la liste :** `type`, `statut` (historique), `embarcation_id`, `etat` (répétable), `gravite` (répétable), `regle`, `depuis` et `jusqu_a` (date sans fuseau lue en temps universel), `limit` (100 par défaut, 500 au plus) et `offset`. Tri : de la plus récente à la plus ancienne.

**Traitement :**

```json
{"etat": "prise_en_charge", "commentaire": "Pirogue jointe par radio, vérification en cours."}
```

Réponse : le détail de l'alerte.

```json
{
  "id": "1b0f9c1e-0000-4000-8000-000000000000",
  "type": "zone_interdite",
  "niveau_gravite": "critique",
  "horodatage": "2026-11-20T13:05:00Z",
  "statut": "nouvelle",
  "etat_traitement": "prise_en_charge",
  "etat_libelle": "Prise en charge",
  "ouverte": true,
  "description": {
    "titre": "Présence en zone interdite",
    "resume": "L'embarcation « Pirogue fictive » (GA-L9-0001) a été localisée dans la zone interdite « Réserve fictive de la Pointe ».",
    "quand": "20/11/2026 à 14 h 05",
    "ou": "Réserve fictive de la Pointe ; 0,3912° N, 9,4536° E",
    "regle": {"code": "intrusion_zone_interdite", "libelle": "Présence en zone interdite"},
    "embarcation": {"id": "…", "nom": "Pirogue fictive", "immatriculation": "GA-L9-0001"},
    "donnees": [{"libelle": "Zone", "valeur": "Réserve fictive de la Pointe"}]
  },
  "journal": [
    {
      "horodatage": "2026-11-24T16:40:12Z",
      "etat_avant": "a_traiter", "etat_avant_libelle": "À traiter",
      "etat_apres": "prise_en_charge", "etat_apres_libelle": "Prise en charge",
      "commentaire": "Pirogue jointe par radio, vérification en cours.",
      "auteur_nom": "Agent fictif", "auteur_role": "agent_controle", "origine": "traitement"
    }
  ],
  "transitions_possibles": [
    {"code": "en_verification", "libelle": "En vérification"},
    {"code": "cloturee_fondee", "libelle": "Clôturée, fondée"},
    {"code": "cloturee_non_fondee", "libelle": "Clôturée, non fondée"},
    {"code": "a_traiter", "libelle": "À traiter"}
  ]
}
```

La réponse porte aussi `declencheur` et `embarcation_id`, comme avant.

| Code | Statut | Sens |
|------|--------|------|
| `COMMENTAIRE_OBLIGATOIRE`, `COMMENTAIRE_TROP_LONG` | 422 | Commentaire absent, trop court ou trop long |
| `ETAT_INCONNU` | 422 | État absent du paramétrage |
| `TRANSITION_NON_PERMISE` | 409 | Passage non prévu ; le message cite les passages possibles |
| `ETAT_INCHANGE` | 409 | L'alerte est déjà dans cet état (deux agents au même instant : le second reçoit ce code) |
| `FILTRE_INVALIDE` | 422 | Page trop grande, état inconnu, période inversée |
| `REGLE_INDISPONIBLE` | 503 | Paramétrage absent ou incohérent |

### 2.3 Passages permis (paramétrage)

| Depuis | Vers |
|--------|------|
| À traiter | Prise en charge ; Clôturée, non fondée |
| Prise en charge | En vérification ; Clôturée, fondée ; Clôturée, non fondée ; À traiter |
| En vérification | Clôturée, fondée ; Clôturée, non fondée ; Prise en charge |
| Clôturée (fondée ou non) | Prise en charge (réouverture) |

Une alerte dont l'état a été retiré du paramétrage peut toujours revenir à l'état initial.

### 2.4 Vérification

| Contrôle | Résultat |
|----------|----------|
| `test_lot9_alertes.py` | 12 passés |
| Suites liées (alertes, quotas, contrôles, balises, appareils, tableau de bord, notifications, météo, activité, documents) | 84 passés |
| Suite complète, avant relecture | 256 passés, aucun échec |
| Suite complète, après corrections de la relecture | 258 passés, aucun échec (base de test dédiée) |
| Relecture indépendante | Un bloquant et huit points secondaires, tous corrigés (section 2.5) |

Tests nommés : description lisible ; états successifs, commentaire et journal ; refus en clair ; ancien écran ; journal ni modifiable ni supprimable ; auteur ni remplacé ni vidage ; rôles ; filtres et pagination ; traitements simultanés ; règles non codées en dur ; état initial, dates sans fuseau et modèles ; paramétrage et migration.

### 2.5 Relecture indépendante

| Constat | Suite donnée |
|---------|--------------|
| Bloquant : l'état d'une alerte à sa création était figé en base, le paramétrage n'était pas lu | Corrigé : toute alerte créée (règles, quotas, contrôles, météo) reçoit l'état initial du paramétrage ; testé avec un paramétrage modifié |
| Date sans fuseau mêlée à une date avec fuseau : erreur du serveur | Corrigé : lue en temps universel |
| Modèle de description mal formé : erreur du serveur sur toute la liste | Corrigé : modèles vérifiés au chargement (503) |
| Purges des scripts de démonstration bloquées par le journal | Corrigé : elles épargnent les alertes qui ont un journal |
| Vidage de la table du journal non bloqué | Corrigé : refusé par la base |
| Total illisible par le portail depuis une autre origine | Corrigé : en-tête exposé |
| Codes techniques dans les données (« zee_gabon », code d'espèce) | Corrigé : libellés du paramétrage, nom de l'espèce |
| État retiré du paramétrage : alerte sans issue | Corrigé : retour possible à l'état initial |
| Commentaire contrôlé avant l'existence de l'alerte | Corrigé : 404 d'abord |

### 2.6 Limites et dettes

1. La reprise des alertes existantes (statut vers état) n'est pas couverte par un test automatique : la base de test est créée vide. Vérifiée sur la base de développement.
2. Les alertes créées par l'API avant un changement du paramétrage gardent leur état ; si un état est retiré, elles ne peuvent que revenir à l'état initial.
3. Le portail affiche encore l'ancien écran (trois statuts) : la partie portail du lot 9 reste à faire (états, commentaire, journal, filtres, pagination).
4. L'ancien point d'accès ne contrôle pas les passages (paramètre `controle_des_transitions`, à `false`) : un retour de « clôturée » à « à traiter » y reste possible, et il est journalisé.
5. Le fuseau des descriptions est celui de Libreville (paramétrage).

### 2.7 Résultats du dernier passage

Suite complète : 258 passés, aucun échec. `ruff check app` : 14 erreurs, identiques au dernier commit, aucune dans les fichiers du lot. Migration rejouée sur la base de développement (descente puis montée, journal vide).

### 2.8 Texte proposé pour le journal

```
## [2026-11-24] : Lot 9, partie serveur : traitement des alertes et journal de traçabilité

**Ce qui a été construit :**
- Description lisible de chaque alerte : ce qui s'est passé, quand, où, au titre de quelle règle, avec quelles données
- Cinq états de traitement, passages permis et commentaire obligatoire, paramétrés dans `alertes_traitement.json`
- Journal de traçabilité (auteur, date, état avant et après, commentaire), que la base refuse de modifier, de supprimer ou de vider
- Liste filtrée (état, type, gravité, règle, période) et paginée, total dans `X-Total-Count`
- Ancien point d'accès conservé et journalisé ; migration additive `b1d4e5f6a738`

**Pourquoi :** demande du porteur sur le détail des alertes, leur traitement en plusieurs états et la traçabilité des agents.

**Tests réalisés :** 12 tests nommés ; relecture indépendante, un bloquant et huit points secondaires corrigés.

**Points ouverts :** états, passages et commentaire « Proposé », à valider ; partie portail.
```

### 2.9 Résumé

1. Présent en code, non commité : description lisible, cinq états de traitement, commentaire obligatoire, journal inaltérable, liste filtrée et paginée.
2. Le portail existant continue de fonctionner : ancien point d'accès conservé, statut historique tenu à jour, liste toujours en tableau.
3. 12 tests nommés verts ; relecture indépendante faite, ses retours corrigés.
4. Non vérifié : partie portail, charge.
5. Décision du porteur : valider les états, les passages permis et la longueur du commentaire.
6. Décision du porteur : le chercheur doit-il lire le journal (il porte le nom des agents) ?
