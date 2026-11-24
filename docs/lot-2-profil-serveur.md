# Lot 2, partie serveur : fiche d'identité et page de profil

- **Statut :** compte rendu interne, projet soumis à validation humaine
- **Date :** 2026-11-24
- **Auteur :** session serveur (agent), pour Christian BEYEME
- **État :** présent en code dans `backend/`, non commité, non déployé ; migration appliquée à la base de développement seulement
- **Liens :** [chantier de novembre 2026](chantier-evolutions-2026-11.md) (sections 1.2, 2 et 3), [lot 5](lot-5-activite-zones-serveur.md), [lot 10](lot-10-appareil-unique-serveur.md)

## 1. Compréhension

### 1.1 Problème

Trois demandes du porteur, à servir d'abord côté serveur :

1. compléter ce que le registre sait d'une embarcation (complément 11 du chantier) ;
2. donner à chaque acteur une page de profil : espèces pêchées et, s'il le souhaite, ses tarifs (complément 10) ;
3. présenter un pêcheur et ses embarcations en deux volets, à la manière d'un outil public de suivi des navires : ce que dit le registre d'un côté, ce que l'embarcation émet de l'autre (complément 11).

Constat de départ : le registre ne portait ni MMSI, ni numéro OMI, ni indicatif radio, ni jauge, ni année de construction, ni distinction entre propriétaire et exploitant ; aucun acteur n'avait de page ; le pêcheur et l'organisation n'avaient aucune route pour se lire eux-mêmes.

### 1.2 Choix retenus et choix écartés

| Sujet | Retenu | Écarté, et pourquoi |
|-------|--------|---------------------|
| Informations d'inscription | Sept colonnes facultatives sur l'embarcation | Un champ libre en JSON : ces informations servent de clés de rapprochement (MMSI, numéro OMI), elles doivent se chercher |
| Contrôle de saisie | Format des identifiants seulement (9 chiffres, 7 chiffres) | Unicité du MMSI ou du numéro OMI : une règle d'unicité relève de la DGPA, elle bloquerait une saisie légitime |
| Demande de licence | Les mêmes informations se saisissent à la demande et sont reportées à l'approbation | Les limiter au formulaire de l'agent : la demande publique est la première porte d'inscription |
| Espèces du profil | Calculées à la lecture depuis les captures ; seules les espèces masquées sont enregistrées | Une liste saisie par l'acteur : elle pourrait s'écarter de ce qui est déclaré |
| Tarifs | Liste enregistrée avec le profil, en francs CFA entiers | Une table de prix datés : elle relève du lot 6 (prix de vente, courbes) |
| Lien public | Jeton tiré au hasard, créé à la première ouverture, conservé si la page est refermée puis rouverte | Un lien bâti sur l'identifiant de l'acteur : il se devinerait |
| QR code | Image SVG rendue par le serveur à partir du lien | Une dépendance nouvelle dans le portail et dans l'application |
| Coordonnées | Aucun champ de coordonnée, dans aucune vue de la page ; le texte de présentation, libre, est contrôlé à la saisie | Un téléphone affichable sur accord de l'acteur : règle encore « Proposé », non tranchée |
| Espèce non reconnue | Jamais affichée : espèce protégée, espèce inconnue du référentiel, ou référentiel absent du serveur | Afficher par défaut ce qui n'est pas reconnu : une espèce protégée passerait dès que le référentiel manque |
| Enregistrements simultanés | Verrou sur l'acteur : deux enregistrements de la même page se suivent | Reprise après erreur : plus fragile, et deux réglages envoyés au même instant s'écraseraient |
| Volet « suivi » | Source et âge du dernier relevé, période observée, nombre de relevés | La dernière position : le rôle organisation n'y a pas accès ailleurs dans l'API |
| Fiche d'identité et chercheur | Non admis | Le registre nominatif lui est déjà fermé (`/pecheurs`) |

### 1.3 Règles et statut

Paramètres et statut des règles dans `backend/app/data/regles/profil_acteur.json`, relu dès qu'il change.

