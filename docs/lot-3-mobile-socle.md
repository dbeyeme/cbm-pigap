# Lot 3 : socle mobile fiable sur le terrain

- **Statut :** compte rendu de chantier interne, soumis à la validation du porteur. Rien n'est commité, fusionné ni mis en ligne.
- **Date :** 2026-11-24
- **Auteur :** session mobile (agent), pour Christian BEYEME
- **Périmètre de fichiers :** `mobile/` et ce document. Aucune écriture dans `backend/`, `web/` ni dans les autres documents.
- **Liens :** [chantier de novembre 2026](chantier-evolutions-2026-11.md), [ADR-009](adr/ADR-009-suivi-temps-reel-sources-position.md), [ADR-012](adr/ADR-012-un-appareil-un-pecheur.md), [README de l'application](../mobile/README.md), [maquette du parcours pêcheur](maquettes/mobile-pecheur.md), [captures](../mobile/docs/captures-lot-3/)

Vocabulaire de ce document : **livré** veut dire exécuté et constaté, sur l'émulateur ou par un test ; **présent en code** veut dire écrit et typé, pas encore constaté à l'exécution ; **cible** veut dire non fait.

## 1. Compréhension

### 1.1 Le problème

L'application servait en démonstration, écran ouvert et réseau présent. Sur une pirogue, elle perdait la session à chaque fermeture, ne relevait la position que l'écran allumé, n'envoyait pas le lieu de pêche et n'offrait aucun QR. Le lot rend ces quatre points utilisables en mer, puis y ajoute trois demandes du porteur arrivées en cours de route : numéro de licence attribué automatiquement, aides contextuelles, un seul compte pêcheur par téléphone (ADR-012).

### 1.2 Constats

Les six constats de la consigne sont confirmés par la lecture du code. Sept défauts supplémentaires sont apparus ; les cinq premiers faisaient perdre des données sans le dire.

| Constat | Preuve (état avant ce lot) | Traitement |
|---------|----------------------------|------------|
| Toute erreur autre qu'une coupure de réseau marquait la file de positions « refusée », définitivement. Un jeton expiré (60 minutes) suffisait : une sortie de plus d'une heure perdait ses relevés | `mobile/src/offline/syncPositions.ts` | Corrigé, test nommé |
| Le serveur refuse un lot entier si une seule position est à terre ; l'application perdait alors tout le lot | `backend/app/modules/geolocalisation/service.py`, `create_positions_batch` | Contourné côté application (redécoupage), demande S2 |
| L'application écartait elle-même les positions hors de ses « corridors » d'exemple, et les masquait sur la carte. Le serveur, lui, connaît les vraies eaux (ZEE, fleuves, quais) | `mobile/src/geo/gabonMaritimeRoutes.ts`, `isOnWater` | Corrigé : le serveur tranche |
| Une déclaration au code hors référentiel, ou plus de 100 déclarations en attente, bloquait toute la file pour toujours | `backend/app/modules/captures/schemas.py`, `CaptureSyncBatch` | Corrigé |
| L'heure proposée pour une capture était l'heure universelle lue comme heure locale : une heure d'écart au Gabon | `mobile/src/screens/CapturesScreen.tsx` | Corrigé, constaté |
| Les saisies en attente n'étaient rattachées à aucun compte : un autre compte ouvert sur le même téléphone les voyait et les envoyait | `mobile/src/offline/db.ts` | Corrigé, puis durci par l'ADR-012 |
| L'écran GPS ne s'ouvrait pas sans réseau (liste des bateaux non gardée) ; l'envoi des captures était manuel | `mobile/src/screens/TrackingScreen.tsx` | Corrigé |

Relevés sans conséquence sur les données : identifiants d'essai et mot de passe proposé à la création d'un dossier présents dans le paquet diffusé ; `expo export` écrit par défaut dans `mobile/dist/`, qui contient les APK ; l'icône de l'application était encore celle du gabarit Expo depuis le premier commit, et Android 16 l'affiche dans la notification de suivi (corrigé : logo du portail, voir 2.1).

### 1.3 Choix retenus et écartés

| Sujet | Retenu | Écarté, et pourquoi |
|-------|--------|---------------------|
| Suivi écran éteint | Service de premier plan Android lancé sur un geste du pêcheur, notification permanente, autorisation « pendant l'utilisation » seulement | Autorisation « toujours » : le système renvoie alors vers les réglages, et l'application pourrait suivre sans geste du pêcheur. Vérifié dans le code du module de localisation, puis sur l'émulateur : elle n'est pas nécessaire |
| Suivi coupé par le téléphone | Au-delà d'une courte coupure, le suivi est déclaré interrompu et le pêcheur le redémarre ; en deçà, service et notification sont remis en état | Laisser le système reprendre seul : il relance les relevés sans notification et toutes les 2 secondes (constaté) |
| Précision | GPS (haute précision), un relevé à chaque intervalle même à l'arrêt, position exacte exigée | Précision « équilibrée » : elle s'appuie sur les antennes et le Wi-Fi, absents au large, et ne relève rien tant que le bateau n'a pas bougé de 100 m |
| Positions à terre | L'application envoie, le serveur tranche ; un lot refusé est coupé en deux jusqu'à isoler la position en cause | Filtrer sur le téléphone avec le masque approximatif : il écartait des positions réelles |
| Refus du serveur | Une saisie n'est écartée pour de bon que sur un code métier connu ; toute autre réponse laisse la file intacte | Décider sur le seul code HTTP : une passerelle qui répond 404 aurait vidé la file |
| Session | Jeton et profil dans le stockage sécurisé ; réouverture sans réseau ; retour à la connexion au premier 401 | Conserver le mot de passe pour se reconnecter en silence : interdit. Vérifier l'expiration sur le téléphone : inutile en mer, où seul compte ce que le serveur répond |
| Lieu de pêche | Étape « Lieu » : position au moment de la saisie, reprise, saisie de coordonnées, retrait | Choix sur une carte hors ligne et point tiré de la trace de la sortie (étude du 2026-10-30) : demandent des fonds de carte embarqués et une règle de calcul, voir « Proposé » |
| QR | Dessiné sur le téléphone, même adresse que la licence imprimée ; le lecteur n'ouvre jamais l'adresse lue, il en tire le numéro et interroge le serveur | Ouvrir l'adresse lue dans un navigateur : inutile pour l'agent, risqué avec un QR quelconque |
| Photographies | Photographie en haut de l'écran sous un voile bleu nuit, texte blanc ; champs de saisie sur panneau blanc opaque | Photographie plein écran sous les champs : illisible en plein soleil, et floue (images de 800 px) |
| Aides de démonstration | Un seul réglage de construction, `EXPO_PUBLIC_MODE_DEMO` ; comportement inchangé par défaut | Les retirer d'office : le sort des comptes de démonstration revient au porteur |
| Un téléphone, un pêcheur | Identifiant de l'appareil envoyé au serveur, garde locale alignée sur la décision du serveur, saisies rattachées strictement à leur compte | Libération du téléphone par un agent depuis l'application : la libération se fait côté serveur, avec motif et trace |

### 1.4 Hypothèses à tester au pilote

1. Le service de premier plan tient sur les téléphones du parc. Certains constructeurs coupent les applications en arrière-plan ; l'application le détecte et le dit, elle ne peut pas l'empêcher.
2. Un point GPS s'obtient au large en moins de 25 secondes et un relevé toutes les 5 minutes ne vide pas la batterie sur une sortie.
3. Les pêcheurs qui déclarent au port corrigent ou retirent le lieu de pêche. Sinon les captures par zone du lot 5 se concentreront sur les ports.

## 2. Exécution

### 2.1 Ce qui est fait

« Livré » s'entend ici : constaté sur l'émulateur Android 16 avec une APK de diffusion d'essai, contre un serveur d'essai à données fictives (section 2.2). Rien n'a été constaté sur un téléphone réel ni contre le serveur réel.

| N° | Livrable | État | Où | Preuve |
|----|----------|------|-----|--------|
| 1 | Session conservée, effacée à la déconnexion, retour à la connexion avec message au 401 | Livré | `src/auth/session.ts`, `src/api.ts`, `App.tsx`, `src/screens/LoginScreen.tsx` | Réouverture sans réseau après fermeture forcée : accueil direct. 401 simulé : écran de connexion et message. 10 tests |
| 2 | Lieu de pêche joint à la capture, modifiable, retirable, hors ligne | Livré | `src/screens/CapturesScreen.tsx`, `src/offline/db.ts`, `src/offline/syncCaptures.ts` | Position GPS relevée (précision 5 m), coordonnées saisies, déclaration réseau coupé puis envoi automatique : `position_capture` reçu par le serveur d'essai. 6 tests |
| 3 | Suivi GPS en arrière-plan : service de premier plan, notification, démarrage et arrêt par le pêcheur, explication avant l'autorisation, file hors ligne, état d'envoi visible | Livré à l'intervalle de démonstration (30 s). À l'intervalle réel (5 min) : relevé de départ seulement sur l'émulateur, voir 2.4 | `src/tracking/`, `src/screens/TrackingScreen.tsx`, `src/offline/batching.ts`, `src/offline/syncPositions.ts`, `app.json` | Relevés reçus application en arrière-plan puis écran éteint ; détail en 2.2. 34 tests |
| 4 | Carte professionnelle hors ligne avec QR ; lecteur par caméra pour l'agent ; saisie en secours | Carte et saisie : livré. Lecture par caméra : présent en code | `src/screens/CarteProScreen.tsx`, `src/screens/ControleLicenceScreen.tsx`, `src/components/QrCode.tsx`, `src/lib/licence.ts` | QR de la capture d'écran décodé : adresse de vérification attendue. Carte affichée sans réseau. Résultat de contrôle affiché après saisie. Caméra : autorisation et lecteur affichés, aperçu noir sur l'émulateur. 8 tests |
| 5 | Photographies du porteur ; libellés accentués | Livré | `assets/photos/`, `src/photos.ts`, `src/components/ui/PhotoBanner.tsx`, `src/components/PhotoBackdrop.tsx` | Captures : bienvenue, connexion, bannières des huit écrans principaux |
| A | Numéro de licence attribué automatiquement ; reprise d'un numéro papier repliée ; numéro affiché une fois le dossier enregistré | Livré | `src/screens/CreatePecheurScreen.tsx` | Dossier créé sans numéro saisi : le numéro attribué s'affiche |
| B | Aides contextuelles : un seul composant, un « ? » qui ouvre quelques lignes | Livré | `src/components/ui/HelpTip.tsx`, `InfoSheet.tsx` ; dix écrans | Captures |
| C | Un téléphone, un seul compte pêcheur (ADR-012), part application | Garde locale : livré. Échange avec le vrai serveur : présent en code | `src/device.ts`, `src/auth/attachment.ts`, `src/api.ts`, `src/offline/db.ts` | En-tête compté par le serveur d'essai ; second compte pêcheur refusé à l'écran ; changement de compte refusé pendant un suivi. 14 tests |

Trois photographies sur quatre sont reprises (pêche au crépuscule, débarquement, port) ; celle du terminal à conteneurs, sans rapport avec la pêche artisanale, ne l'est pas.

Changements de comportement à connaître :

- Le suivi relève à l'intervalle fixé par le serveur (5 minutes), et non plus toutes les 30 secondes ; le relevé rapide reste proposé dans les aides de démonstration. Un premier relevé est pris dès le démarrage.
- Seul le pêcheur lance un suivi continu. L'agent consulte et peut encore envoyer une position isolée.
- Accueil de l'agent : l'action principale devient « Contrôler une licence » ; « Nouveau dossier » passe en tuile.
- La déconnexion quitte le haut de l'écran pour un bouton libellé en bas de l'accueil, avec confirmation ; elle arrête le suivi.
- Création d'un dossier : l'écran ne se referme plus seul, il affiche le numéro de licence attribué.
- Déclaration de capture en cinq étapes (bateau, espèce, engin, lieu, détails) ; une déclaration refusée par le serveur s'affiche « Refusée » avec son motif et peut être retirée.
- Version portée à 0.2.0 (code de version 4), sauvegarde automatique Android désactivée (`allowBackup`), paquets Expo mis au niveau du correctif attendu.
- Icône de l'application : le logo du portail (`web/public/logo-cbm-pigap.png`) remplace l'icône du gabarit Expo, en version ronde, carrée et monochrome (`assets/icon.png`, `assets/android-icon-*.png`). La petite icône de la notification, dans la barre d'état, est un bateau (`assets/notification-suivi.png`).

### 2.2 Vérifications exécutées

| Vérification | Résultat | Date |
|--------------|----------|------|
| `npx tsc --noEmit`, tests compris | 0 erreur | 2026-11-24 |
| `npm test` | 77 tests verts, 11 suites ; le dernier ajouté échoue bien sans le correctif qu'il protège | 2026-11-24 |
| `npx expo-doctor` | 20 contrôles sur 21 ; le seul échec tient au poste : Xcode 26.2 installé, 26.4 attendu par Expo 57 (sans effet sur Android) | 2026-11-24 |
| `npx expo export --platform android` | Réussi, paquet de 2,7 Mo ; aucune adresse d'essai (ni `10.0.2.2`, ni le port 8790) ; seules adresses de la plateforme : le serveur de production en https et le portail | 2026-11-24 |
| Même export avec une adresse de serveur en http | Refusé avec un message explicite (garde de `app.config.js`) | 2026-11-24 |
| Même export avec `EXPO_PUBLIC_MODE_DEMO=false` | Aucun identifiant d'essai dans le paquet (recherche dans le fichier compilé) | 2026-11-24 |
| APK d'essai, JDK 17, sans toucher à la signature | Construite (49 Mo pour une architecture), installée sur l'émulateur | 2026-11-24 |
| APK de diffusion 0.2.0, versions terrain et démonstration | Construites et contrôlées (version, architectures, autorisations, adresse inscrite, aides de démonstration, signature) ; détail et incident de construction en 2.11 | 2026-11-24 |
| Manifeste de l'APK | Localisation, service de premier plan, notifications, caméra ; ni localisation « toujours », ni micro | 2026-11-24 |
| Serveur du poste, avant son arrêt | `/health`, vérification publique d'une licence et réponse 401 à un jeton invalide conformes à ce que l'application attend | 2026-11-24 |

**Parcours sur l'émulateur** (Android 16, APK de diffusion d'essai, serveur d'essai `scripts/serveur-essai.mjs --autonome`) :

| Point constaté | Résultat |
|----------------|----------|
| Bienvenue, connexion | Photographie et texte lisibles ; connexion du pêcheur et de l'agent |
| Identifiant d'appareil | En-tête `X-Appareil-Id` présent à la connexion et sur les requêtes authentifiées |
| Démarrage du suivi | Explication affichée avant toute demande ; Android propose « pendant l'utilisation » ; demande d'afficher les notifications ; premier relevé reçu dans les 7 secondes. Sur une installation neuve, le relevé de départ arrivait deux fois (relevé immédiat et premier relevé du service, même horodatage) : corrigé, un seul relevé reçu ensuite |
| Service et notification | Service de premier plan de type localisation ; notification « Suivi GPS en cours », non effaçable, avec le nom du bateau et l'intervalle ; logo de l'application dans le volet, bateau dans la barre d'état |
| Arrière-plan, écran éteint | Relevés reçus toutes les 30 secondes (intervalle de démonstration), positions conformes au déplacement simulé. À l'intervalle réel de 5 minutes : relevé de départ reçu, puis aucun relevé périodique en 8 minutes, écran éteint puis rallumé, position simulée déplacée (voir 2.4) |
| Réseau coupé pendant le suivi | Aucun relevé perdu : les trois relevés pris pendant la coupure arrivent ensuite, dans l'ordre |
| Session expirée pendant le suivi | Un seul appel refusé, puis plus aucun ; le suivi continue d'enregistrer ; à la réouverture, écran de connexion avec le message, le rappel du suivi et un bouton d'arrêt ; les relevés partent à la reconnexion |
| Application retirée des applications récentes | Service, notification et relevés continuent ; la réouverture retrouve le suivi |
| Arrêt forcé, réouverture après 3 minutes 30 | Suivi déclaré interrompu à l'accueil et sur l'écran GPS ; aucun relevé, aucune demande de position |
| Arrêt forcé, réouverture rapide | Service, notification et intervalle remis en état |
| Arrêt du suivi, déconnexion | Service et notification disparus ; la déconnexion prévient puis arrête le suivi |
| Déclaration de capture | Lieu relevé au GPS sans dialogue du système ; coordonnées saisies à la main ; enregistrement réseau coupé ; envoi automatique moins de 30 secondes après le retour du réseau ; heure exacte |
| Carte professionnelle | Identité, licence, validité, QR ; affichée sans réseau après fermeture forcée ; QR décodé par l'outil de lecture du poste |
| Un téléphone, un compte pêcheur | Second compte pêcheur refusé sans dire à qui le téléphone est rattaché ; autre compte refusé pendant un suivi ; information du pêcheur à la première connexion |
| Agent | Contrôle par saisie du numéro : validité, titulaire, bateaux, taxes dues, alertes, contrôles, engins ; création de dossier ; suivi de la flotte ; recherche de licences |

Captures : 23 écrans dans [`mobile/docs/captures-lot-3/`](../mobile/docs/captures-lot-3/), numérotés dans l'ordre du parcours (bienvenue, connexion en version de démonstration et en version terrain, accueil, suivi, notification, déclaration, carte, contrôle, dossier, flotte, licences). Les données qu'on y voit sont fictives (« Jean Fictif », « Pirogue fictive 1 », licence `GA-PA-2026-90001`). Le serveur d'essai qui les produit se lance par `node mobile/scripts/serveur-essai.mjs --autonome` (port 8790, aucune base de données touchée).

### 2.3 Relecture indépendante

Une relecture du code en lecture seule a rendu douze constats : un bloquant, cinq importants, six mineurs.

| N° | Constat | Suite donnée |
|----|---------|--------------|
| 1 | Bloquant : après un arrêt de l'application par le téléphone, le suivi reprenait seul à la réouverture, sans notification, à 2 secondes d'intervalle | Reproduit sur l'émulateur, corrigé, revérifié (2.2), 8 tests |
| 2 | Refus définitif décidé sur le seul code HTTP | Corrigé : code métier connu exigé |
| 3 | Captures refusées jamais terminales, pouvant retarder les autres | Corrigé : état « refusée », retrait possible, saisies saines envoyées d'abord |
| 4 | « Suivi déjà assuré » : toute la file du bateau écartée | Corrigé : seuls les relevés en conflit sont écartés ; le suivi ne s'arrête que si le relevé le plus récent est refusé |
| 5 | Garde locale sans issue après une libération par un agent | Sans objet depuis : le serveur renvoie `appareil_rattache`, que l'application suit |
| 6 | Position approximative tenue pour accordée | Corrigé : position exacte exigée, message et renvoi aux réglages |
| 7 à 12 | « Envoyé » affiché trop tôt ; parcours rechargé écran éteint ; bateaux connus partagés entre comptes ; alerte de position introuvable jamais levée sur Android ; course au démarrage ; déconnexion sans retour visuel | Tous corrigés |

Verdict : aucun bloquant ouvert. Les points 1, 6 et 10 ont été revus à l'écran ; les autres sont couverts par les tests.

### 2.4 Ce qui n'est pas vérifié

- **Relevés périodiques à l'intervalle réel de 5 minutes (risque principal).** Sur l'émulateur, après le relevé de départ, aucun relevé n'est arrivé en 8 minutes, écran éteint puis rallumé, position simulée déplacée. Le journal du fournisseur de position de Google montre qu'à l'échéance il a bien demandé un point GPS, sans en obtenir ; à 30 secondes, il garde le GPS allumé et les relevés arrivent. Rien ne permet de dire si le défaut tient au GPS simulé de l'émulateur ou se produira sur un téléphone : c'est le premier point à vérifier sur un appareil réel (2.9). S'il se confirme, une sortie ne compterait que son relevé de départ, et l'avertissement « Aucun relevé depuis… » ne paraîtrait qu'au bout de trois intervalles (15 minutes). Correctif possible, à décider (2.7) : demander au téléphone un relevé toutes les 30 secondes et n'en garder qu'un toutes les 5 minutes (le filtre existe déjà dans `src/tracking/task.ts`), au prix d'un GPS allumé en continu.
- **Lecture d'un QR par la caméra.** L'émulateur sans fenêtre donne un aperçu noir. L'autorisation, l'écran du lecteur et la lecture du contenu d'un QR (tests) sont vérifiés ; la lecture réelle, en plein soleil et de nuit avec la lampe, reste à faire sur un téléphone.
- **Serveur réel.** Tout le parcours a tourné contre le serveur d'essai : le serveur du poste (port 8000) était arrêté, et l'APK de diffusion vise le serveur en ligne, auquel nous ne nous connectons pas sans accord du porteur. La conformité au serveur repose sur la lecture de son code et sur trois appels réels du 2026-11-24.
- **ADR-012 de bout en bout.** Les refus du serveur (`APPAREIL_DEJA_RATTACHE`, `SUIVI_DEJA_ASSURE` et les autres) ne sont couverts que par des tests ; aucun essai croisé avec le lot 10.
- **Téléphone réel.** Tenue du suivi sur une sortie entière, consommation de batterie, téléphones qui coupent les applications en arrière-plan, redémarrage du téléphone pendant un suivi.
- **iOS.** Non construit (Xcode du poste trop ancien pour Expo 57), hors périmètre du MVP.
- **APK de diffusion finale.** Voir 2.11.

### 2.5 Limites connues

- **Durée de session :** le jeton vaut 60 minutes et le serveur n'offre pas de renouvellement. Avec du réseau, le pêcheur se reconnecte donc à chaque ouverture espacée de plus d'une heure. En mer, le suivi continue d'enregistrer ; l'envoi reprend à la reconnexion.
- **Suivi interrompu :** arrêt forcé, redémarrage du téléphone ou économie de batterie du constructeur arrêtent le suivi. L'application le constate à la réouverture et l'écrit ; elle ne le relance seule qu'après une coupure courte (deux intervalles, trois minutes au moins).
- **Doublons de positions possibles** si la réponse du serveur se perd après l'enregistrement : le serveur ne reconnaît pas une position déjà reçue.
- **Positions à terre** enregistrées sur le téléphone jusqu'à leur refus par le serveur, puis effacées au bout de sept jours.
- **Lieu de pêche :** c'est la position du téléphone au moment de la déclaration, donc celle du port si le pêcheur déclare au retour sans corriger.
- **Carte professionnelle :** la validité affichée est celle de la dernière mise à jour ; hors ligne, une licence dont la date de fin est passée s'affiche expirée, mais une suspension décidée entre-temps ne se voit pas.
- **Déclaration en cours perdue** si le pêcheur change d'onglet avant d'enregistrer (comportement antérieur au lot).
- **Taille du texte :** les textes de lecture et les libellés d'action sont à 16 px ou plus ; restent en dessous les légendes des tuiles, des étapes et des onglets (12 à 14 px).
- **Garde locale de l'ADR-012 :** contournable en effaçant les données de l'application, comme l'ADR le dit ; seul le serveur fait foi.

### 2.6 Demandes au serveur

| N° | Demande | Pourquoi | État |
|----|---------|----------|------|
| S1 | Renouvellement de session : point d'accès de renouvellement, ou durée de jeton propre à l'application mobile | Le jeton vaut 60 minutes (`jwt_expire_minutes`) ; sur une sortie longue, rien ne part avant la reconnexion | Ouverte |
| S2 | `POST /positions/batch` : réponse position par position (acceptée, déjà reçue, refusée avec son motif) et identifiant fourni par le téléphone pour reconnaître un renvoi | Aujourd'hui tout ou rien, et aucun dédoublonnage : l'application redécoupe les lots refusés (40 appels au plus par envoi) | Ouverte |
| S3 | Un point d'accès « ma carte professionnelle » pour le pêcheur : identité, licence, validité, adresse de vérification | La carte se compose de quatre appels, et l'adresse du portail est figée dans l'application (`EXPO_PUBLIC_PORTAIL_URL`, même valeur par défaut que `public_web_url`) | Ouverte |
| S4 | ADR-012 : champ `appareil_rattache` dans la réponse de connexion | La garde locale suit ainsi une libération faite par un agent | Servie par le lot 10 (`backend/app/schemas/auth.py`) |
| S5 | ADR-012 : codes d'erreur dans le champ `code` du corps | L'application choisit son message d'après ce code | Servie ; l'application traite aussi `APPAREIL_REQUIS` et `APPAREIL_ID_INVALIDE` |
| S6 | ADR-012, `SUIVI_DEJA_ASSURE` : une seule alerte par incident | Chaque appel refusé crée une alerte (`signaler_suivi_double`), et l'application redécoupe un lot refusé pour sauver les relevés hors conflit : un même incident produit plusieurs alertes | Ouverte ; S2 la résoudrait aussi |
| S7 | Lieu de pêche : savoir si la position vient du GPS ou d'une saisie, et garder à l'esprit qu'elle peut être celle du port | Le lot 5 calcule les captures par zone sur `position_capture` | Ouverte |
| S8 | Règle R6 de l'ADR-012 : « les agents n'émettent pas de positions » | L'application laisse un agent envoyer une position isolée et, en démonstration, un parcours d'exemple | À trancher : retirer ces actions, ou amender la règle |
| S9 | Libellés des parcours d'exemple | Générés par `backend/scripts/fetch_gabon_opendata.py` dans `mobile/src/geo/gabonMaritimeRoutes.ts` : tirets cadratins et jargon, visibles en démonstration | Ouverte |

### 2.7 Règles « Proposé » et décisions qui reviennent au porteur

| Sujet | Proposition | Valideur |
|-------|-------------|----------|
| Aides de démonstration dans l'APK diffusée (comptes d'essai proposés à la connexion, parcours d'exemple qui envoie de fausses positions, mot de passe proposé à la création d'un dossier) | Décidé le 2026-11-24 : deux APK, terrain et démonstration (2.11) ; la version de démonstration derrière le lien public de l'accueil du portail, comme la 0.1.2. Conséquence connue : toute personne qui la télécharge accède en un geste aux comptes d'essai du serveur en ligne, et le parcours d'exemple y écrit des positions (il efface d'abord le parcours du bateau quand un agent l'utilise) | Christian |
| Adresse du portail inscrite dans le QR | Confirmer l'adresse définitive avant diffusion : un QR affiché ou imprimé en dépend | Christian |
| Clé de signature de l'application | La fixer avant la mise en service de l'ADR-012 : l'identifiant Android en dépend, et une autre clé oblige à désinstaller | Christian |
| Lieu de pêche déclaré au port | Ne pas joindre d'office une position à terre ; proposer un point de la trace de la sortie | Christian, expert halieutique |
| Arrêt automatique du suivi (retour à terre, durée maximale) | Aucune règle codée ; aujourd'hui seul le pêcheur arrête | Christian, expert halieutique |
| Reprise du suivi après une coupure courte | Tolérance de deux intervalles, trois minutes au moins (`src/tracking/tracking.ts`) ; à zéro si toute reprise doit passer par le pêcheur | Christian |
| Relevés en conflit avec un autre appareil (ADR-012, R3) | L'application écarte les seuls relevés refusés et arrête le suivi si le plus récent l'est | Christian, expert halieutique |
| Positions simulées par une application tierce | Les signaler au serveur ; aujourd'hui non distinguées | Christian, DGPA |
| Information du pêcheur sur le rattachement du téléphone (ADR-012, R5) | Texte en place : « Ce téléphone est rattaché à votre compte : vos positions sont bien les vôtres. » L'aide dit que l'identifiant du téléphone est transmis à la plateforme ; mentionner l'empreinte non réversible une fois la règle en service | Christian |
| Fréquence demandée au téléphone pour le suivi | Si l'essai sur téléphone confirme l'absence de relevés à 5 minutes (2.4) : demander un relevé toutes les 30 secondes et n'en garder qu'un toutes les 5 minutes ; GPS allumé en continu, consommation à mesurer sur une sortie | Christian |
| Icône de l'application | Logo du portail repris tel quel (280 px, fond blanc) ; fournir une version de 1024 px à fond transparent pour une icône nette | Christian |
| Version 0.2.0, code 4 | À confirmer au moment de la diffusion | Christian |

