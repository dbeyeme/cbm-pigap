# ADR-012 : un appareil, un seul compte pêcheur

- **Statut :** Accepté sur le principe (demande du porteur du 2026-11-25) ; modalités marquées « Proposé » à valider
- **Date :** 2026-11-25
- **Décideurs :** Christian BEYEME (+ agent)
- **Liens :** [ADR-009](ADR-009-suivi-temps-reel-sources-position.md), [chantier de novembre 2026](../chantier-evolutions-2026-11.md), cahier §5.2 et §7

## Contexte

Demande du porteur : un téléphone ne doit pas accueillir plusieurs sessions de pêcheurs, pour éviter les conflits de suivi GPS et les tricheries entre pêcheurs.

Constats du 2026-11-25 dans le code :

| Sujet | Constat | Preuve |
|-------|---------|--------|
| Appartenance | Un pêcheur ne peut envoyer de positions que pour ses propres embarcations (404 sinon) | `backend/app/modules/geolocalisation/service.py`, `_assert_can_access_embarcation` |
| Appareil | Le serveur ne connaît pas l'appareil qui se connecte ni celui qui envoie une position | modèles `Utilisateur` et `Position`, `backend/app/api/v1/auth.py` |
| Faille | Un même téléphone peut se connecter tour à tour à plusieurs comptes pêcheurs et émettre des positions pour chacun : une personne peut « suivre » à la place d'une autre | aucune règle ne s'y oppose |
| File hors ligne | Les relevés en attente sur le téléphone sont désormais rattachés au compte qui les a pris (lot 3 en cours) | `mobile/src/offline/db.ts` |

## Options envisagées

1. **Règle côté téléphone seulement.** Le téléphone refuse un second compte. Contournable en effaçant les données de l'application.
2. **Règle côté serveur, sur un identifiant d'appareil.** Le serveur rattache l'appareil au compte et refuse les autres. Demande un identifiant stable et une procédure de changement de téléphone.
3. **Aucune règle, détection après coup.** Écartée : la tricherie resterait possible et ne serait vue qu'au contrôle.

## Décision

Option 2, appliquée côté serveur et relayée par l'application.

| Règle | Statut | Valideur |
|-------|--------|----------|
| R1. Un appareil n'accepte qu'un seul compte pêcheur | Décidée le 2026-11-25 | Christian |
| R2. Un compte pêcheur n'est rattaché qu'à un appareil ; un appareil supplémentaire (pêcheur qui arme plusieurs embarcations) s'obtient sur autorisation d'un agent ou d'un administrateur | Proposé | Christian, DGPA |
| R3. Une embarcation n'est suivie que par un appareil à la fois ; un second appareil qui émet pour elle dans la fenêtre d'exclusivité est refusé et signalé | Proposé (fenêtre de 30 minutes à valider) | Christian, expert halieutique |
| R4. Le changement de téléphone (perte, panne, remplacement) passe par une libération faite par un agent ou un administrateur, avec motif, auteur et date conservés | Proposé | Christian |
| R5. L'identifiant de l'appareil n'est conservé que sous forme d'empreinte non réversible ; le pêcheur en est informé à la première connexion | Proposé | Christian (donnée personnelle) |
| R6. Les comptes d'agents ne sont pas concernés : ils n'émettent pas de positions | Proposé | Christian |

Les paramètres (fenêtre d'exclusivité, nombre d'appareils par défaut, mode d'application) vivent dans un fichier de règles versionné, ni dans le code ni dans l'environnement.

### Contrat entre l'application et le serveur

- L'application envoie l'en-tête `X-Appareil-Id` à la connexion et sur chaque requête authentifiée. Valeur : identifiant Android de l'appareil, préfixé `android:` ; à défaut, identifiant d'installation préfixé `install:`. Chaîne de 16 à 128 caractères.
- Le serveur n'en conserve qu'une empreinte calculée avec un secret du serveur.
- Connexion d'un pêcheur avec l'en-tête :

| Situation | Réponse |
|-----------|---------|
| Appareil inconnu, compte sans appareil | 200, rattachement créé |
| Appareil déjà rattaché à ce compte | 200 |
| Appareil rattaché à un autre compte pêcheur | 409, code `APPAREIL_DEJA_RATTACHE` |
| Compte rattaché à un autre appareil, sans autorisation d'appareil supplémentaire | 409, code `COMPTE_RATTACHE_AUTRE_APPAREIL` |

- Envoi de positions par un pêcheur avec l'en-tête : 403 `APPAREIL_NON_RATTACHE` si l'appareil n'est pas rattaché au compte ; 409 `SUIVI_DEJA_ASSURE` si un autre appareil suit déjà l'embarcation dans la fenêtre d'exclusivité, avec une alerte. Chaque position enregistrée garde la référence de l'appareil.
- Libération et autorisation : points d'accès réservés aux agents de contrôle et aux administrateurs, motif obligatoire, 404 hors périmètre.
- Transition : tant que l'ancienne application (sans en-tête) circule, une requête sans en-tête est acceptée et consignée. Le paramètre qui rend l'en-tête obligatoire sera activé après diffusion de la nouvelle application.
- Les messages ne révèlent jamais à qui l'appareil est rattaché.

## Conséquences

- **Positives :** une personne ne peut plus suivre à la place d'une autre en changeant de compte sur son téléphone ; chaque position devient attribuable à un appareil ; les relevés en attente ne peuvent pas partir sous un autre compte.
- **Négatives :** un téléphone partagé entre plusieurs pêcheurs ne fonctionne plus ; un changement de téléphone demande l'intervention d'un agent.
- **Limites, à ne pas surestimer :** la règle n'empêche ni de laisser le téléphone à terre, ni de le confier à quelqu'un d'autre. Ces cas relèvent des balises, de l'AIS et du contrôle (ADR-009).
- **Dettes :** l'identifiant Android dépend de la clé de signature de l'application : la clé définitive doit être fixée avant la mise en service de la règle, sans quoi tous les rattachements seraient à refaire ; information du pêcheur à rédiger ; durée de conservation des empreintes à fixer.

## Répartition

| Partie | Chantier |
|--------|----------|
| Serveur : rattachement, contrôles à la connexion et à l'envoi, libération, alerte, tests | Lot 10, session serveur, après le lot 5 |
| Application : envoi de l'identifiant, messages, information du pêcheur, refus de changer de compte pendant un suivi | Lot 3, session mobile |
| Portail : liste et libération des appareils dans la fiche du pêcheur | Avec la partie portail du lot 2 |