| Règle | Statut | Valideurs |
|-------|--------|-----------|
| Page visible des personnes connectées ; ouverture au public par lien ou QR code sur décision de l'acteur, désactivée au départ | Décidée le 2026-11-24 | Christian |
| Tarifs facultatifs, par espèce, au kilo ou à l'unité, en francs CFA, affichés seulement si l'acteur le décide | Décidée le 2026-11-24 | Christian |
| Espèces tirées des captures déclarées, l'acteur pouvant en masquer | Proposé | Christian, DGPA |
| Fenêtre des captures retenues (365 jours) et nombre d'espèces affichées (12) | Proposé | Christian, DGPA |
| Une espèce protégée du référentiel ne s'affiche pas et ne reçoit pas de tarif | Proposé | Christian, DGPA |
| Une espèce inconnue du référentiel ne s'affiche pas ; sans référentiel, ou sans sa liste des espèces protégées, la page n'affiche ni espèce ni tarif | Décidée le 2026-11-24 | Christian |
| Le tarif d'une espèce que l'acteur a masquée ne s'affiche pas ; il reste dans ses réglages | Décidée le 2026-11-24 | Christian |
| Texte de présentation sans coordonnée : adresse électronique, adresse de site et suite de plus de six chiffres refusées à la saisie | Décidée le 2026-11-24 | Christian |
| Une organisation désactivée ne lit plus la fiche d'identité de ses membres | Décidée le 2026-11-24 | Christian |
| Page d'un pêcheur suspendu ou à la licence expirée, ou d'une organisation désactivée : lisible ni des comptes connectés ni du public ; l'acteur garde la sienne ; licence sans date de délivrance non tenue pour expirée | Décidée le 2026-11-24 | Christian |
| Version publique sans coordonnée personnelle, ni numéro de licence, ni immatriculation ; servie seulement pour un acteur actif | Proposé | Christian |
| MMSI, numéro OMI, indicatif radio, jauge, année de construction, propriétaire et exploitant : facultatifs à l'inscription | Proposé | Christian, DGPA |
| Garde-fous de saisie : présentation de 600 caractères, 30 tarifs, prix d'au plus 10 000 000 francs CFA | Proposé | Christian |

### 1.4 Hypothèses à tester

1. Les espèces tirées des captures suffisent à décrire un acteur : à voir avec les acteurs eux-mêmes ; un pêcheur sans capture déclarée a une page sans espèce.
2. Le nom du pêcheur peut s'afficher sur sa page, y compris en version publique s'il l'ouvre : c'est lui qui décide d'ouvrir, mais l'information qui lui est due reste à rédiger.
3. Un contrôle automatique du texte de présentation suffit, sans relecture humaine : il refuse les caractères invisibles et les coordonnées reconnaissables, mais un numéro écrit en toutes lettres passe. Aucune modération n'est prévue dans ce lot.

## 2. Exécution

### 2.1 Ce qui est présent en code

| Fichier | Rôle |
|---------|------|
| `backend/app/db/models.py` | Sept colonnes sur `embarcations`, `demandes_licence.embarcation_complements`, table `profils_acteur` |
| `backend/alembic/versions/a9c3e4f5b627_lot2_identite_profil.py` | Migration additive, à la suite de celle du lot 10 |
| `backend/app/data/regles/profil_acteur.json` | Paramètres de la page et statut des règles |
| `backend/app/modules/pecheurs/schemas.py` | `ComplementsEmbarcation` : les sept informations, leur mise en forme et leur contrôle |
| `backend/app/modules/demandes_licence/` | Saisie à la demande (JSON et formulaire avec pièces), report à l'approbation |
| `backend/app/modules/profils/` | Partie F : règles, schémas, service, routes, README |
| `backend/app/modules/identite/` | Partie G : schémas, service, routes, README |
| `backend/app/core/perimetre.py` | Périmètre par rôle, partagé avec le lot 5 ; une organisation désactivée ne voit plus rien |
| `backend/app/core/texte.py` | Contrôle des textes libres : ni caractère invisible, ni marque de direction |
| `backend/app/core/validation_messages.py` | Libellés des nouveaux champs ; messages de saisie en français pour tous les types d'erreur |
| `backend/app/core/regles.py` | Le message d'un paramétrage absent ne nomme plus le fichier (il reste au journal du serveur) |
| `backend/app/tests/test_lot2_inscription.py`, `test_lot2_profil.py`, `test_lot2_identite.py` | 23 tests |

Migration : la base de développement est à la révision `a9c3e4f5b627`. Retour arrière : `alembic downgrade f8b2d3e4a516`.

### 2.2 E. Informations d'inscription de l'embarcation

Toutes facultatives. Elles s'ajoutent aux corps et aux réponses de `POST /api/v1/embarcations`, `PATCH /api/v1/embarcations/{id}` et `GET /api/v1/embarcations` (rôles inchangés : agent de contrôle, administrateur, autorité).

| Champ | Type | Contrôle et mise en forme |
|-------|------|---------------------------|
| `mmsi` | texte | 9 chiffres ; espaces, points et tirets retirés |
| `numero_omi` | texte | 7 chiffres ; le préfixe « IMO » ou « OMI » est retiré |
| `indicatif_radio` | texte | 3 à 10 lettres ou chiffres, mis en majuscules |
| `jauge_brute` | nombre | Strictement positif |
| `annee_construction` | entier | De 1900 à l'année en cours |
| `proprietaire` | texte | 255 caractères au plus, sur une ligne, sans caractère invisible ; à renseigner s'il diffère du titulaire de la licence |
| `exploitant` | texte | 255 caractères au plus, sur une ligne, sans caractère invisible ; à renseigner s'il diffère du propriétaire |

