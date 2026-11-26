# Lot 2, partie mobile : page de profil, fiche d'identité, informations d'inscription

- **Statut :** compte rendu de chantier interne, soumis à la validation du porteur. Rien n'est commité, fusionné ni mis en ligne.
- **Date :** 2026-11-24
- **Auteur :** session mobile (agent), pour Christian BEYEME
- **Périmètre de fichiers :** `mobile/` et ce document. Lecture seule ailleurs.
- **Liens :** [partie serveur du lot 2](lot-2-profil-serveur.md) (contrats), [lot 3, socle mobile](lot-3-mobile-socle.md), [README de l'application](../mobile/README.md), [captures](../mobile/docs/captures-lot-2/)

Vocabulaire : **livré** veut dire exécuté et constaté, sur l'émulateur ou par un test ; **présent en code** veut dire écrit et typé, pas constaté à l'exécution ; **cible** veut dire non fait.

## 1. Compréhension

### 1.1 Le besoin

La partie serveur du lot 2 sert trois contrats ; l'application doit les rendre utilisables sur le terrain :

1. **Pour le pêcheur, sa page de profil** : une courte présentation, les espèces tirées de ses captures (il peut en masquer), des tarifs facultatifs au kilo ou à l'unité, et l'ouverture de la page au public par un lien et un QR code, désactivée au départ.
2. **Les informations d'inscription complémentaires de son embarcation** : MMSI, numéro OMI, indicatif radio, jauge brute, année de construction, propriétaire, exploitant, toutes facultatives.
3. **Pour l'agent, la fiche d'identité à deux volets** : ce que dit le registre (identité, licence, organisation, embarcations) et ce que les embarcations émettent (source et âge du dernier relevé, période observée, nombre de relevés), après lecture du QR ou recherche.

### 1.2 Contrats utilisés

| Route | Rôle | Usage dans l'application |
|-------|------|--------------------------|
| `GET /api/v1/profils/moi` | pêcheur | « Ma page » : aperçu et réglages |
| `PATCH /api/v1/profils/moi` | pêcheur | Présentation, espèces masquées, tarifs et leur affichage, ouverture au public |
| `GET /api/v1/identite/moi` | pêcheur | « Ma fiche complète », depuis « Ma carte » |
| `GET /api/v1/identite/pecheurs/{id}` | agent | Fiche d'identité depuis le résultat d'un contrôle ou un dossier de la recherche |
| `POST /api/v1/embarcations` | agent | Informations d'inscription saisies au nouveau dossier |
| `PATCH /api/v1/embarcations/{id}` | agent | Informations d'inscription complétées depuis la fiche d'identité |

Non utilisées : `GET /profils/moi/qr` (le QR est dessiné sur le téléphone, voir 1.3), les vues connectée et publique d'une page (aucun écran de l'application ne montre la page d'un autre acteur), la demande de licence (portail).

### 1.3 Choix retenus et écartés

| Sujet | Retenu | Écarté, et pourquoi |
|-------|--------|---------------------|
| Informations d'inscription du pêcheur | L'agent les saisit (nouveau dossier) et les complète (fiche d'identité) ; le pêcheur les lit dans sa fiche | Un formulaire pour le pêcheur : le serveur réserve l'écriture d'une embarcation à l'agent, à l'administrateur et à l'autorité |
| Ouverture de la fiche d'identité | Fenêtre plein écran au-dessus du contrôle ou de la recherche : le résultat consulté reste en place au retour | Un écran séparé : le résultat du contrôle serait perdu à chaque consultation |
| Fiche d'identité hors ligne | Consultée avec du réseau seulement, jamais gardée sur le téléphone | La garder sur le téléphone de l'agent : données nominatives, et chaque consultation doit passer par le serveur, qui l'inscrit au journal des accès |
| QR de la page publique | Dessiné sur le téléphone à partir de `lien_public`, avec le composant de la carte professionnelle | L'image SVG du serveur : un composant de plus, et indisponible sans réseau |
| Contrôle de la présentation | Longueur seulement, lue dans `limites` ; le contrôle des coordonnées reste au serveur, dont le message s'affiche tel quel | Reproduire le contrôle des coordonnées : règle et seuil tenus par le paramétrage du serveur, ils divergeraient |
| Tarifs | Pour les espèces affichées sur la page, une case par unité admise (`limites.unites_tarif`) ; les tarifs des espèces masquées sont renvoyés tels quels | Proposer tout le référentiel : une page parle de ce que le pêcheur déclare |
| Affichage de la présentation | Composant de texte natif : rien n'est interprété, une balise s'affiche telle quelle | Aucun autre envisagé |
| Page hors ligne | Dernière version gardée sur le téléphone, affichée avec un avertissement ; les modifications demandent du réseau | Une file de modifications hors ligne : peu utile pour une vitrine, et source de conflits |

### 1.4 Règles et dépendances

Les règles de la page restent celles du serveur, avec leur statut (partie serveur, section 1.3). Trois points touchent l'application :

- Fenêtre des captures, nombre d'espèces, espèces protégées, vitrine publique, informations d'inscription : **« Proposé »**, valideurs Christian et DGPA. L'application n'en code aucune ; elle affiche ce que le serveur renvoie.
- La page publique du portail (`/profil/<jeton>`) est construite par la session du portail. **Tant qu'elle n'existe pas en ligne, le lien et le QR mènent à une page absente** : ouvrir sa page au public n'a d'effet visible qu'une fois le portail à jour.
- Le serveur du lot 2 n'est pas encore en production : sans lui, « Ma page » et la fiche d'identité répondent « introuvable » sur le serveur en ligne.

## 2. Exécution

**Travail interrompu par la limite d'usage le 2026-11-24 : la vérification sur émulateur n'est faite que pour la page du pêcheur.**

### 2.1 Ce qui est fait

| Livrable | État | Où |
|----------|------|-----|
| « Ma page » du pêcheur, cinq onglets : aperçu, texte, espèces, tarifs, partage | Livré (émulateur, serveur d'essai) | `src/screens/ProfilScreen.tsx`, `src/lib/profil.ts`, tuile « Ma page » de l'accueil |
| Fiche d'identité à deux volets (registre, suivi), en fenêtre plein écran | Présent en code | `src/components/FicheIdentite.tsx`, `src/components/IdentiteSheet.tsx` ; ouverte depuis « Ma carte » (pêcheur), le résultat du contrôle et le dossier de la recherche (agent) |
| Informations d'inscription : saisie au nouveau dossier, correction depuis la fiche (agent), lecture dans la fiche (pêcheur) | Présent en code | `src/components/InscriptionFields.tsx`, `src/lib/inscription.ts`, `src/screens/CreatePecheurScreen.tsx` |
| Client d'API et serveur d'essai | Présent en code ; serveur d'essai vérifié par appels directs | `src/api.ts`, `scripts/serveur-essai.mjs` |

### 2.2 Vérifications exécutées

| Vérification | Résultat |
|--------------|----------|
| `npx tsc --noEmit` | 0 erreur |
| `npm test` | 97 tests verts, 14 suites (20 nouveaux : inscription, tarifs, suivi) |
| Serveur d'essai, appels directs | Refus des coordonnées, unité inconnue, MMSI à 9 chiffres, lien public, fiche à deux volets : réponses et messages conformes au contrat |
| Émulateur, APK d'essai, pêcheur fictif | Aperçu ; présentation avec numéro de téléphone refusée avec le message du serveur ; présentation contenant `<b>…</b>` affichée telle quelle, comme du texte ; espèce masquée ; prix nul refusé ; tarifs enregistrés et affichés ; ouverture au public après confirmation, lien et QR affichés. Captures : `mobile/docs/captures-lot-2/` |

### 2.3 Ce qui reste

1. **Deux corrections faites après le parcours, non revues à l'écran :** titre « Visible sur la plateforme » (il était tronqué) et ligne « Afficher mes tarifs » qui bascule entière (seul le petit interrupteur réagissait).
2. **Parcours de l'agent sur émulateur :** fiche d'identité depuis le contrôle et la recherche, correction des informations d'inscription, nouveau dossier avec ces informations ; fiche du pêcheur depuis « Ma carte ».
3. **Essai sur téléphone réel : toujours pas fait**, premier point de vérification (lot 3, section 2.4), et serveur réel (lot 2 serveur non déployé).
4. Démarche, limites, demandes au serveur, décisions et texte du journal de ce compte rendu.

`android/` est resté en mode essai (trafic en clair autorisé) : le régénérer avec `--clean` avant toute construction de diffusion.