### 2.8 Dettes

- Tests d'écran et parcours rejouables sur appareil : la logique est testée (77 tests), les écrans ne le sont que par le parcours manuel ; `src/offline/db.ts` (SQLite) n'a pas de test.
- Déclaration de sortie et de retour, page de profil : reportées (modèle serveur et ADR à venir).
- Champ « Date et heure » de la capture saisi au clavier ; un sélecteur serait plus sûr.
- Création d'un dossier en deux appels : si le bateau est refusé, le pêcheur est déjà créé et un nouvel essai échoue.
- Bouton physique « retour » d'Android non géré dans l'application.
- Poids : 9 Mo d'illustrations dans `assets/illustrations/`, servies comme icônes de 28 px.
- `userInterfaceStyle` déclaré sombre pour une interface claire ; autorisations sans usage (stockage, superposition de fenêtres, biométrie, parrainage du magasin d'applications, voir 2.11) à retirer du manifeste.
- Au démarrage d'un suivi, le relevé immédiat et le premier relevé du service sont mis en file l'un après l'autre (verrou dans `src/tracking/state.ts`) ; ce verrou ne vaut que dans une même exécution de l'application, ce qui couvre le démarrage, toujours fait écran ouvert.
- 4 alertes `npm audit` (3 modérées, 1 critique) dans les dépendances de construction, non analysées.
- Écart de procédure : en début de session, une commande a extrait le nom de la variable de `mobile/.env`, valeur masquée. Aucune valeur n'a été lue ; le fichier n'a pas été rouvert.

### 2.9 Suite ordonnée

1. Parcours sur un téléphone Android réel avec l'APK 0.2.0 et un compte de démonstration du serveur en ligne, avec l'accord du porteur. D'abord, suivi de 30 minutes écran éteint : un relevé doit arriver toutes les 5 minutes (sinon, appliquer le correctif décrit en 2.4). Ensuite, sortie de 2 heures, déclaration en mode avion, lecture d'un QR. Critère : aucun relevé perdu, notification présente du début à la fin.
2. Décision du porteur sur les aides de démonstration et l'adresse du portail, puis construction de l'APK de terrain.
3. Essai croisé avec le lot 10 du serveur (ADR-012) : rattachement, refus, libération, double suivi.
4. S1 (renouvellement de session), sans quoi le suivi d'une sortie longue n'envoie rien avant le retour.
5. S2, puis retrait du redécoupage côté application.

### 2.10 Texte proposé pour le journal

```markdown
## [2026-11-24] Lot 3 : socle mobile fiable sur le terrain

- Session conservée dans le stockage sécurisé, restaurée sans réseau, effacée à la déconnexion et au premier 401 avec message à l'écran de connexion ; pas de renouvellement silencieux (demande au serveur S1)
- Déclaration de capture : étape « Lieu de pêche » (position à la saisie, corrigeable, retirable), envoyée dans `position_capture` ; envoi automatique des saisies en attente
- Suivi GPS en arrière-plan : service de premier plan Android avec notification, démarrage et arrêt par le pêcheur après explication, autorisation « pendant l'utilisation » seulement ; relevés versés dans la file hors ligne, état d'envoi visible ; un suivi coupé par le téléphone ne reprend pas en silence
- Carte professionnelle du pêcheur consultable hors ligne avec QR de vérification publique ; lecteur de QR par caméra pour l'agent, saisie du numéro en secours
- Photographies du porteur en arrière-plan de la bienvenue et de la connexion et en bannière des écrans principaux ; libellés accentués, aucun tiret cadratin ; logo du portail en icône de l'application, à la place de celle du gabarit Expo
- Compléments du porteur : numéro de licence attribué automatiquement à la création d'un dossier, aides contextuelles (composant unique), un téléphone pour un seul compte pêcheur (ADR-012, part application)
- Défauts corrigés : file de positions perdue à l'expiration du jeton, positions réelles écartées par le masque d'eau de l'application, file de captures bloquée par une seule saisie refusée, heure de capture décalée d'une heure, saisies en attente visibles d'un autre compte, suivi relancé sans notification après un arrêt de l'application par le téléphone, relevé de départ enregistré deux fois
- Vérifié : typage à zéro erreur, 77 tests, contrôle Expo (20 sur 21, l'échec tient à la version de Xcode du poste), export de production, garde https, APK construite avec le JDK 17, parcours complet sur émulateur Android 16 contre un serveur d'essai à données fictives ; relecture indépendante, aucun bloquant ouvert
- Non vérifié : relevés périodiques à l'intervalle réel de 5 minutes (seul le relevé de départ arrive sur l'émulateur ; à vérifier en premier sur téléphone), lecture d'un QR par une vraie caméra, serveur réel, téléphone réel, essai croisé avec le lot 10, iOS (`docs/lot-3-mobile-socle.md`, section 2.4)
- APK 0.2.0 en deux versions dans `mobile/dist/`, terrain (sans aides de démonstration) et démonstration (code 4, quatre architectures, même signature que la 0.1.2), non publiées ; une première construction reprenait l'adresse du serveur d'essai depuis le cache de Metro : écartée, reconstruite, contrôle ajouté au README
- Non commité, non déployé
```

Leçon proposée pour `docs/LECONS.md` (hors du périmètre de ce lot) :

```markdown
## 2026-11-24 : APK de diffusion construite avec l'adresse du serveur d'essai

- Constat : après des constructions d'essai (`EXPO_PUBLIC_API_URL=http://10.0.2.2:8790`), l'APK de diffusion contenait encore l'adresse d'essai. Metro garde en cache le code où les variables `EXPO_PUBLIC_*` sont inscrites ; aucune étape ne l'a signalé.
- Cause : le cache de transformation de Metro (`$TMPDIR/metro-cache`, partagé entre projets) a resservi le code compilé avec l'ancienne valeur ; une construction avec un cache neuf inscrit la bonne adresse.
- Règle : construire toute APK de diffusion avec un cache neuf (`TMPDIR="$(mktemp -d)"`) et lire l'adresse inscrite dans l'APK avant de la déclarer conforme (`mobile/README.md`).
```

### 2.11 APK de diffusion

Deux APK 0.2.0, à la demande du porteur, construites le 2026-11-24 avec le JDK 17 après régénération complète de `android/` (`expo prebuild --clean`), sans réglage d'essai et chacune avec un cache de compilation neuf. Non publiées : la mise à disposition revient au porteur.

| Fichier | Usage | Empreinte SHA-256 |
|---------|-------|-------------------|
| `mobile/dist/CBM-PIGAP-0.2.0-terrain.apk` | Pêcheurs et agents sur le terrain (`EXPO_PUBLIC_MODE_DEMO=false`) : ni comptes d'essai ni champs pré-remplis à la connexion, aucun mot de passe proposé à la création d'un dossier, ni « Parcours d'exemple » ni relevé rapide à 30 secondes dans l'écran GPS | `11ab61e61152dbb9cf609b5383f1d7b32acd16b5a233e341764db2930599d60a` |
| `mobile/dist/CBM-PIGAP-0.2.0-demonstration.apk` | Présentations : aides de démonstration présentes, comme dans les versions précédentes | `f2437f77bee29b6b368ce45314532c6d395c7af74aa7f4ed26944a2a714486e7` |

Les deux ne diffèrent que par ces aides : même code natif, mêmes autorisations, même signature. Elles portent le même identifiant d'application : un téléphone n'en garde qu'une, la seconde installée remplace la première.

**Incident de construction.** La première APK finale contenait encore l'adresse du serveur d'essai (`http://10.0.2.2:8790`) : Metro, l'outil qui assemble le code JavaScript, l'avait gardée en cache depuis les constructions d'essai. Ni la régénération de `android/`, ni la garde https de `app.config.js`, ni la compilation ne l'ont signalé, et l'export de contrôle donnait la bonne adresse. Sur un téléphone, cette APK n'aurait joint aucun serveur. Elle a été écartée avant toute diffusion, puis reconstruite avec un cache neuf ; le README décrit désormais cette construction et le contrôle de l'adresse inscrite dans l'APK. L'APK 0.1.2 déjà diffusée vise bien le serveur de production (vérifié).

| Contrôle | Résultat |
|----------|----------|
| Version | 0.2.0, code de version 4, cible Android 16 (niveau 36) |
| Architectures | Les quatre (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) |
| Taille | 114,5 Mo, contre 90,7 Mo pour la 0.1.2 : bibliothèque de lecture des QR du module caméra (+19,3 Mo pour les quatre architectures), code des nouveaux modules (+3 Mo), photographies et icônes (+1,1 Mo) |
| Serveur visé | Lu dans le paquet de l'APK : l'adresse du serveur de production en https et celle du portail ; aucune adresse d'essai |
| Trafic en clair | Non autorisé |
| Autorisations demandées à l'écran | Localisation (exacte, pendant l'utilisation), notifications, caméra. Ni localisation « toujours », ni micro |
| Signature | Clé de débogage par défaut, même certificat que la 0.1.2 : elle s'installe par-dessus sans désinstaller |
| Aides de démonstration, lues dans les paquets | Version terrain : aucun des identifiants d'essai (e-mails et mots de passe recherchés dans le paquet). Version de démonstration : présents. Le libellé « Parcours d'exemple » reste dans le code de la version terrain, mais seul le bloc réservé à la démonstration y mène (`src/screens/TrackingScreen.tsx`) |
| Lancement sur l'émulateur, version de démonstration | Installée à la place de l'APK d'essai, lancée réseau coupé : bienvenue puis connexion, aucune erreur au journal du téléphone |
| Lancement sur l'émulateur, version terrain | Installation neuve, lancée réseau coupé : bienvenue, puis connexion aux champs vides, sans comptes d'essai (capture `02-connexion-version-terrain`), aucune erreur au journal du téléphone |