Une saisie vide vaut « non renseigné ». Envoyer `null` dans une correction efface la valeur.

```json
{
  "id": "3b282268-0a02-410b-a1ee-f0071de6e197",
  "nom": "Pirogue EX2 96d060ca",
  "immatriculation": "GA-EX2-96d060ca",
  "mmsi": "626799010",
  "numero_omi": "9074729",
  "indicatif_radio": "TRAB7",
  "jauge_brute": 12.5,
  "annee_construction": 2014,
  "proprietaire": "Propriétaire fictif",
  "exploitant": "Exploitant fictif"
}
```

Format refusé : 422, avec le champ en clair.

```json
{"detail": "MMSI : le MMSI compte 9 chiffres", "code": "VALIDATION_ERROR"}
```

**Demande de licence.** `POST /api/v1/demandes-licence` accepte un objet `embarcation_complements` portant les mêmes champs ; `POST /api/v1/demandes-licence/with-files` l'accepte sous la forme d'un champ de formulaire contenant le même objet en JSON. Seuls les champs renseignés sont conservés. À l'approbation, ils sont reportés sur l'embarcation créée.

**Correction d'une demande** (`PATCH /api/v1/demandes-licence/{id}`, rôles inchangés). Dans `embarcation_complements`, seules les informations envoyées changent : une information envoyée vide est retirée, les autres restent en place ; envoyer `null` à la place de l'objet les efface toutes.

```json
{
  "type_demande": "personne_physique",
  "nom": "Fictif",
  "prenom": "Demandeur",
  "email": "demandeur.fictif@example.com",
  "embarcation_nom": "Pirogue fictive",
  "embarcation_complements": {"mmsi": "626123456", "annee_construction": 2012, "proprietaire": "Propriétaire fictif"}
}
```

### 2.3 F. Page de profil

Trois vues d'une même page. Aucune ne contient de champ de coordonnée (téléphone, e-mail, adresse), ni numéro de licence, ni immatriculation. Le texte de présentation est le seul contenu libre : il est contrôlé à la saisie (voir « Modification »).

**Ce que voit tout compte connecté, sans aucune action de l'acteur :** son nom, sa localité (sites d'attache ou ville), les espèces de ses captures déclarées et le nombre de ses embarcations. C'est l'effet de la décision du 2026-11-24 sur la visibilité ; l'acteur peut masquer des espèces, pas fermer sa page aux comptes connectés.

| Méthode et chemin | Rôles | Vue |
|-------------------|-------|-----|
| `GET /api/v1/profils/moi` | pêcheur, organisation | La sienne, avec ses réglages |
| `PATCH /api/v1/profils/moi` | pêcheur, organisation | La sienne, après modification |
| `GET /api/v1/profils/moi/qr` | pêcheur, organisation | QR code du lien public, image SVG |
| `GET /api/v1/profils/pecheurs/{pecheur_id}` | tout compte connecté | Connectée |
| `GET /api/v1/profils/organisations/{organisation_id}` | tout compte connecté | Connectée |
| `GET /api/v1/public/profils/{jeton}` | aucun, sans connexion | Publique |

**Acteur inactif** (décision du 2026-11-24) : pêcheur suspendu ou à la licence expirée, organisation désactivée ; sa page répond 404 `PROFIL_NOT_FOUND` aux comptes connectés comme au public, et reste lisible par l'acteur lui-même (`/profils/moi`).

**Vue publique** (`/public/profils/{jeton}`). Servie seulement si l'acteur a ouvert sa page et s'il est actif (pêcheur non suspendu à la licence en cours, organisation active) ; sinon 404 `PROFIL_NOT_FOUND`, comme pour un jeton inconnu. La réponse porte l'en-tête `Cache-Control: no-store` : une page refermée cesse d'être servie, sans copie gardée par un intermédiaire.

```json
{
  "genre": "pecheur",
  "nom": "EX2 Fictif5c1fff22",
  "localite": "Débarcadère fictif d'Owendo",
  "presentation": "Pêche à la ligne au large d'Owendo (texte fictif).",
  "especes": [{"espece": "mulet", "nom": "Mulet"}, {"espece": "sardine", "nom": "Sardine"}],
  "tarifs_affiches": true,
  "tarifs": [
    {"espece": "sardine", "unite": "kg", "prix_fcfa": 2500, "nom": "Sardine"},
    {"espece": "mulet", "unite": "unite", "prix_fcfa": 1500, "nom": "Mulet"}
  ],
  "mise_a_jour": "2026-11-24T08:26:05Z"
}
```

