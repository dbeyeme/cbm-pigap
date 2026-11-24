# Lot 10, partie serveur : un appareil, un seul compte pêcheur

- **Statut :** compte rendu interne, projet soumis à validation humaine
- **Date :** 2026-11-24
- **Auteur :** session serveur (agent), pour Christian BEYEME
- **État :** présent en code dans `backend/`, non commité, non déployé ; migration appliquée à la base de développement seulement
- **Liens :** [ADR-012](adr/ADR-012-un-appareil-un-pecheur.md), [chantier de novembre 2026](chantier-evolutions-2026-11.md), [ADR-009](adr/ADR-009-suivi-temps-reel-sources-position.md)

## 1. Compréhension

### 1.1 Problème

Demande du porteur du 2026-11-24 : un téléphone ne doit pas accueillir plusieurs sessions de pêcheurs, pour éviter les conflits de suivi GPS et les tricheries entre pêcheurs.

Avant ce lot, le serveur vérifiait qu'un pêcheur n'envoie des positions que pour ses embarcations, mais il ne connaissait ni l'appareil qui se connecte ni celui qui envoie. Un même téléphone pouvait donc se connecter tour à tour à plusieurs comptes et « suivre » pour chacun.

### 1.2 Ce que le lot apporte, et ce qu'il n'apporte pas

| Apporte | N'apporte pas |
|---------|---------------|
| Un appareil rattaché à un seul compte pêcheur, vérifié à la connexion | Une preuve que le téléphone est à bord : il peut rester à terre ou être confié à quelqu'un |
| Un compte rattaché à un seul appareil, sauf autorisation d'un agent | Une protection contre une application modifiée : l'identifiant est déclaré par le téléphone |
| Une embarcation suivie par un seul appareil à la fois | Un contrôle des captures, ni des positions saisies par un agent |
| La référence de l'appareil sur chaque position | Un effet sur l'ancienne application tant que l'en-tête n'est pas obligatoire |

### 1.3 Choix retenus et choix écartés

| Sujet | Retenu | Écarté, et pourquoi |
|-------|--------|---------------------|
| Identifiant conservé | Empreinte HMAC-SHA256 calculée avec un secret du serveur | La valeur brute, ou un simple condensé : l'identifiant d'un téléphone est une donnée personnelle, et un condensé sans secret se recalcule |
| Secret de l'empreinte | `APPAREIL_SECRET` ; à défaut, le secret de signature des sessions | Un secret obligatoire dès maintenant : il bloquerait les essais tant que la variable n'est pas posée |
| Unicité | Un seul rattachement actif par empreinte, garanti par un index unique partiel en base | Un contrôle applicatif seul, que deux connexions simultanées pourraient contourner |
| Libération | L'ancien rattachement est conservé à l'état « libéré » avec auteur, date et motif | Une suppression, qui effacerait la trace |
| Fenêtre d'exclusivité | Avant et après chaque relevé, sur les dates des relevés | La date de réception : les relevés pris hors ligne arrivent en retard |
| Lot de positions | Refusé en entier si un seul relevé est en conflit | Un tri relevé par relevé : le reste de l'API traite déjà un lot comme un tout |
| Alerte | Type existant `anomalie`, règle `suivi_double_appareil`, déclencheur explicite | Un nouveau type : le modèle des alertes sera revu dans un lot à part |
| Appareil supplémentaire | Un de plus à chaque autorisation, jusqu'à un plafond | Un nombre libre : le plafond borne l'effet d'une erreur de saisie |

### 1.4 Règles et statut

| Règle | Statut | Valideurs |
|-------|--------|-----------|
| R1. Un appareil n'accepte qu'un seul compte pêcheur | Décidée le 2026-11-24 | Christian |
| R2. Un compte pêcheur n'est rattaché qu'à un appareil ; un appareil supplémentaire s'obtient sur autorisation d'un agent ou d'un administrateur | Proposé | Christian, DGPA |
| R3. Une embarcation n'est suivie que par un appareil à la fois ; un second appareil qui émet pour elle dans la fenêtre d'exclusivité est refusé et signalé | Proposé | Christian, expert halieutique |
| R4. Le changement de téléphone passe par une libération faite par un agent ou un administrateur, avec motif, auteur et date conservés | Proposé | Christian |
| R5. L'identifiant de l'appareil n'est conservé que sous forme d'empreinte non réversible ; le pêcheur en est informé à la première connexion | Proposé | Christian |
| R6. Les comptes d'agents ne sont pas concernés | Proposé | Christian |