Aucune connexion au serveur en ligne n'a été tentée.

**Diffusion décidée le 2026-11-24 : la version de démonstration derrière le lien public de l'accueil du portail.** Rien n'est publié. Étapes, sur le modèle de la 0.1.2 (étiquette `v0.1.2-mobile` posée sur `main`, fichier `CBM-PIGAP.apk`, courte note avec l'empreinte) :

1. Commiter le lot et le fusionner dans `main` (session principale, fusion décidée par le porteur) : sans cela, l'étiquette de la version désignerait un code qui ne contient pas la 0.2.0.
2. Publier la version GitHub `v0.2.0-mobile`, intitulée « Application Android 0.2.0 », marquée « latest », avec pour seul fichier une copie de `CBM-PIGAP-0.2.0-demonstration.apk` nommée `CBM-PIGAP.apk` (accord explicite du porteur requis) :

   ```bash
   cp mobile/dist/CBM-PIGAP-0.2.0-demonstration.apk /tmp/CBM-PIGAP.apk
   gh release create v0.2.0-mobile /tmp/CBM-PIGAP.apk --repo dbeyeme/cbm-pigap --target main --title "Application Android 0.2.0" --notes-file <note validée> --latest
   ```

3. Dans `web/src/pages/LandingPage.tsx` (constante `APK`, hors du périmètre de ce lot) : `version: '0.2.0'` et `taille: '120 Mo'` (120 107 104 octets, même convention que les 95 Mo affichés pour la 0.1.2). La mention « Android 7.0 ou plus récent » reste juste (niveau minimal 24).

Note de version proposée, contenu externe soumis à la validation du porteur :

```text
Application mobile CBM-PIGAP pour Android 7.0 ou plus récent (pêcheurs et agents de terrain), version de démonstration : des comptes d'essai sont proposés à la connexion.

Nouveautés : la session reste ouverte d'une utilisation à l'autre ; le suivi GPS continue écran éteint, avec une notification permanente ; le lieu de pêche peut être joint à chaque déclaration ; la carte professionnelle et son QR restent consultables sans réseau ; les agents contrôlent une licence en lisant son QR.

Installation : télécharger CBM-PIGAP.apk sur le téléphone, autoriser l'installation depuis le navigateur, puis installer. Cette version remplace la 0.1.2 sans désinstallation.

SHA-256 : f2437f77bee29b6b368ce45314532c6d395c7af74aa7f4ed26944a2a714486e7
```

Deux mentions de cette note dépendent de l'essai sur téléphone (2.4 et 2.9) : le suivi écran éteint au rythme réel de 5 minutes et la lecture du QR par la caméra. Publier après cet essai, ou retirer ces deux mentions.

**Accord du porteur le 2026-11-24 (« vas y ») pour ces trois étapes, transmis à la session principale, qui tient les commits.** L'essai sur téléphone n'ayant pas eu lieu, la note à publier est celle sans les deux mentions non vérifiées : `mobile/dist/note-version-0.2.0.md` (dossier non suivi par git). Prérequis vérifiés dans le code de `main` : il offre déjà ce que la 0.2.0 appelle (lieu de pêche joint aux déclarations, vérification publique et contrôle d'une licence, couverture de l'abonnement) ; l'ADR-012 (lot 10) n'y est pas encore, et l'application s'en passe (en-tête ignoré, champ facultatif). Le serveur en ligne n'a pas été interrogé.

La version terrain reste disponible à part, pour une remise directe aux pêcheurs et aux agents.

Autorisations sans usage, déclarées par des modules tiers ou par le gabarit, à retirer par `android.blockedPermissions` dans un lot ultérieur : stockage externe, superposition de fenêtres, biométrie (stockage sécurisé), service de parrainage du magasin d'applications.