- `nom` : prénom et nom du pêcheur, ou nom commercial (à défaut, nom) de l'organisation.
- `localite` : sites d'attache des embarcations du pêcheur, ou ville de l'organisation ; jamais une adresse.
- `presentation` : texte brut, de plusieurs lignes possibles (séparées par `\n`). Le portail et l'application l'affichent tel quel, comme du texte, jamais comme du code de page.
- `especes` : de la plus déclarée à la moins déclarée, en volume, sur la fenêtre du paramétrage, arrêtée à l'instant présent ; pour une organisation, celles de tous ses membres. Une espèce protégée ou inconnue du référentiel n'y figure jamais.
- `tarifs` : vide tant que l'acteur ne les affiche pas (`tarifs_affiches` faux). `unite` vaut `kg` (au kilo) ou `unite` (à l'unité). Le tarif d'une espèce masquée, devenue protégée ou sortie du référentiel, ou d'une unité retirée du paramétrage, ne s'affiche pas.
- Référentiel des espèces absent du serveur, ou sans sa liste des espèces protégées : `especes` et `tarifs` sont vides dans les trois vues, plutôt que de tout montrer.

**Vue connectée** : la vue publique, plus `acteur_id`, `organisation` (nom de l'organisation du pêcheur, s'il en a une) et `nb_embarcations`.

**Vue de l'acteur** (`/profils/moi`) : la vue connectée, plus ses réglages.

```json
{
  "genre": "pecheur",
  "nom": "EX2 Fictif5c1fff22",
  "localite": "Débarcadère fictif d'Owendo",
  "presentation": "Pêche à la ligne au large d'Owendo (texte fictif).",
  "especes": [{"espece": "mulet", "nom": "Mulet"}, {"espece": "sardine", "nom": "Sardine"}],
  "tarifs_affiches": true,
  "tarifs": [{"espece": "sardine", "unite": "kg", "prix_fcfa": 2500, "nom": "Sardine"}],
  "mise_a_jour": "2026-11-24T08:26:05Z",
  "acteur_id": "f5e32812-3008-460c-a756-ca4659f14dda",
  "organisation": "Coopérative fictive EX2 c1a7f934",
  "nb_embarcations": 1,
  "especes_declarees": [{"espece": "mulet", "nom": "Mulet"}, {"espece": "sardine", "nom": "Sardine"}],
  "especes_masquees": [],
  "tarifs_visibles": true,
  "mes_tarifs": [{"espece": "sardine", "unite": "kg", "prix_fcfa": 2500, "nom": "Sardine"}],
  "ouvert_au_public": true,
  "lien_public": "https://cbm-pigap-web.vercel.app/profil/2-wfPNH4SbBUP-adYjmJU3yfA1NlRX_K",
  "limites": {"presentation_max_caracteres": 600, "tarifs_max": 30, "prix_max_fcfa": 10000000, "unites_tarif": ["kg", "unite"]},
  "statut_regles": "Proposé"
}
```

- `especes_declarees` : toutes les espèces tirées de ses captures, avant masquage, pour qu'il choisisse ; `especes_masquees` : celles qu'il retire de sa page.
- `mes_tarifs` : ce qu'il a saisi, affiché ou non ; `tarifs_visibles` : son choix d'affichage.
- `lien_public` : vide tant que la page est fermée. Il a la forme `<adresse du portail>/profil/<jeton>` ; la page correspondante reste à créer dans le portail, qui lira `/api/v1/public/profils/<jeton>`.
- `limites` : bornes à appliquer dans le formulaire.

**Modification** (`PATCH /profils/moi`). Seuls les champs envoyés changent.

```json
{
  "presentation": "Pêche à la ligne au large d'Owendo (texte fictif).",
  "especes_masquees": ["mulet"],
  "tarifs": [{"espece": "sardine", "unite": "kg", "prix_fcfa": 2500}],
  "tarifs_visibles": true,
  "ouvert_au_public": true
}
```

`tarifs` remplace toute la liste ; une liste vide retire les tarifs. Une présentation vide l'efface.

Présentation : du texte simple seulement. Sont refusés les caractères invisibles et les marques qui inversent le sens de lecture (422), ainsi que les coordonnées reconnaissables : adresse électronique, adresse de site (`http://`, `https://`, `www.`), suite de plus de six chiffres, espaces, points et tirets ignorés (400 `PRESENTATION_COORDONNEES`). Une année, une date écrite « 12/03/2015 », une quantité ou un prix passent. Le contrôle et son seuil viennent du paramétrage (`presentation_sans_coordonnees`, `presentation_chiffres_max`).

Deux enregistrements simultanés de la même page se suivent : aucun n'échoue, aucun réglage n'est perdu.