Paramètres, dans `backend/app/data/regles/appareils.json` (relu dès qu'il change, aucune valeur de repli dans le code) :

| Paramètre | Valeur | Statut |
|-----------|--------|--------|
| `fenetre_exclusivite_minutes` | 30 | Proposé (Christian, expert halieutique) |
| `appareils_par_defaut` | 1 | Proposé (Christian, DGPA) |
| `appareils_max` | 3 | Proposé par ce lot, à fixer par la DGPA |
| `entete_obligatoire` | faux | Désactivée au départ (transition) |

### 1.5 Hypothèses à tester

1. L'identifiant Android reste stable d'une mise à jour de l'application à l'autre : il dépend de la clé de signature, qui doit être définitive avant la mise en service (dette de l'ADR-012).
2. Trente minutes suffisent à distinguer un relais légitime entre deux téléphones d'un suivi double : à observer pendant le pilote.
3. Les agents ont le temps de traiter les demandes de libération : aucun volume n'est connu.

## 2. Exécution

### 2.1 Ce qui est présent en code

| Fichier | Rôle |
|---------|------|
| `backend/app/db/models.py`, `backend/app/db/enums.py` | Table `appareils`, état `actif` ou `libere`, `positions.appareil_id`, `pecheurs.appareils_autorises` |
| `backend/alembic/versions/f8b2d3e4a516_appareils_un_pecheur.py` | Migration additive, sans effet sur l'existant, rejouable sur une base créée par les tests |
| `backend/app/data/regles/appareils.json` | Paramètres et statut des règles R1 à R6 |
| `backend/app/modules/appareils/` | Règles typées, service (empreinte, rattachement, exclusivité, libération, autorisation), schémas, routes, README |
| `backend/app/api/v1/auth.py` | Connexion : lecture de l'en-tête pour le rôle pêcheur |
| `backend/app/modules/geolocalisation/router.py`, `service.py` | Envoi de positions, unitaire et par lot : contrôle de l'appareil, référence enregistrée |
| `backend/app/modules/alertes/service.py` | `signaler_suivi_double` : création d'une alerte du type existant, modèle inchangé |
| `backend/app/core/config.py`, `.env.example` | Réglage `APPAREIL_SECRET` (nom seulement dans l'exemple) |
| `backend/app/tests/test_lot10_appareils.py` | 19 tests |

Migration : la base de développement est passée de la révision `e7a1c2d3f405` à `f8b2d3e4a516`. Elle n'ajoute que des colonnes facultatives et une table ; le serveur de prévisualisation déjà lancé continue de fonctionner, et devra être relancé pour servir les nouvelles routes. Retour arrière : `alembic downgrade e7a1c2d3f405`.

### 2.2 Contrat pour l'application

**En-tête.** `X-Appareil-Id`, envoyé à la connexion et à l'envoi des positions. Valeur de 16 à 128 caractères : `android:` suivi de l'identifiant Android de l'appareil ou, à défaut, `install:` suivi d'un identifiant d'installation. Caractères admis après le préfixe : lettres, chiffres, point, tiret, tiret bas, deux-points. Le serveur ne conserve que l'empreinte.

**Connexion : `POST /api/v1/auth/login`** (corps inchangé). Le contrôle n'a lieu qu'après vérification des identifiants, et seulement pour le rôle pêcheur.

| Situation | Statut | Code |
|-----------|--------|------|
| Appareil inconnu, compte sans appareil | 200 | rattachement créé |
| Appareil déjà rattaché à ce compte | 200 | |
| Appareil rattaché à un autre compte pêcheur | 409 | `APPAREIL_DEJA_RATTACHE` |
| Compte déjà rattaché au nombre d'appareils permis | 409 | `COMPTE_RATTACHE_AUTRE_APPAREIL` |
| En-tête mal formé | 400 | `APPAREIL_ID_INVALIDE` |
| Sans en-tête, obligation désactivée | 200 | connexion consignée dans les journaux du serveur |
| Sans en-tête, obligation activée | 403 | `APPAREIL_REQUIS` |
| Identifiants faux | 400 | `INVALID_CREDENTIALS` (inchangé, aucun rattachement) |

Connexion acceptée : la réponse dit si le serveur a rattaché ou reconnu l'appareil.

```json
{"access_token": "<jeton de session>", "token_type": "bearer", "appareil_rattache": true}
```

`appareil_rattache` vaut vrai quand l'appareil vient d'être rattaché à ce compte ou lui était déjà rattaché ; faux sans en-tête et pour les autres rôles. Le serveur fait foi : après une libération faite par un agent, c'est ce champ qui autorise l'application à aligner sa garde locale sur le nouveau compte (demande S4 de la session mobile).

```json
{"detail": "Cet appareil est déjà rattaché à un autre compte de pêcheur. Un agent de contrôle peut le libérer.", "code": "APPAREIL_DEJA_RATTACHE"}
```

```json
{"detail": "Ce compte est déjà rattaché à un autre appareil. Un agent de contrôle peut libérer l'ancien appareil ou en autoriser un autre.", "code": "COMPTE_RATTACHE_AUTRE_APPAREIL"}
```

Un refus ne délivre aucun jeton de session et laisse une ligne au journal des accès (`ressource = appareils`, `action = connexion_refusee`), avec le début de l'empreinte seulement.

**Envoi de positions : `POST /api/v1/positions` et `POST /api/v1/positions/batch`** (corps inchangés), pour le rôle pêcheur.

| Situation | Statut | Code |
|-----------|--------|------|
| Appareil rattaché au compte | 201 | la position garde la référence de l'appareil |
| Appareil non rattaché au compte (inconnu, libéré, ou rattaché à un autre compte) | 403 | `APPAREIL_NON_RATTACHE` |
| Un autre appareil suit déjà l'embarcation dans la fenêtre d'exclusivité | 409 | `SUIVI_DEJA_ASSURE`, et une alerte |
| Sans en-tête, obligation désactivée | 201 | position enregistrée sans référence d'appareil |
| Sans en-tête, obligation activée | 403 | `APPAREIL_REQUIS` |

```json
{"detail": "Cet appareil n'est pas rattaché à votre compte : reconnectez-vous depuis l'application.", "code": "APPAREIL_NON_RATTACHE"}
```

```json
{"detail": "Cette embarcation est déjà suivie par un autre appareil. Un seul appareil à la fois peut en assurer le suivi.", "code": "SUIVI_DEJA_ASSURE"}
```

À retenir pour l'application :

- sur `APPAREIL_NON_RATTACHE`, faire repasser le pêcheur par la connexion : c'est elle qui rattache. Le cas se produit notamment quand une session ouverte avant la mise à jour envoie l'en-tête pour la première fois ;
- `SUIVI_DEJA_ASSURE` vaut pour le lot envoyé, refusé en entier dès qu'un de ses relevés tombe dans la fenêtre d'un autre appareil encore rattaché (demande S6 de la session mobile). La cause est la fenêtre, pas le bateau : des relevés pris plus de 30 minutes avant ou après ceux de l'autre appareil seraient acceptés dans un autre envoi. Les relevés d'un appareil libéré ne comptent plus ;
- les codes d'erreur sont toujours dans le champ `code` du corps (demande S5) ;
- la fenêtre porte sur la date des relevés, pas sur leur date d'envoi : des relevés pris hors ligne puis envoyés plus tard sont contrôlés de la même façon ;
- les messages ne disent jamais à qui un appareil est rattaché ;
- les autres rôles ne sont pas concernés, même s'ils envoient l'en-tête ; l'ingestion des balises non plus. Un agent peut donc encore enregistrer une position isolée, sans appareil (demande S8 : à trancher par le porteur) ;
- une connexion envoyée deux fois de suite depuis le même téléphone aboutit les deux fois.

### 2.3 Contrat pour le portail

Rôles : agent de contrôle et administrateur. Tout autre rôle, pêcheur et autorité compris : 403. Pêcheur inexistant : 404. Appareil inexistant ou rattaché à un autre pêcheur : 404, sans distinction.

**`GET /api/v1/pecheurs/{pecheur_id}/appareils`**

```json
{
  "pecheur_id": "9cf7a685-3905-4bd8-9c68-78ed7603ec23",
  "appareils_autorises": 2,
  "appareils_actifs": 2,
  "appareils": [
    {
      "id": "ed5822b0-400a-44d6-8dad-d404dbd79cab",
      "empreinte_abregee": "e7fff2c1",
      "origine": "android",
      "etat": "actif",
      "premiere_utilisation": "2026-11-24T07:39:42Z",
      "derniere_utilisation": "2026-11-24T07:39:42Z",
      "libere_le": null,
      "libere_par_id": null,
      "libere_par": null,
      "motif_liberation": null
    }
  ]
}
```

`empreinte_abregee` : huit premiers caractères de l'empreinte, pour distinguer deux appareils à l'écran. `origine` : `android` (identifiant de l'appareil) ou `install` (identifiant d'installation, moins stable). `derniere_utilisation` : dernière connexion ou dernier envoi de positions. La liste garde les appareils libérés, du plus récent au plus ancien.

**`POST /api/v1/pecheurs/{pecheur_id}/appareils/{appareil_id}/liberation`**

Corps : `{"motif": "Téléphone perdu en mer"}` (5 à 500 caractères, obligatoire). Réponse : la même liste, l'appareil passé à `libere` avec `libere_le`, `libere_par_id`, `libere_par` (nom de l'agent) et `motif_liberation`.

| Situation | Statut | Code |
|-----------|--------|------|
| Appareil actif du pêcheur | 200 | |
| Motif absent ou trop court | 422 | `VALIDATION_ERROR` |
| Appareil déjà libéré | 409 | `APPAREIL_DEJA_LIBERE` |
| Appareil inexistant ou d'un autre pêcheur | 404 | `APPAREIL_NOT_FOUND` |

Effet : le compte peut rattacher un autre téléphone à sa prochaine connexion, et l'appareil libéré peut être rattaché à un autre compte.

**`POST /api/v1/pecheurs/{pecheur_id}/appareils/autorisation`**

Corps : `{"motif": "Arme une seconde embarcation"}`. Réponse : la même liste, `appareils_autorises` augmenté de un. Au plafond du paramétrage : 409 `APPAREILS_PLAFOND_ATTEINT`.

Libération et autorisation écrivent chacune une ligne au journal des accès (`ressource = appareils`, `action = liberation` ou `autorisation`), avec l'agent, le pêcheur et le motif.

### 2.4 L'alerte de suivi double

Créée quand une position est refusée avec `SUIVI_DEJA_ASSURE`. Une alerte par embarcation et par appareil refusé sur 12 heures.

```json
{
  "type": "anomalie",
  "niveau_gravite": "attention",
  "embarcation_id": "7a47b722-fa47-4925-950c-4da5149f273a",
  "statut": "nouvelle",
  "declencheur": {
    "regle": "suivi_double_appareil",
    "embarcation_id": "7a47b722-fa47-4925-950c-4da5149f273a",
    "appareil_refuse": "e7fff2c1",
    "appareil_en_place": "7a935345",
    "fenetre_minutes": 30.0,
    "releve_refuse": "1996-10-30T10:05:00+00:00",
    "releve_en_place": "1996-10-30T09:55:00+00:00",
    "message": "Un second appareil a tenté d'émettre des positions pour cette embarcation alors qu'un autre appareil en assurait déjà le suivi."
  }
}
```

Les appareils n'y figurent que par le début de leur empreinte.

### 2.5 Vérification

Commandes, depuis `backend/` :

```bash
.venv/bin/python -m pytest app/tests/test_lot10_appareils.py -q
.venv/bin/python -m pytest
.venv/bin/ruff check app
.venv/bin/black --check app
```

| Exigence | Tests |
|----------|-------|
| Tableau de l'ADR, connexion, ligne 1 | `test_l10_b_appareil_inconnu_compte_sans_appareil_rattachement_cree` |
| Ligne 2 | `test_l10_b_appareil_deja_rattache_a_ce_compte` |
| Ligne 3, et message qui ne révèle pas le titulaire | `test_l10_b_appareil_rattache_a_un_autre_compte_refuse` |
| Ligne 4, et autorisation d'un second appareil | `test_l10_b_compte_rattache_a_un_autre_appareil_refuse` |
| Transition sans en-tête, autres rôles, obligation | `test_l10_b_sans_entete_et_autres_roles_inchanges` |
| En-tête mal formé, identifiants faux | `test_l10_b_identifiant_mal_forme_ou_mot_de_passe_faux` |
| Positions : 403, unitaire et par lot | `test_l10_c_envoi_depuis_un_appareil_non_rattache_refuse` |
| Positions : référence de l'appareil | `test_l10_c_reference_de_l_appareil_sur_chaque_position` |
| Positions : 409 et alerte | `test_l10_c_suivi_deja_assure_par_un_autre_appareil_refuse_et_signale` |
| Non codé en dur : la fenêtre change le résultat | `test_l10_c_fenetre_d_exclusivite_parametree` |
| Balises non concernées | `test_l10_c_balises_non_concernees` |
| Agents : liste, libération, autorisation, journal | `test_l10_d_liste_liberation_et_autorisation` |
| Périmètre par rôle, 404 hors périmètre | `test_l10_d_roles_et_perimetre` |
| Aucune valeur brute stockée | `test_l10_a_aucun_identifiant_brut_stocke` |
| Paramétrage versionné, statut des règles | `test_l10_e_parametrage_du_depot_et_statut_des_regles` |
| Échec fermé sans paramétrage | `test_l10_e_parametrage_absent_echec_ferme` |

Résultats : voir la section 2.11.

### 2.6 Limites connues

1. L'identifiant est déclaré par le téléphone : une application modifiée peut en présenter un autre. La règle écarte le changement de compte sur un même téléphone, pas un fraudeur outillé.
2. Tant que `entete_obligatoire` est faux, une ancienne application sans en-tête se connecte et envoie des positions comme avant : la règle ne mord que sur la nouvelle application.
3. L'exclusivité ne compare que les positions qui portent une référence d'appareil : les positions de l'ancienne application, des balises et des agents n'entrent pas dans la comparaison.
4. Un appareil libéré se rattache de nouveau à la première connexion réussie depuis ce téléphone, si le compte a une place libre.
5. Changer de secret d'empreinte rend tous les appareils inconnus : chaque compte déjà rattaché serait alors refusé jusqu'à libération.
6. Les captures et les autres requêtes ne sont pas contrôlées par appareil.

### 2.7 Dettes

| Dette | Pourquoi plus tard |
|-------|--------------------|
| Fixer `APPAREIL_SECRET` et la clé de signature de l'application | Préalables à la mise en service, décisions du porteur |
| Réduire le nombre d'appareils autorisés, liste des appareils visible du pêcheur | Non demandé dans ce lot |
| Durée de conservation des empreintes, texte d'information du pêcheur | Règle R5, à rédiger avec le porteur |
| Trace des connexions sans en-tête en base | Aujourd'hui dans les journaux du serveur seulement |
| Auteur et motif d'une autorisation dans une table propre | Aujourd'hui au journal des accès |

### 2.8 Suite, avec critères d'acceptation

1. **Application (lot 3) :** envoi de l'en-tête à la connexion et aux positions ; messages pour les quatre codes de refus ; retour à la connexion sur `APPAREIL_NON_RATTACHE`. Accepté si un second compte ne peut pas se connecter sur un téléphone déjà rattaché.
2. **Portail (avec le lot 2) :** liste des appareils dans la fiche du pêcheur, libération et autorisation avec saisie du motif. Accepté si un agent libère un appareil et que le pêcheur se connecte ensuite depuis un nouveau téléphone.
3. **Mise en service :** secret et clé de signature fixés, puis `entete_obligatoire` à vrai après diffusion de la nouvelle application.

### 2.9 Décisions qui reviennent au porteur

1. Valider les règles R2 à R6 et les valeurs proposées (fenêtre de 30 minutes, plafond de 3 appareils).
2. Poser `APPAREIL_SECRET` avant la mise en service, une fois pour toutes.
3. Trancher avant d'activer `entete_obligatoire` : avec l'obligation, un pêcheur ne peut plus se connecter au portail depuis un navigateur, qui n'a pas d'identifiant d'appareil. Soit l'obligation ne porte que sur l'envoi de positions, soit le navigateur compte comme un appareil à autoriser.
4. Fixer la durée de conservation des empreintes et le texte d'information du pêcheur.

### 2.10 Correctif hors lot : flotte tronquée à 2 000 embarcations

**Constat.** La régression du lot a fait échouer un test jusque-là vert, `test_presence_ports.py::test_presence_a_quai_en_mer_et_declaration`. Diagnostic : la fonction `list_embarcations_for_user` (suivi GPS, module M2) limitait la flotte des rôles de pilotage aux 2 000 premières embarcations par ordre alphabétique. La base de développement venait de passer ce nombre : 2 299 embarcations, contre 1 814 au début de la session, dont 255 créées par les tests et les exemples des lots 5 et 10, le reste par la suite existante à chaque passage.

**Effet, au-delà du test.** 299 embarcations sortaient sans message du suivi en direct, de la présence au port et de la fiche (404). Parmi elles, trois pirogues de démonstration : Mondah, Ogooué et Mayumba.

**Correction.** Le plafond est retiré : un rôle de pilotage voit toute la flotte. Règle anti-régression : `test_regression_flotte_complete.py::test_regression_flotte_non_tronquee_par_ordre_alphabetique`, vu en échec avant la correction, vert après.

**À faire par la session principale.** Relancer le serveur de prévisualisation (port 8000) : il tourne encore avec l'ancien code, donc avec le plafond.

**Cause de fond, non traitée.** Les tests écrivent dans la base de développement sans purge. Aucune donnée n'a été supprimée ni modifiée par ce correctif. D'autres plafonds silencieux existent dans le code, par exemple la liste des pêcheurs limitée à 200 (`pecheurs/service.py`, `list_pecheurs`) : non traités.

**Leçon proposée pour `docs/LECONS.md` :** un plafond de sécurité sur une liste de périmètre ne doit jamais tronquer en silence ; il doit paginer ou refuser. Et des tests qui écrivent dans la base de développement finissent par changer le comportement de l'outil de travail.

### 2.11 Résultats de la vérification

| Contrôle | Résultat |
|----------|----------|
| Tests du lot (`test_lot10_appareils.py`) | 19 passés, trois passages de suite, après les corrections de la revue |
| Règle anti-régression (`test_regression_flotte_complete.py`) | 1 passé ; en échec avant la correction du plafond |
| Suite complète, dernier passage, après les corrections des revues des trois lots | 235 passés, 5 échoués, tous étrangers au lot |
| `ruff check app`, `black --check app` | À l'identique du dernier commit ; fichiers du lot conformes |
| Migration | Appliquée à la base de développement ; SQL hors ligne généré sans erreur |
| Revue indépendante de sécurité | Faite : deux bloquants, corrigés |

Les cinq échecs du dernier passage appartiennent à un même ensemble de huit tests anciens, permanents ou instables, tous reproduits sur un export du dernier commit, sans aucune modification : `test_m6_dashboard` (alertes actives), `test_paiement_msisdn` (deux tests, numéro de téléphone fixe déjà en base) et `test_predictions` (deux tests) échouent à chaque passage ; `test_m7_alertes` (zone interdite), `test_redevances` (indicateurs d'effort) et `test_dashboard_series` (semaine unique) ne tombent pas à chaque passage et sont passés cette fois. Cause commune : les tests écrivent dans la base de développement sans purge, et chaque passage de la suite aggrave l'état (embarcations : 1 814 au début de la session, plus de 2 600 à la fin ; alertes : 12 444, puis plus de 21 000).

Corrections apportées après la revue. Bloquants : verrou du compte à la connexion (deux téléphones connectés au même instant ne passent plus tous les deux ; une demande envoyée deux fois aboutit) ; les relevés d'un appareil libéré ne bloquent plus son successeur. Autres : verrou par embarcation à l'envoi ; date sans fuseau lue comme à l'enregistrement ; envoi sans en-tête consigné ; descente de migration valable sur une base créée par les tests. Tests ajoutés : `test_l10_b_connexions_simultanees`, `test_l10_c_appareil_libere_ne_bloque_pas_son_successeur`, `test_l10_c_date_sans_fuseau_acceptee`.

Restent de la revue, non traités : date de relevé non bornée (un téléphone dont l'horloge avance de plus de 30 minutes échappe à la fenêtre) ; l'identifiant Android est propre à chaque profil d'utilisateur du téléphone, ce qui reste à vérifier sur appareil ; les agents, administrateurs, autorités et chercheurs peuvent enregistrer une position pour toute embarcation, sans appareil ; retrait d'une autorisation ; gravité de l'alerte dans le code ; toute la flotte chargée à chaque appel depuis le retrait du plafond.

Signalés hors lot, non traités : `PATCH /auth/me/telephone` et trois écritures de `utilisateurs/service.py` ne valident pas leur transaction (hors tests, rien ne serait enregistré) ; la connexion répond 500 quand l'e-mail et le téléphone saisis appartiennent à deux comptes.

Effets des tests sur la base de développement : comptes, embarcations et positions fictifs datés entre 1990 et 2014 ; les alertes de suivi double créées par les tests sont classées « traitée » en fin de test.

### 2.12 Texte proposé pour le journal

```
## [2026-11-24] : Lot 10, partie serveur : un appareil, un seul compte pêcheur (ADR-012)

**Ce qui a été construit :**
- Table `appareils` (empreinte seule, compte rattaché, première et dernière utilisation, état actif ou libéré, auteur, date et motif de la libération), `positions.appareil_id`, `pecheurs.appareils_autorises` ; migration additive `f8b2d3e4a516`
- Connexion : l'en-tête `X-Appareil-Id` rattache l'appareil au compte pêcheur ou fait refuser la connexion (409 `APPAREIL_DEJA_RATTACHE`, 409 `COMPTE_RATTACHE_AUTRE_APPAREIL`)
- Envoi de positions, unitaire et par lot : 403 `APPAREIL_NON_RATTACHE`, 409 `SUIVI_DEJA_ASSURE` avec alerte `suivi_double_appareil`, référence de l'appareil sur chaque position
- Points d'accès des agents et des administrateurs : liste des appareils d'un pêcheur, libération motivée, autorisation d'un appareil supplémentaire
- Paramétrage versionné `backend/app/data/regles/appareils.json` : fenêtre de 30 minutes, un appareil par défaut, obligation de l'en-tête désactivée

**Pourquoi :** demande du porteur du 2026-11-24, pour éviter les conflits de suivi GPS et les tricheries entre pêcheurs.

**Principes :** seule une empreinte calculée avec un secret du serveur est conservée ; les messages ne disent jamais à qui un appareil est rattaché ; les autres rôles et l'ingestion des balises ne sont pas concernés ; le modèle des alertes n'est pas modifié.

**Tests réalisés :** 19 tests nommés, un par ligne du tableau de l'ADR, périmètre par rôle, absence de valeur brute, fenêtre paramétrée.

**Points ouverts :** règles R2 à R6 à valider ; secret d'empreinte et clé de signature à fixer avant la mise en service ; accès du pêcheur au portail une fois l'en-tête obligatoire.
```

### 2.13 Résumé

1. Présent en code, non commité : rattachement d'un appareil à un compte pêcheur à la connexion, contrôle à l'envoi des positions, référence de l'appareil sur chaque position, points d'accès de libération et d'autorisation pour les agents et les administrateurs.
2. 19 tests nommés verts, un par ligne du tableau de l'ADR-012 ; revue de sécurité faite, ses deux bloquants corrigés ; suite complète : 235 passés, 5 échecs anciens sans lien avec ce lot.
3. Migration additive appliquée à la base de développement seulement ; le serveur de prévisualisation doit être relancé pour servir les nouvelles routes.
4. Correctif hors lot : la flotte n'est plus tronquée à 2 000 embarcations (trois pirogues de démonstration étaient sorties de la carte).
5. Non vérifié : essai avec l'application réelle, charge.
6. Décisions du porteur : valider les règles R2 à R6 et leurs valeurs ; poser `APPAREIL_SECRET` et fixer la clé de signature avant la mise en service.
7. Décision du porteur : accès du pêcheur au portail une fois l'en-tête obligatoire (un navigateur n'a pas d'identifiant d'appareil).