| Code | Statut | Sens |
|------|--------|------|
| `PROFIL_NOT_FOUND` | 404 | Acteur ou jeton inconnu, page fermée au public, acteur inactif (suspendu, licence expirée, organisation désactivée), compte sans rattachement |
| `PROFIL_NON_PUBLIC` | 409 | QR code demandé alors que la page est fermée au public |
| `PRESENTATION_TROP_LONGUE` | 400 | Texte au-delà de la longueur du paramétrage |
| `PRESENTATION_COORDONNEES` | 400 | Le texte contient un numéro de téléphone, une adresse électronique ou une adresse de site |
| `ESPECE_INCONNUE` | 400 | Code absent du référentiel |
| `ESPECE_PROTEGEE` | 400 | Tarif demandé pour une espèce protégée |
| `UNITE_INVALIDE` | 400 | Unité absente du paramétrage (`kg` ou `unite` à ce jour) ; le message cite les unités admises |
| `PRIX_INVALIDE` | 400 | Prix au-delà du garde-fou |
| `TARIF_EN_DOUBLE` | 400 | Deux tarifs pour la même espèce et la même unité |
| `TARIFS_TROP_NOMBREUX` | 400 | Plus de tarifs que le paramétrage n'en admet |
| `VALIDATION_ERROR` | 422 | Prix nul, négatif ou non entier ; champ mal typé ; caractère invisible dans la présentation |
| `REFERENTIEL_INDISPONIBLE` | 503 | Espèces à masquer ou tarifs envoyés alors que le référentiel des espèces manque sur le serveur |
| `REGLE_INDISPONIBLE` | 503 | Paramétrage de la page absent ou illisible ; le fichier en cause n'est nommé qu'au journal du serveur |

```json
{"detail": "Unité de tarif inconnue : choisissez « au kilo » ou « à l'unité ».", "code": "UNITE_INVALIDE"}
```

**QR code** (`GET /profils/moi/qr`) : image `image/svg+xml` du lien public, à afficher ou à imprimer telle quelle.

### 2.4 G. Fiche d'identité à deux volets

| Méthode et chemin | Rôles | Périmètre |
|-------------------|-------|-----------|
| `GET /api/v1/identite/moi` | pêcheur | Sa fiche |
| `GET /api/v1/identite/pecheurs/{pecheur_id}` | autorité, agent de contrôle, administrateur, pêcheur, organisation | Toute la flotte pour les trois premiers ; sa fiche pour le pêcheur ; ses membres pour l'organisation |

Hors périmètre ou inexistant : 404 `PECHEUR_NOT_FOUND`, sans distinction. Organisation désactivée : son compte ne lit plus la fiche de ses membres (404). Chercheur : 403. Lecture seule. Une consultation par un tiers écrit une ligne au journal des accès (`ressource = fiche_identite`, `action = consultation`) ; le pêcheur qui lit sa fiche n'en laisse pas.

```json
{
  "pecheur_id": "f5e32812-3008-460c-a756-ca4659f14dda",
  "registre": {
    "identite": {"nom": "Fictif5c1fff22", "prenom": "EX2", "nationalite": "gabonaise", "statut": "actif"},
    "licence": {"numero": "GA-PA-2026-00767", "date_delivrance": "2026-10-25", "date_expiration": "2027-10-25", "statut": "valide", "validite_jours": 365},
    "organisation": {"id": "9f38e5e3-b21c-4ac7-a24f-05d6487977c2", "nom": "Coopérative fictive EX2 c1a7f934", "type": "cooperative"},
    "embarcations": [
      {
        "id": "3b282268-0a02-410b-a1ee-f0071de6e197",
        "nom": "Pirogue EX2 96d060ca",
        "immatriculation": "GA-EX2-96d060ca",
        "type": "pirogue",
        "longueur_m": 9.5,
        "filiere": null,
        "type_pirogue": null,
        "materiau": "bois",
        "puissance_moteur_cv": 40.0,
        "site_attache": "Débarcadère fictif d'Owendo",
        "strate": null,
        "equipements": {"engins": ["filet"]},
        "balise": false,
        "mmsi": "626799010",
        "numero_omi": "9074729",
        "indicatif_radio": "TRAB7",
        "jauge_brute": 12.5,
        "annee_construction": 2014,
        "proprietaire": "Propriétaire fictif",
        "exploitant": "Exploitant fictif"
      }
    ]
  },
  "suivi": {
    "embarcations": [
      {
        "embarcation_id": "3b282268-0a02-410b-a1ee-f0071de6e197",
        "nom": "Pirogue EX2 96d060ca",
        "immatriculation": "GA-EX2-96d060ca",
        "dernier_releve": {"source": "balise", "horodatage": "1998-09-02T18:04:00Z", "age_secondes": 890749325},
        "periode_observee": {"debut": "1998-09-02T17:04:00Z", "fin": "1998-09-02T18:04:00Z"},
        "nb_releves": 4,
        "releves_par_source": {"balise": 1, "mobile": 3}
      }
    ],
    "nb_releves": 4,
    "genere_a": "2026-11-24T08:26:05Z"
  }
}
```

- `licence.statut` : `valide`, `expiree`, `suspendue` ou `sans_date` (date de délivrance inconnue).
- `balise` : vrai si une balise satellitaire est rattachée à l'embarcation ; son numéro de série n'est pas renvoyé.
- `dernier_releve` et `periode_observee` : vides pour une embarcation qui n'a jamais émis. `age_secondes` est calculé à la lecture.
- Aucune position ne figure dans la fiche : la carte et la fiche d'embarcation existante (`/positions/embarcations/{id}/fiche`) restent les seuls accès à la localisation.

### 2.5 Vérification

Commandes, depuis `backend/` :

```bash
.venv/bin/python -m pytest app/tests/test_lot2_inscription.py app/tests/test_lot2_profil.py app/tests/test_lot2_identite.py -q
.venv/bin/python -m pytest
.venv/bin/ruff check app
.venv/bin/black --check app
```

| Partie | Tests |
|--------|-------|
| E, acceptation | `test_l2_e_informations_complementaires_facultatives_et_normalisees`, `test_l2_e_formats_refuses_avec_un_message_clair`, `test_l2_e_demande_de_licence_reporte_les_informations_au_registre` |
| E, migration et règle | `test_l2_e_migration_additive_et_regle_proposee`, `test_l2_e_seuls_les_champs_prevus_sont_reportes_a_l_approbation` |
| E, robustesse de la saisie | `test_l2_e_textes_libres_sans_caractere_invisible`, `test_l2_e_texte_trop_imbrique_refuse_en_clair`, `test_l2_e_messages_de_saisie_en_francais`, `test_l2_e_correction_d_une_demande_garde_les_autres_informations` |
| F, acceptation | `test_l2_f_page_de_profil_especes_tirees_des_captures`, `test_l2_f_tarifs_facultatifs_affiches_si_l_acteur_le_decide`, `test_l2_f_ouverture_au_public_par_lien_et_qr_code`, `test_l2_f_profil_d_une_organisation` |
| F, périmètre et règles | `test_l2_f_roles_et_perimetre`, `test_l2_f_parametrage_du_depot_et_statut_des_regles` |
| F, espèces protégées (échec fermé) | `test_l2_f_sans_referentiel_ni_espece_ni_tarif_ne_s_affiche`, `test_l2_f_tarif_d_une_espece_masquee_ou_d_une_unite_retiree`, `test_l2_f_capture_datee_dans_le_futur_hors_de_la_fenetre` |
| F, acteur inactif | `test_l2_f_page_d_un_acteur_inactif_illisible` |
| F, texte et page publique | `test_l2_f_presentation_en_texte_simple_et_sans_coordonnees`, `test_l2_f_page_publique_non_conservee_et_parametrage_absent`, `test_l2_f_deux_enregistrements_simultanes_de_la_meme_page` |
| G | `test_l2_g_fiche_a_deux_volets_registre_et_suivi` (journal des accès compris), `test_l2_g_cloisonnement_par_role` (organisation désactivée comprise) |

Non codé en dur : les tests modifient le paramétrage (fenêtre des captures, nombre d'espèces, unités, nombre de tarifs, contrôle des coordonnées et son seuil) et constatent le changement de résultat.

Tests vus en échec avant correction : celui du référentiel absent (rejoué sur le comportement d'avant, il affichait l'espèce inconnue) et celui des enregistrements simultanés (violation d'unicité à l'enregistrement).

Résultats : voir la section 2.9.

### 2.6 Limites connues

1. Aucune coordonnée sur la page : un visiteur ne peut pas contacter l'acteur depuis sa vitrine. La mise en relation relève du lot 7.
2. Le texte de présentation est libre et n'est pas relu par une personne ; aucun rôle ne peut fermer la page publique d'un tiers, hors suspension du pêcheur ou désactivation de l'organisation. Le contrôle des coordonnées réduit le risque sans le supprimer : un numéro écrit en toutes lettres, un identifiant de messagerie ou une adresse de site sans « www » ni « http » passent ; à l'inverse, plusieurs nombres séparés seulement par des espaces, des points ou des tirets (une période « 1998-2005 », un prix écrit « 1 500 000 ») peuvent être refusés à tort ; le message dit quoi retirer, et le seuil se règle dans le paramétrage.
3. La route publique n'a pas de limitation de débit, comme les autres routes publiques de l'API ; son jeton, tiré au hasard, ne se devine pas.
4. Les espèces viennent des captures : une page reste sans espèce tant que rien n'est déclaré.
5. Le MMSI et le numéro OMI ne sont pas rapprochés des données d'un éditeur tiers ; aucune unicité n'est imposée.
6. Le lien public pointe vers une page du portail qui n'existe pas encore.
7. Une licence sans date de délivrance connue n'est pas tenue pour expirée : la page de ce pêcheur reste lisible tant que le registre n'est pas complété.
8. Une espèce qu'un pêcheur masque sur sa page reste visible sur la page de son organisation, qui réunit les espèces de tous ses membres.
9. Les autres textes libres de l'API (nom, prénom, message d'une demande de licence, par exemple) ne passent pas par le contrôle des caractères invisibles : un caractère nul y provoque encore une erreur du serveur. Seuls les champs de ce lot sont protégés.
10. Un paramétrage tenu hors du dépôt (`PIGAP_REGLES_DIR`) doit porter les deux nouveaux paramètres de la présentation, faute de quoi la page répond 503 `REGLE_INDISPONIBLE`.

### 2.7 Dettes

| Dette | Pourquoi plus tard |
|-------|--------------------|
| Annuaire ou recherche des pages de profil | Non demandé ; à cadrer avec le lot 7 |
| Coordonnée affichable sur accord de l'acteur | Règle « Proposé », à trancher par le porteur |
| Modération d'une page et renouvellement du lien public | À décider avec l'ouverture au public |
| Exigence des informations d'inscription selon la catégorie (pirogue, navire) | Règle « Proposé », à fixer par la DGPA |
| Page du portail `/profil/<jeton>` | Partie portail du lot 2 |
| Bornes de saisie écrites dans le code : jauge d'au plus 500 000, année à partir de 1900, indicatif de 3 à 10 caractères | Garde-fous de format, sans portée métier ; à porter au paramétrage si la DGPA fixe des bornes |
| Contrôle des caractères invisibles sur tous les textes libres de l'API | Hors lot : à traiter une fois pour toute l'API |
| Limitation de débit des routes publiques | Commune à toute l'API, à traiter avec l'hébergement |

### 2.8 Suite, avec critères d'acceptation

1. **Portail :** formulaire d'inscription complété des sept informations ; fiche d'identité en deux colonnes (registre, suivi) ; page de profil et son réglage par l'acteur ; page publique `/profil/<jeton>`. Accepté si la page publique n'affiche que ce que renvoie `/public/profils/<jeton>` et si la présentation y est rendue comme du texte, sans qu'aucune balise soit interprétée.
2. **Application :** « ma fiche » (`/identite/moi`) et « ma page » (`/profils/moi`) pour le pêcheur ; affichage du QR code.
3. **Règles :** validation des règles « Proposé » de la section 1.3 par le porteur et la DGPA, puis passage du statut à « Validé » dans le fichier.

### 2.9 Résultats de la vérification

| Contrôle | Résultat |
|----------|----------|
| Tests du lot (`test_lot2_inscription.py`, `test_lot2_profil.py`, `test_lot2_identite.py`) | 24 passés (9, 13 et 2), après les décisions du porteur |
| Suite complète (`.venv/bin/python -m pytest`), dernier passage, après les corrections de la revue | 235 passés, 5 échoués, tous étrangers au lot |
| `ruff check app`, `black --check app` | 14 erreurs et 11 fichiers à reformater, à l'identique du dernier commit ; aucun fichier du lot |
| Migration | Appliquée à la base de développement (`a9c3e4f5b627`) ; SQL hors ligne généré sans erreur |
| Revue indépendante de sécurité | Faite : un bloquant et dix points secondaires, traités (section 2.9.1) |

Les cinq échecs du dernier passage appartiennent à un même ensemble de huit tests anciens, permanents ou instables, tous reproduits sur un export du dernier commit, sans aucune modification : `test_m6_dashboard` (alertes actives), `test_paiement_msisdn` (deux tests, numéro de téléphone fixe déjà en base) et `test_predictions` (deux tests) échouent à chaque passage ; `test_m7_alertes` (zone interdite), `test_redevances` (indicateurs d'effort) et `test_dashboard_series` (semaine unique) ne tombent pas à chaque passage et sont passés cette fois. Cause commune : les tests écrivent dans la base de développement sans purge, et chaque passage de la suite aggrave l'état (embarcations : 1 814 au début de la session, plus de 2 600 à la fin ; alertes : 12 444, puis plus de 21 000).

Non vérifié : rendu du texte de présentation par le portail et par l'application (ils doivent l'afficher comme du texte) ; comportement sous charge ; relecture des corrections par un second regard (elles sont protégées par des tests, deux d'entre eux vus en échec avant correction).

#### 2.9.1 Revue indépendante : ce qu'elle a trouvé et ce qui a été fait

| Constat | Gravité | Suite donnée |
|---------|---------|--------------|
| Référentiel des espèces absent du serveur : toutes les espèces s'affichaient, protégées comprises | Bloquant | Corrigé : espèce non reconnue jamais affichée, ni espèce ni tarif sans référentiel ; test vu en échec avant |
| Deux enregistrements simultanés d'une page jamais réglée : erreur du serveur | Secondaire | Corrigé : verrou sur l'acteur ; test vu en échec avant |
| Caractère nul ou invisible dans la présentation, le propriétaire, l'exploitant : erreur du serveur, y compris sans connexion par la demande de licence | Secondaire | Corrigé : refus en clair (422) |
| Le texte de présentation peut porter une coordonnée, contrairement à ce qu'affirmait le code | Secondaire | Contrôle à la saisie, au statut « Proposé » ; commentaires rectifiés ; limite écrite |
| Tarif d'une espèce masquée, devenue protégée ou sortie du référentiel encore affiché | Secondaire | Corrigé : relu à chaque affichage |
| Organisation désactivée lisant encore la fiche d'identité de ses membres | Secondaire | Corrigé, au statut « Proposé » |
| Correction d'une demande : les informations non renvoyées étaient perdues | Secondaire | Corrigé : fusion champ par champ |
| Formulaire avec pièces : texte très imbriqué pouvant faire déborder le décodeur | Secondaire | Corrigé pour les deux champs du formulaire |
| Messages de saisie en anglais pour certains types d'erreur ; nom du fichier de paramétrage donné au public | Secondaire | Corrigé pour toute l'API |
| Page publique conservable par un intermédiaire ; capture datée dans le futur comptée | Secondaire | Corrigé : `Cache-Control: no-store`, fenêtre arrêtée à l'instant présent |
| Acteur suspendu encore visible des comptes connectés ; licence expirée sans effet | À décider | Tranché par le porteur le 2026-11-24 : page fermée ; corrigé et testé |
| Espèce masquée d'un membre visible chez son organisation | À décider | Laissé en l'état, écrit en limite 8 |

### 2.10 Texte proposé pour le journal

```
## [2026-11-24] : Lot 2, partie serveur : fiche d'identité et page de profil

**Ce qui a été construit :**
- Informations d'inscription complémentaires de l'embarcation, toutes facultatives : MMSI, numéro OMI, indicatif radio, jauge, année de construction, propriétaire, exploitant ; saisies au registre comme à la demande de licence ; migration additive `a9c3e4f5b627`
- Page de profil d'un acteur (`/api/v1/profils`) : présentation courte, espèces tirées des captures déclarées, tarifs facultatifs au kilo ou à l'unité, ouverture au public par lien et QR code, désactivée au départ
- Fiche d'identité à deux volets (`/api/v1/identite`) : registre (identité, licence, organisation, embarcations) et suivi (source et âge du dernier relevé, période observée, nombre de relevés)
- Paramétrage versionné `backend/app/data/regles/profil_acteur.json`

**Pourquoi :** compléments 10 et 11 du porteur (chantier de novembre 2026) et décisions du 2026-11-24 sur la visibilité de la page et les tarifs.

**Principes :** aucun champ de coordonnée sur la page, dans aucune vue, et présentation contrôlée à la saisie ; espèce protégée ou non reconnue jamais affichée, échec fermé sans référentiel ; lien public tiré au hasard ; fiche d'identité cloisonnée par rôle, 404 hors périmètre, consultation par un tiers inscrite au journal des accès ; règles non décidées marquées « Proposé ».

**Revue indépendante :** un bloquant (espèces protégées affichées si le référentiel manquait sur le serveur) et dix points secondaires, corrigés et protégés par des tests.

**Tests réalisés :** 24 tests nommés (acceptation, périmètre par rôle, paramétrage, échec fermé, saisie) ; suite complète : 235 passés, 5 échecs anciens sans lien avec le lot.

**Décisions du porteur (2026-11-24) :** contrôle des coordonnées dans la présentation et son seuil validés ; page d'un acteur suspendu, désactivé ou à la licence expirée fermée aux comptes connectés comme au public.

**Points ouverts :** règles « Proposé » restantes à valider (espèces, vitrine publique, informations d'inscription, avec la DGPA) ; coordonnée affichable et modération à décider ; partie portail à suivre.
```

### 2.11 Résumé

1. Présent en code, non commité : sept informations d'inscription facultatives sur l'embarcation, page de profil (présentation, espèces, tarifs, lien public et QR code), fiche d'identité à deux volets.
2. Revue indépendante faite : un bloquant (espèces protégées affichées si le référentiel manquait) et dix points secondaires, tous corrigés ; 24 tests nommés verts.
3. Suite complète : 235 passés, 5 échecs anciens sans lien avec le lot ; lint identique au dernier commit ; migration additive appliquée à la base de développement seulement.
4. Non vérifié : affichage de la présentation comme du texte par le portail et l'application ; charge.
5. Point d'attention : tout compte connecté lit le nom, la localité et les espèces de tout pêcheur, même s'il n'a rien réglé (décision du 2026-11-24 sur la visibilité).
6. Décidé par le porteur le 2026-11-24 : nouvelles règles validées (contrôle des coordonnées et son seuil, référentiel indisponible, tarif d'une espèce masquée, organisation désactivée) ; page d'un acteur suspendu, désactivé ou à la licence expirée fermée à tous sauf à lui-même. Appliqué et testé.
7. Reste à décider : règles « Proposé » des espèces, de la vitrine publique et des informations d'inscription (avec la DGPA) ; coordonnée affichable ; modération d'une page.
