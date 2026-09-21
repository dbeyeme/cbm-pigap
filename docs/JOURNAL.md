# JOURNAL — CBM-PIGAP

Journal de réalisation du MVP. Format imposé par le cahier technique §11.
Chaque module terminé = une entrée. Langage clair pour le porteur de projet.

---

## [2026-09-21] — Paiement Mobile Money initié depuis le numéro enregistré de l'acteur

**Ce qui a été construit :**
- Audit du circuit PawaPay : le dépôt (`POST /v2/deposits`, payeur MMO Airtel Gabon) était bien un dépôt initié vers le téléphone du payeur, mais le numéro était libre et non rattaché à l'acteur
- Règle métier (`resoudre_msisdn_paiement`) : numéro omis → téléphone enregistré du pêcheur (compte utilisateur) ou de l'organisation ; numéro différent → refusé pour l'acteur lui-même et pour un agent sans autorisation explicite (`numero_tiers_autorise`), accepté et tracé sinon (`payeur_tiers`, `msisdn_acteur` dans les métadonnées du paiement)
- `GET /abonnements/payeur` : numéro enregistré attendu (pêcheur connecté, organisation connectée, ou ciblé par un agent)
- Web : champ payeur pré-rempli depuis le titulaire et verrouillé ; case « Autoriser un payeur tiers » ; mobile : numéro enregistré affiché en lecture seule, bouton de paiement bloqué si aucun téléphone valide
- Tests : `test_paiement_msisdn.py` (défaut, refus d'un autre numéro, même numéro écrit autrement, payeur tiers agent, absence de téléphone) ; tests existants alignés

**Pourquoi :**
- Demande porteur : vérifier que les paiements sont des dépôts Mobile Money initiés depuis le numéro de téléphone de l'acteur

**Tests réalisés :**
- Suites abonnements, PawaPay, modules et paiement : vertes

**Points ouverts :**
- Le téléphone enregistré doit être fiable : le formulaire de demande de licence et la fiche pêcheur restent la source ; prévoir une vérification du numéro par code SMS ou premier paiement réussi

---

## [2026-09-20] — Fiche embarcation PIGAP au clic et infobulles en portail

**Ce qui a été construit :**
- `GET /positions/embarcations/{id}/fiche` (`geolocalisation/fiche.py`) : titulaire, licence et statut, couverture d'abonnement, dernière position et signal, statut au port (à quai, en manœuvre, en mer), trajectoire 24 h, zones réglementées touchées, alertes récentes, captures 30 jours, verdict conforme / à vérifier / alerte avec motifs
- Web : tiroir `PirogueDetailDrawer` ouvert au clic sur un marqueur GPS, une ligne de la liste temps réel ou une ligne de présence au port ; trace 24 h dessinée sur la carte ; exclusion mutuelle avec la fiche AIS
- `HelpTip` rendu en portail (`document.body`, position fixe, repositionnement automatique) : les bulles passent au-dessus de la carte et ne sont plus rognées par le panneau défilant

**Pourquoi :**
- Retour porteur en production : le clic sur un navire n'affichait rien (seule la couche AIS, vide en production, ouvrait une fiche) ; les infobulles étaient cachées par la carte

**Tests réalisés :**
- `pytest` fiche (à quai à Owendo, trajectoire, 404) + géolocalisation : 19 passed ; `tsc -b` + `vite build` OK ; vérification visuelle

**Points ouverts :**
- Aucun

---

## [2026-09-20] — Météo-marine : bulletin, zones calculées, alertes automatiques, aides contextuelles

**Ce qui a été construit :**
- Module `meteo_marine` (ADR-008) : houle et maximum 24 h, période, courant de surface, vent et rafales, pluie, visibilité, température de surface, hauteur d'eau et tendance de marée par secteur (8 secteurs du littoral), débit et tendance des fleuves (4 stations GloFAS) ; sources Open-Meteo CC BY 4.0, sans clé, réponse en 0,5 s
- Croisements : captures déclarées 30 jours par secteur, quotas des zones réglementées (pression 75 %, surexploitation 90 %), zones interdites → classes danger / prudence / favorable / surexploitée / ordinaire avec motifs et conseil en langage clair ; risque distinct pirogues / navires
- Alertes automatiques (`anomalie`, règles `meteo_marine`, `crue_fleuve`) par bloc de 6 h, notifications ; `GET /meteo/bulletin`, `/meteo/zones`, `/meteo/avis?lon&lat`
- Web : panneau « État de la mer et des fleuves » (Surveillance / Navires), couche carte « Zones calculées » colorée avec étiquettes, bandeau « Bulletin de mer » du tableau de bord, libellés des nouvelles alertes ; composant `HelpTip` (infobulles pédagogiques et encarts « Comment exploiter ») posé sur le tableau de bord, le panneau mer et les calques
- Mobile : carte « Avis de mer » sur l'accueil pêcheur (niveau, conseil, conditions clés, fleuve proche)

**Pourquoi :**
- Demande porteur : signaler automatiquement risques et opportunités (état de mer, courants, niveaux), présenter zones de danger / favorables / surexploitées par croisement de données, édifier les utilisateurs par des aides contextuelles

**Tests réalisés :**
- `pytest` : 129 passed (9 tests météo : Douglas, risque, opportunité, crue, endpoints, alertes idempotentes) ; instabilité connue de `test_predictions` sur base partagée
- Bulletin réel vérifié : Cap Lopez classé danger (zone interdite de test), sud du littoral en prudence (houle 1,8 à 2 m), estuaire favorable
- `tsc -b` + `vite build` web, `tsc --noEmit` mobile OK

**Points ouverts :**
- Station Komo retirée (cellule GloFAS irréaliste) ; recaler les cellules avec la Direction de la météorologie
- **Correctif déploiement** : l'image Docker du backend ne contenait pas `data/open-data/gabon/` (ZEE, masque d'eau, ports, secteurs) : en production le filtre ZEE rejetait tout et le bulletin était vide. Copie embarquée dans `backend/app/data/gabon/` (`scripts/sync_data.py`), résolution par `app/core/datafiles.py`, test de synchronisation `test_datafiles.py`
- Pas de chlorophylle ni de validation locale des modèles : afficher comme aide à la décision (fait) et comparer avec les observations des pêcheurs en Phase 3

---

## [2026-09-20] — Ergonomie : icônes, abonnements, sidebar repliable, modales, illustrations, responsive, navires

**Ce qui a été construit :**
- Icônes sur tous les boutons et onglets (`HubTabs` exige une icône ; 25 icônes d'action ajoutées ; injection automatique par libellé sur 14 fichiers)
- Page Abonnements refondue : « Licences pêcheurs / Abonnements organisations / Modules par organisation » à la place de B2C / B2B ; indicateurs, filtre et recherche, cartes par contrat (titulaire, formule, montant, échéance, statut lisible), activation en modale, résolution des titulaires hors liste paginée
- Sidebar repliable (bouton, état mémorisé) n'affichant que les icônes ; dépliage temporaire au survol sur écran large
- Formulaires de création en modales illustrées : pêcheur, compte d'équipe, organisation, activation d'abonnement ; en-têtes de page illustrés (Acteurs, Rapports, Équipe, Organisations, Navires, Surveillance) et états vides illustrés ; composant `Illustration` (15 scènes SVG maritimes)
- Responsive tablette et mobile : sidebar en tiroir, vue carte empilée (panneau puis carte), grilles en une colonne, onglets défilants, tiroir navire en bas d'écran, tableaux défilants
- Navires : silhouettes vues de dessus par type (cargo, pétrolier, pêche, passagers, remorqueur, plaisance, pirogue), orientées par le cap, dimensionnées par la longueur, colorées par statut, sillage si en route, étiquette pavillon + nom + statut ; correctif de positionnement des marqueurs et resynchronisation du canevas au redimensionnement ; libellés métier des alertes sur le tableau de bord

**Pourquoi :**
- Retour porteur : boutons et onglets sans icône, vocabulaire B2B/B2C inadapté, onglet Abonnements dégradant la qualité, sidebar à replier, formulaires et filtres à réorganiser, plateforme à illustrer, responsive manquant, navires peu réalistes

**Tests réalisés :**
- `tsc -b` + `vite build` OK ; vérification visuelle desktop (Acteurs, Abonnements, Rapports, Navires, sidebar repliée) et mobile (375 px)

**Points ouverts :**
- Icônes injectées d'après le libellé : à relire ponctuellement (un libellé inhabituel reçoit l'icône par défaut du mot-clé)
- Formulaires Quotas et Zones encore en ligne (pas en modale) : à traiter dans un second lot

---

## [2026-09-20] — Fiche navire AIS, veille golfe de Guinée, navires en approche

**Ce qui a été construit :**
- `GET /ais/vessels/{mmsi}` : fiche navire complète (identification, pavillon UIT via `flags.py`, correspondance registre PIGAP, zones réglementées PostGIS, statut, route récente, position estimée) avec verdict conforme / à vérifier / alerte et motifs
- Zone de veille élargie au golfe de Guinée (`AIS_WIDE_BBOX`) et extrapolation de route (`navigation.py`) : navires hors ZEE annoncés dans `approches` avec heure et point d'entrée prévus (réponse à la question du porteur sur le croisement des signaux nord / sud du golfe)
- Web : fiche navire au clic (marqueurs et listes), trace jaune du navire sélectionné, couche « approche » avec route pointillée jusqu'au point d'entrée, bascule d'emprise Eaux gabonaises / Golfe de Guinée, panneau AIS enrichi (pavillon, approches)
- Carte : fond Carto continu sous l'imagerie Esri (tuiles « Map data not available » en pleine mer au zoom 8 sur le golfe), emprise navigable étendue au golfe de Guinée, vue carte bornée à la hauteur de l'écran (le panneau latéral étirait la carte sur 2 900 px)
- Déployé : backend Railway (route `/ais/vessels/{mmsi}`) et web Vercel ; `AIS_INGEST_KEY` de développement ajoutée au `.env` local pour tester l'ingestion

**Pourquoi :**
- Demande porteur après consultation de Copernicus Marine In Situ : cliquer sur un navire et voir identification, régularité, localisation ; représenter plus largement l'espace maritime gabonais et le golfe ; utiliser les signaux lointains pour anticiper les entrées. Précision apportée : Copernicus In Situ montre des plateformes océanographiques (flotteurs, bouées, navires d'opportunité), pas la flotte de pêche

**Tests réalisés :**
- `pytest` : 121 passed (nouveaux : pavillon MMSI, estime, entrée prévue depuis le Nigeria, approches séparées, fiche navire hors / dans registre, 404)
- `tsc -b` + `vite build` OK ; vérification locale avec trois navires injectés par `/ais/ingest`

**Points ouverts :**
- `test_predictions::test_intrusion_zone_la_plus_frequente_en_tete` instable sur la base de développement partagée (passe isolé), indépendant de ce lot
- Rapprochement registre limité au nom, à l'indicatif et au MMSI : ajouter un champ MMSI / IMO sur les embarcations enregistrées pour une correspondance certaine

---

## [2026-09-20] — Présence au port calculée depuis le GPS PIGAP (sans matériel)

**Ce qui a été construit :**
- `geolocalisation/presence.py` + `GET /positions/presence-ports` : à quai / en manœuvre / en mer / sans signal par embarcation, arrivées et départs sur la fenêtre, rapprochement des déclarations de captures (point de débarquement → port) avec la présence GPS (`coherente` / `incoherente` / `non_verifiable`)
- Référentiel ports partagé AIS / flotte PIGAP ; `port_from_text` (texte libre → port) ; `rayon_quai_km` et correction du port môle de Libreville sur le littoral (9,418 E / 0,387 N)
- Masque d'eau : acceptation des positions GPS dans le rayon de quai des ports hors polygone ZEE (Port-Gentil, Libreville, Mayumba…) — auparavant refusées (`POSITION_HORS_EAU`), ce qui rendait toute présence au port impossible
- Web : `PortPresencePanel` dans la vue Surveillance / Navires (puces par port, liste à quai avec durée, embarcations en mer avec port de départ, déclarations à vérifier), rafraîchi avec le polling live

**Pourquoi :**
- Recommandation retenue par le porteur : pallier l'absence de couverture AIS par le croisement des données déjà détenues (GPS mobile, déclarations), avant tout capteur (Bluetooth, LoRa, radar)

**Tests réalisés :**
- `pytest` : 116 passed (5 nouveaux : quais hors ZEE acceptés, texte → port, à quai / en manœuvre / en mer / départ, déclaration incohérente signalée, auth)
- `tsc -b` + `vite build` OK

**Points ouverts :**
- Rade intérieure de Port-Gentil au-delà de 2,5 km du quai encore hors masque d'eau (polygone portuaire dédié à ajouter)
- Étape suivante de la recommandation : pointage géorepéré et journal de connectivité dans l'application mobile, puis pilote balises Bluetooth / Meshtastic (`source=balise`)

---

## [2026-09-20] — AIS temps réel (ports), numérotation automatique, couche design

**Ce qui a été construit :**
- `ais_gabon` : connexion AISStream permanente + état de flotte accumulé (`fleet.py`, TTL 30/180 min), marge côtière sur la ZEE (Port-Gentil et Owendo inclus), référentiel `ports.json`, statut opérationnel par navire (à quai, au mouillage, en route, en pêche), `GET /ais/ports`, `GET /ais/status`, `POST /ais/ingest` (récepteurs AIS locaux, AIS-catcher JSON ou NMEA via `pyais`)
- Numérotation automatique à l'approbation définitive : table `compteurs` (incrément atomique), `numero_licence_attribue` / `immatriculation_attribuee` sur les demandes, formats paramétrables (`GA-PA-{annee}-{seq:05d}`, `GA-{zone}-{annee}-{seq:04d}`), champ numéro devenu optionnel (web, mobile, API) avec reprise possible d'un numéro papier — migration `b8f2a7d35677`
- Web : couche design `styles/ui-kit.css` (système de boutons unique, suppression des conflits de survol hérités du `button:hover` global et des teintes ocre / turquoise, barre latérale par sections avec état système, transitions de page, modales, toasts, tableaux), panneau `AisPanel` (état du flux, présence par port), libellés professionnels (plus de « semis », « simulateur », « Module Mx », codes bruts d'alerte)

**Pourquoi :**
- Mesure 2026-09-20 : clé AISStream valide (Manche : 64 navires en 15 s) mais 0 message sur le Gabon en 150 s et Open Waters vide → aucune station communautaire sur le littoral gabonais ; la fenêtre de 25 s ne pouvait de toute façon pas voir les navires à quai (émission toutes les 3 min)
- Demande porteur : identifiants attribués automatiquement à l'approbation ; interface jugée non professionnelle (survols, boutons, barre latérale, transitions)

**Tests réalisés :**
- `pytest` backend : 111 passed (18 tests AIS, 7 tests numérotation dont concurrence)
- `tsc -b` + `vite build` web OK ; vérification visuelle (tableau de bord, surveillance, demandes)

**Points ouverts :**
- Raccorder un récepteur AIS physique à Owendo et à Port-Gentil (`AIS_INGEST_KEY`) — sans lui, la présence au port reste vide et l'interface le dit
- Valider les formats de numérotation et les coordonnées des ports avec la DGPA / OPRAG
- ~~Mobile : erreur TypeScript `AbonnementScreen.tsx`~~ corrigée (type `paiement.operateur` ajouté dans `mobile/src/api.ts`) ; test `test_m1_pecheurs` rendu indépendant du volume de la base partagée (nom unique)
- ~~Déployer~~ **Déployé le 2026-09-20** : backend Railway `cbm-pigap` (migration `b8f2a7d35677` exécutée, `pyais` dans l'image, variables `AISSTREAM_API_KEY`, `AIS_INGEST_KEY`, `AIS_COASTAL_BUFFER_DEG` posées) ; web Vercel `cbm-pigap-web` en production. Flux AISStream connecté en prod, 0 message Gabon (attendu sans récepteur local)

---

## [2026-09-18] — PawaPay live (Airtel Money Gabon)

**Ce qui a été construit :**
- Client `pawapay.py` : dépôt `/v2/deposits`, check statut, normalisation MSISDN `241…`
- Mode `MOBILE_MONEY_MODE=live` : init B2C/B2B → push PIN Airtel (AIRTEL_GAB / XAF)
- Webhook `POST /abonnements/webhook/pawapay/deposits` + `POST …/paiements/{id}/synchroniser`
- `GET /abonnements/paiement-config` ; mobile + web attendent le PIN puis poll
- Token `PAWAPAY_API_TOKEN` en env (local + Railway)

**Pourquoi :**
- Paiements réels abonnement / licence au Gabon (hors MVP cahier, demandé porteur)

**Tests réalisés :**
- `pytest test_pawapay.py test_abonnements.py` — 10 passed
- Token prod validé antérieurement (AIRTEL_GAB)

**Points ouverts :**
- Configurer l’URL callback dans le **dashboard PawaPay** :
  `https://cbm-pigap-production.up.railway.app/api/v1/abonnements/webhook/pawapay/deposits`
- Moov Money non couvert par PawaPay Gabon (Airtel seul)

---

## [2026-09-15] — Fix paiement démo B2C (« Paiement introuvable »)

**Ce qui a été construit :**
- `abonnements/service.py` : `await db.commit()` après init / confirmer / webhook / annuler / modules / activer (la session `get_db` ne committait jamais → rollback après 201)
- Mobile Abonnement : licence optionnelle pour le pêcheur (JWT) ; CTA « Payer et activer (demo) »

**Pourquoi :**
- pecheur1 : init OK puis confirmer-demo 404 Paiement introuvable

**Tests réalisés :**
- Local : init + confirmer-demo → abonnement `actif`
- Prod Railway (déployé depuis `backend/`) : même parcours OK

**Points ouverts :**
- Aucun

---

## [2026-09-15] — Mobile multi-rôles (pêcheur / agent)

**Ce qui a été construit :**
- Login → `fetchMe` → shells distincts : PecheurHome vs AgentHome
- BottomNav par rôle ; Captures / Tracking en mode `pecheur` | `agent`
- Refus des rôles web-only (admin, autorité, organisation) avec message clair
- Pas de rebuild Docker (Expo ; API `/auth/me` déjà en place)

**Pourquoi :**
- Demande porteur : pêcheurs et agents doivent avoir des fonctionnalités distinctes sur mobile

**Tests réalisés :**
- `tsc` mobile OK
- Login API local : agent → `agent_controle`, pecheur1 → `pecheur`, admin → refus côté app

**Points ouverts :**
- Persistance SecureStore ; parcours org mobile si besoin Phase 3

---

## [2026-09-15] — Crash mobile + admin B2C + modules B2B + portail org

**Ce qui a été construit :**
- Fix mobile : espaces Unicode / locale / ErrorBoundary / transition sans `exiting` (crash iOS)
- Admin Abonnements : suivi B2C (filtres, activer/annuler), onglet Modules B2B (superadmin)
- Rôle `organisation` + `utilisateurs.organisation_id` ; compte créé à l’approbation personne morale
- Portail org : inscription validée → paiement B2B démo → modules inclus
- Migration `a7e1f6c24566`

**Pourquoi :**
- Demande porteur : crash mobile + gestion B2C + modules par formule + espace org

**Tests réalisés :**
- `pytest` catalog + modules : 6 passed
- `tsc` web + mobile OK

**Points ouverts :**
- Brancher SingPay live ; déployer migration Railway ; UX org élargie (liste pêcheurs détaillée)

---

## [2026-09-15] — Abonnements B2C/B2B + Mobile Money (démo)

**Ce qui a été construit :**
- Module backend `abonnements` : catalogue tarifs, initier B2C/B2B, confirmer-demo, webhook, couverture flotte (anti double facturation), garde optionnelle `ABONNEMENT_ENFORCE`
- Migration Alembic `f6d0e5b13455` ; UI web Acteurs → Abonnements ; mobile écran Abonnement
- ADR-007 (écart cahier §2.2) ; tests catalogue unitaires verts ; tests API PostGIS non exécutés (Docker local down)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Demande explicite monétisation ; réf. `docs/modele-economique.md` ; écart §2.2 documenté ADR-007

**Technologies / principes utilisés :**
- Mobile Money mode `demo` (Airtel/Moov live via webhook plus tard) ; FastAPI + Alembic

**Tests réalisés :**
- `pytest app/tests/test_abonnements_catalog.py` — 3 passed
- `npx tsc --noEmit` (web) OK
- `test_abonnements.py` (API) — bloqué : PostGIS local indisponible

**Points ouverts / dette technique :**
- Brancher SingPay/PViT ; HT/TVA ; activer enforce en Phase 4 ; relancer tests API quand DB up

---

## [2026-09-15] — Modèle économique : abonnements B2C & licences B2B

**Ce qui a été construit :**
- Document [`docs/modele-economique.md`](modele-economique.md) : offre B2C pêcheurs (3 000 FCFA/mois · 30 000 FCFA/an via Mobile Money), grilles B2B Autorité (2,5 M/mois · 25 M/an) et Flotte/Coop (150 k/mois · 1,5 M/an + extras embarcation), packs balises, structure de coûts, scénarios CA, parcours paiement cible V2

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Préparer Phase 3–4 commerciale ; paiement / facturation / abonnement restent **hors MVP** (§2.2) — analyse seule, pas d’implémentation code
- Calibrer le B2B pour absorber balises, sat, hébergement et support dans le contexte gabonais (coexistence NEMO, ADR-005 AIS open)

**Technologies / principes utilisés :**
- Agrégateurs Mobile Money Gabon (cible) : SingPay / PViT / E-Billing ; anti double facturation pêcheur flotte vs indépendant

**Tests réalisés :**
- non exécutés (livrable documentaire)

**Points ouverts / dette technique :**
- Confirmer HT/TTC avec expert-comptable ; partenariat NEMO ; monétisation réelle reportée Phase 4 / V2

---

## [2026-09-15] — Flotte démo allégée + carte / filtres

**Ce qui a été construit :**
- Semis maritime : **1 corridor / bateau** (Espoir, Mondah, Ogooué, Chaloupe Cap Lopez, Mayumba) — plus de téléports multi-scénarios ni `entree_etranger` / `ntem_fleuve` en GPS mobile
- Espacement horodatage **distance-aware** (~12–15 km/h) ; Chaloupe typée `chaloupe` (icône navire)
- Live fleet limitée à 5 routes ; AIS carte : silhouette + badge distincts des pirogues PIGAP
- UI : barre période compacte (dashboard / rapports), toggles carte allégés, FO sans chiffres / carte démo factices

**Pourquoi :**
- Corriger anomalies de position (téléports) et densité de flotte pour une démo lisible côte gabonaise

**Tests réalisés :**
- `npx tsc --noEmit` (web) OK
- Purge DB locale : à relancer quand PostGIS est up (`seed_production_demo` puis `seed_maritime_scenarios`)

**Points ouverts :**
- Docker/PostGIS local indisponible au moment du semis — relancer les scripts seed

---

## [2026-09-10] — Refonte UX FO + Admin (design thinking / PNL)

**Ce qui a été construit :**
- Design system : tokens unifiés, `styles/motion.css`, focus-visible, pulses limités (3 cycles), fond BO calme
- FO : hero épuré (marque + CTA), demande licence en primaire, connexion autorités en secondaire, nav mobile drawer, chiffres démo, skip link, focus trap modal
- Admin : topbar épurée (titre + search + notif, logout sidebar seul), hubs sans double titre
- Dashboard carte-first : KPIs → map+rail (Signaux/Alertes) → Analyse (prédictions, tendances, espèces, journal)

**Pourquoi :**
- Réduire la charge cognitive (chunking PNL), ancrer un signal primaire par écran, motion d’état plutôt que décoration

**Tests réalisés :**
- `npx tsc --noEmit` (web) OK

**Points ouverts :**
- Validation humaine visuelle (Christian) avant gel UI Phase 3

---

## [2026-07-27] — Phase 0 : socle agents, règles, skills et suivi

**Ce qui a été construit :**
- `AGENTS.md` : contrat de travail pour tout agent Cursor
- Sous-agents projet dans `.cursor/agents/` : `module-builder`, `module-verifier`, `backend-geospatial`, `mobile-offline`, `web-dashboard`, `security-auditor`, `journal-keeper`
- Règles Cursor dans `.cursor/rules/` (core, discipline de phase, backend, mobile, web, sécurité, documentation)
- Skills projet : `start-module`, `finish-module`, `update-journal`, `write-adr`, `pigap-status`
- Documents de suivi : `docs/STATUS.md`, ce `JOURNAL.md`, index ADR, checklists Phase 0/DoD
- Hooks Cursor : injection du statut en début de session + rappel de journalisation en fin de tour

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §0 et §11 : le cahier est le contrat agent ↔ porteur ; le journal et le suivi module par module sont obligatoires
- §9 Phase 0 : création du `JOURNAL.md` et amorçage de la discipline avant le code
- §3.1 / §8 : modularité, DoD et commits conventionnels encodés dans les règles et agents

**Technologies / principes utilisés :**
- Cursor Rules (`.mdc`), Skills (`SKILL.md`), Subagents (`.cursor/agents/*.md`), Hooks (`hooks.json`)
- Séparation des responsabilités : construire / vérifier / sécuriser / documenter

**Tests réalisés :**
- Non applicables (pas encore de code applicatif). Vérification structurelle : arborescence créée.

**Points ouverts / dette technique :**
- ~~Initialiser le monorepo (§3.4), docker-compose PostGIS, squelette FastAPI `/health`, CI~~ → traité dans l'entrée suivante
- Décisions Expo vs bare et MapLibre vs Leaflet à trancher en Phase 1 (ADR)

---

## [2026-07-27] — Phase 0 : monorepo, PostGIS, FastAPI `/health`, CI

**Ce qui a été construit :**
- Structure monorepo §3.4 : `backend/`, `mobile/`, `web/`, `infra/`, `.github/workflows/`
- `infra/docker-compose.yml` : PostgreSQL 15 + PostGIS 3.4 (`pigap-db`) + service API optionnel
- Squelette FastAPI (`backend/app/`) : config, logging structlog, session SQLAlchemy async, route `GET /health` → 200
- Tests : `pytest` (`test_health_returns_200` vert) ; lint `ruff` + format `black`
- Pipeline CI GitHub Actions : lint + tests à chaque push/PR sur `main` et `feature/**`
- Dépôt Git local initialisé à la racine du projet ; `.env.example` + `.gitignore`
- Placeholders `mobile/` et `web/` (README) en attendant Phase 1 / M6

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 0 : monorepo, docker-compose PostGIS, squelette `/health`, CI
- §3.2 / §3.4 : stack et arborescence retenues pour le dossier Kimba Connect
- §3.1 sobriété : pas de logique métier avant Phase 1 / M1

**Technologies / principes utilisés :**
- FastAPI, Pydantic Settings, structlog, SQLAlchemy 2 async, GeoAlchemy2 (prêt), Alembic (dossier réservé)
- Docker Compose + image `postgis/postgis:15-3.4`
- GitHub Actions (`actions/setup-python`, ruff, black, pytest)

**Tests réalisés :**
- `ruff check app` : OK
- `black --check app` : OK
- `pytest` : 1 passed (`GET /health` → 200 / `{"status":"ok"}`)
- PostGIS local : `SELECT PostGIS_Version()` → 3.4 (GEOS/PROJ actifs)
- Curl manuel : `http://127.0.0.1:8000/health` → 200

**Points ouverts / dette technique :**
- Écart §3.4 : workflows CI placés en `.github/workflows/` (racine) car GitHub n'exécute pas `infra/.github/workflows/` — pointeur documenté dans `infra/`
- Image PostGIS forcée `platform: linux/amd64` (émulation sur Apple Silicon) — à revoir si une image multi-arch stable convient
- Alembic non initialisé (prévu Phase 1) ; auth JWT pas encore branchée (dès le premier endpoint métier)
- Validation humaine Phase 0 recommandée avant Phase 1

---

## [2026-07-27] — Phase 1 : schéma DB, contrats API, maquettes, ADR

**Ce qui a été construit :**
- Modèles SQLAlchemy §4 : Utilisateur, Pêcheur, Embarcation, Position, ZoneReglementee, Capture, Quota, Alerte (+ `Organisation` minimale pour la FK, + `LogAcces` §7)
- Migration Alembic `34280c301303_initial_schema_phase1` appliquée sur PostGIS local (extension PostGIS créée dans `env.py`)
- Contrats Pydantic M1–M7 + auth/commun (`docs/api-contracts.md`)
- Maquettes basse fidélité : `docs/maquettes/mobile-pecheur.md`, `docs/maquettes/web-dashboard.md`
- ADR-001 (Expo, Proposé) et ADR-002 (MapLibre, Proposé)
- Tests : health + import modèles/contrats (3 passed)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 1 : schéma Alembic, contrats API avant code métier, maquettes, décision mobile
- §4 / §6 / §7 : modèle de données, conventions API, journal d'accès
- §3.1 sobriété : pas de routes métier encore (Phase 2 / M1)

**Technologies / principes utilisés :**
- SQLAlchemy 2 + GeoAlchemy2 (Point/Polygon SRID 4326), Alembic + psycopg
- Pydantic v2 (contrats), UUID comme clés (préparation sync offline M4)
- Filtre Alembic pour ignorer tables système PostGIS/Tiger à l'autogenerate

**Tests réalisés :**
- `alembic upgrade head` : OK (tables métier créées)
- `pytest` : 3 passed
- `ruff` / `black` : OK

**Points ouverts / dette technique :**
- **Validation humaine obligatoire** avant Phase 2 (ADR-001/002, maquettes, liste d'espèces)
- `Organisation` non détaillée au §4 — table minimale `id, nom, date_creation` ajoutée pour la FK
- `NiveauGravite` (`info|attention|critique`) et `ESPECES_MVP` inventés provisoirement — à confirmer
- Auth JWT / hash argon2 : dès le premier endpoint M1
- Index spatiaux créés automatiquement par GeoAlchemy2 (pas de doublon dans la migration)
---

## [2026-07-27] — Phase 1 clôturée + Module M1 : pêcheurs & embarcations

**Ce qui a été construit :**
- Validation humaine Phase 1 : ADR-001 Expo, ADR-002 MapLibre, maquettes, espèces et gravités — **Acceptés**
- ADR-003 : Organisation / société extensible (colonnes stables + `attributs` JSONB)
- Migration `b7e4a1c90211_organisations_robustes_m1`
- Auth JWT + argon2 (`/api/v1/auth/login`, `/me`) + `require_role` sur routes M1
- CRUD organisations, pêcheurs (licence obligatoire), embarcations + recherche `GET /pecheurs?q=`
- App Expo (agent) : login, création pêcheur+embarcation, recherche
- Seed agent fictif : `python scripts/seed_agent.py` (`agent@example.com`)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §9 Phase 1 validation + démarrage Phase 2
- §5.1 acceptation : créer pêcheur + embarcation et retrouver par nom/licence
- §6 / §7 : rôles sur endpoints, hash mots de passe dès le premier endpoint métier
- Demande porteur : organisation extensible sans recréer le schéma (ADR-003)

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy async, Alembic, argon2-cffi, PyJWT, Expo (blank-typescript)
- Erreurs API `{detail, code}` via handler `ApiError`

**Tests réalisés :**
- `pytest` : 6 passed (health, contrats Phase 1, acceptation M1 §5.1, auth 401)
- `ruff` / `black` : OK
- `tsc --noEmit` (mobile) : OK

**Points ouverts / dette technique :**
- Token mobile en mémoire (SecureStore à brancher)
- CI GitHub pas encore exécutée sur dépôt distant
- Parcours pêcheur (hors agent) et offline : M4
- Revue `module-verifier` / `security-auditor` recommandée avant M2

---

## [2026-07-27] — Module M2 : géolocalisation & suivi GPS

**Ce qui a été construit :**
- API positions : `POST /positions`, `POST /positions/batch`, `GET /positions/trajectory` (ordre chrono), filtre période, `GET /geoloc/config` (`gps_interval_minutes`)
- Filtrage d’accès par rôle (pêcheur = ses embarcations ; agent/autorité/admin/chercheur = plus large)
- Tests §5.2 : trajectoire 10 points GPS chronologiques (même si batch désordonné)
- Mobile Expo : écran « Suivi GPS » (permission + envoi périodique + historique)
- Web MapLibre : page trajectoire (filtre embarcation) — ADR-002
- CORS API pour le portail local

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.2 envoi périodique paramétrable, historique carte, acceptation 10 points chrono
- §3.2 / ADR-002 MapLibre ; point d’extension `source=balise` déjà au schéma
- §7 filtrage géoloc par rôle

**Technologies / principes utilisés :**
- PostGIS `ST_AsGeoJSON` + WKT Point 4326, FastAPI, Expo Location, MapLibre GL JS, Vite React

**Tests réalisés :**
- `pytest` : 10 passed (régression M1 + M2)
- `tsc` mobile : OK

**Points ouverts / dette technique :**
- Style tuiles démo MapLibre (remplacer en staging)
- Intervalle GPS en minutes entières (pas de sous-minute en MVP)
- Carte native mobile non embarquée (historique liste + carte web autorités)

---

## [2026-07-27] — M2 (complément) : données open source Gabon

**Ce qui a été construit :**
- Jeux open data sous `data/open-data/gabon/` : ZEE Marine Regions, fleuves OSM, `water_mask.geojson`, corridors `demo_routes_opendata.json`
- `gabon_routes.py` charge le masque réel (plus de polygones inventés) ; script `fetch_gabon_opendata.py` (+ sync web/mobile)
- Attribution / licences : `SOURCES.md` ; décision **ADR-004**
- Dépendance `shapely` pour construction du masque

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Réalisme terrain §5.2 / préparation M3 ; données publiques (pas de secrets, pas de PII)

**Technologies / principes utilisés :**
- Marine Regions EEZ v12 (CC-BY-4.0), OpenStreetMap Overpass (ODbL 1.0), Shapely, GeoJSON

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 11 passed
- `tsc --noEmit` web + mobile : OK

**Points ouverts / dette technique :**
- Overlay EEZ/fleuves sur la carte web (optionnel)
- Enrichir le masque avec polygones `natural=water` si Overpass/miroir stable
- Relancer `seed_maritime_scenarios.py` après redémarrage API pour revoir les trajets

---

## [2026-07-27] — Gate M2 → M3 : revue experts + démarrage M3

**Ce qui a été construit :**
- Revue trajectoires (maritime) : **SATISFAIT** — 13/13 corridors en eau, rejet GPS ville/simulateur OK, Go M3
- Revue pêche artisanale (halieutique) : **RÉSERVES** non bloquantes — Go M3
- Démarrage module **M3** (zones réglementées) : STATUS mis à jour, branche suggérée `feature/m3-zones`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Discipline de phase : ne pas avancer sans validation métier / trajectoire
- §5.3 / §9 : prochain sous-jalon Phase 2

**Technologies / principes utilisés :**
- Sous-agents `maritime-trajectory` + `fisheries-halieutique` ; ADR-004 comme référentiel masque eau

**Tests réalisés :**
- Revue manuelle experts (pas de nouveau run pytest dans cette entrée)

**Points ouverts / dette technique :**
- ~~**Ogooué** : labels / tronçon OSM trop à l’est (près Franceville) au lieu de Lambaréné / embouchure — corriger `_longest_named` / échantillonnage ouest~~ → corrigé (fenêtre lon 8.9–11.3 + Cap Lopez dans UI)
- ~~Exposer `rade_port_gentil` (Cap Lopez) dans le picker mobile/web (`UI_IDS`)~~ → fait
- Buffer fluvial ~4 km un peu permissif en ville berge (MVP acceptable)

---

## [2026-07-27] — Correctif Ogooué / Cap Lopez (dette M2)

**Ce qui a été construit :**
- Sélection Ogooué par fenêtre de longitude (aval Lambaréné ~9–10.3°E, intérieur ~10–11°E) au lieu du plus long segment amont
- Labels UI alignés ; `rade_port_gentil` ajouté au picker mobile/web
- Regen `--offline` des corridors + sync TS

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Réalisme trajectoires §5.2 / revue halieutique avant M3

**Technologies / principes utilisés :**
- Script `fetch_gabon_opendata.py`, OSM Ogooué, Shapely

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 11 passed

**Points ouverts / dette technique :**
- Buffer fluvial ~4 km (MVP)

---

## [2026-07-28] — Correctif UX : carte zones M3 + CRUD licences M1 (web)

**Ce qui a été construit :**
- Page Zones refondue (`web/src/pages/ZonesPage.tsx`) : layout carte MapLibre, polygones colorés par type, création bbox, PATCH actif, clic → détection
- Overlay optionnel « Afficher zones » sur la carte trajectoires
- Page Licences (`web/src/pages/LicencesPage.tsx`) : recherche, création pêcheur+licence, embarcation, dossier/trajectoires (écart §5.1)
- API client enrichi (`list/create/update/delete` pêcheurs, embarcations, create/patch zones)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 : zones exploitables pour autorités/agents (pas seulement liste + textarea)
- §5.1 : création pêcheur + embarcation via l’interface en moins de 2 min

**Technologies / principes utilisés :**
- React/TS, MapLibre GL (ADR-002), styles existants

**Tests réalisés :**
- `pytest app/tests/test_m1_pecheurs.py app/tests/test_m3_zones.py -q` : OK
- `npx tsc --noEmit` dans `web/` : OK

**Points ouverts / dette technique :**
- Pas d’éditeur graphique de polygones (bbox + GeoJSON secondaire suffisent MVP)
- M4 non démarré

---

## [2026-07-28] — UX zones : dessin carte, libellés, superpositions

**Ce qui a été construit :**
- Modes **Voir / Dessiner / Tester** (plus de saisie minLon/maxLat en premier)
- Dessin rectangle en 2 clics + aperçu ; libellés sur carte ; pastilles décalées si zones superposées
- Badge « superposée », centrage liste→carte, popup au clic polygone
- Filtre « actives seulement »

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur : anomalies d’affichage (zones empilées invisibles), prise en main difficile

**Technologies / principes utilisés :**
- MapLibre symbol/fill, React modes UX

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Éditeur polygone libre (N points) hors MVP
- M4 non démarré

---

## [2026-07-28] — Zones ciblées : purge + 3 presets métier

**Ce qui a été construit :**
- `seed_zones_demo.py --reset` : purge test/démo, recrée Mondah (sensible), Cap Lopez (interdite), Lambaréné/Ogooué (protégée) — secteurs séparés
- UI : rappel règle métier, chips presets, « Charger 3 presets », « Purger doublons », refus bbox ≥ ~90 km

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 / zone pilote : polygones ciblés, pas pavage côte + intérieur

**Technologies / principes utilisés :**
- PostGIS zones, MapLibre presets UX

**Tests réalisés :**
- Script `--reset` : 6 purge / 3 créées ; `tsc` web OK

**Points ouverts / dette technique :**
- Validation « sur eau » à la création (optionnel)
- ~~M4 non démarré~~ → démarré (entrée suivante)

---

## [2026-07-28] — Démarrage M4 + rehausse design portail

**Ce qui a été construit :**
- Démarrage module **M4** (déclarations captures, offline-first) — branche `feature/m4-captures`
- Lancement polish UX/UI portail web (login brand-first, tokens, accueil, chrome) en parallèle du build M4

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.4 / §9 : prochain sous-jalon Phase 2
- Retour porteur : plateforme à réhausser avant d’enchaîner

**Technologies / principes utilisés :**
- start-module ; web-dashboard (design) ; module-builder + mobile-offline (M4)

**Tests réalisés :**
- Non encore (démarrage)

**Points ouverts / dette technique :**
- Liste fermée d’espèces à confirmer si absente du cahier (question métier si besoin)
- Sync idempotente mobile ↔ API

---

## [2026-07-28] — Rehausse design portail web

**Ce qui a été construit :**
- Tokens océan (Fraunces + Sora), login brand-first, accueil rail M1–M4, nav pill, sidebars/empty states
- Motion légère (`rise-in`, hover) avec `prefers-reduced-motion`

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur UX/UI avant / pendant M4

**Technologies / principes utilisés :**
- CSS tokens, React (pas de lib UI lourde)

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Appliquer la même langue visuelle au mobile M4

---

## [2026-07-28] — Module M4 : Déclaration & suivi des captures

**Ce qui a été construit :**
- API `/api/v1/captures` (catalog, CRUD, `POST /sync` idempotent via id client)
- Mobile offline-first : SQLite `pending`/`synced`, `CapturesScreen`, badges sync
- Portail web : page lecture Captures
- README module + contrats API

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.4 formulaire + offline + sync sans doublon/perte
- §4 entité Capture ; §9 sous-jalon M4

**Technologies / principes utilisés :**
- FastAPI, PostGIS Point optionnel, Expo SQLite, sync batch

**Tests réalisés :**
- `pytest` M1–M4 + phase1 + health : **30 passed** (dont sync idempotente §5.4)
- module-verifier : **PASS**
- `tsc` mobile + web : OK (annoncé builder)

**Points ouverts / dette technique :**
- Listes espèces/méthodes MVP à valider zone pilote
- Pas de suite Jest mobile (preuve sync côté API)

---

## [2026-07-28] — Gate multi-experts M1–M4 + correctifs

**Ce qui a été construit :**
- Revues : sécu, mobile-offline, halieutique, maritime, design — synthèse **Go M5** (réserves)
- Sécu Haute : anti-IDOR captures, dossier licence filtré pêcheur, DELETE GPS restreint + tests
- CRUD captures web (POST/PATCH/DELETE) pour agents/autorités
- Cache SQLite embarcations mobile (déclaration offline à froid)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §7 filtrage rôles ; §5.4 offline-first terrain ; validation croisée avant M5

**Technologies / principes utilisés :**
- Sous-agents projet ; pytest anti-IDOR ; Expo SQLite cache

**Tests réalisés :**
- `test_security_gate_m1_m4.py` + M2/M4 : verts
- M4 captures (incl. patch/delete) : verts (builder CRUD)

**Points ouverts / dette technique :**
- Valider liste espèces (eau douce Ogooué) avant quotas pilote
- LogAcces, CORS origins, JWT secret non-dev (Moyennes sécu)
- Sync captures encore manuelle ; labels espèces UX
- Buffer fluvial ~4 km

---

## [2026-07-28] — UX landing + illustrations + listes compactes

**Ce qui a été construit :**
- Landing publique (hero Gabon, mockup mobile/web, grille modules illustrés + connexion)
- Icônes modules M1–M4 sur accueil web, nav, en-têtes de pages ; mêmes assets sur accueil mobile
- `CompactList` (« Voir plus ») sur trajectoires, licences, zones, captures, dossier

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Retour porteur : listes trop longues, manque d’illustrations / page d’accueil produit

**Technologies / principes utilisés :**
- Assets `web/public/illustrations` + `mobile/assets/illustrations` ; CSS landing ; React CompactList

**Tests réalisés :**
- `npx tsc --noEmit` web : OK

**Points ouverts / dette technique :**
- Compresser / retailler les PNG icônes (~1 Mo) pour perf mobile
- Landing encore côté SPA (pas de route marketing séparée)

---

## [2026-07-28] — Module M5 : Gestion des quotas

**Ce qui a été construit :**
- API `/api/v1/quotas` (CRUD, `GET /alertes`) ; recalcul `volume_consomme_kg` à chaque capture
- Alertes `depassement_quota` à 90 % / 100 % avec `declencheur` JSON obligatoire
- Portail `QuotasPage` (barres de progression, listes compactes, alertes)
- Fond hero local + polish glass (web) ; ImageBackground mobile
- Icône M5 ; contrats API + README module

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.5 seuils espèce/zone/période, consommation auto, alerte 90 %
- §4 entités Quota + Alerte

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy async, PostGIS `ST_Intersects` (quota zoné), React QuotasPage

**Tests réalisés :**
- `pytest` M1–M5 + sécu + health : **37 passed** (dont acceptation §5.5)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Liste alertes sur page Quotas (M6 dashboard complet plus tard)
- Quota zoné exige position_capture sur la capture

---

## [2026-07-28] — Module M6 : Tableau de bord de pilotage

**Ce qui a été construit :**
- API `GET /api/v1/dashboard` (période) : pêcheurs actifs, volume exact, répartition espèces, alertes nouvelles, zones à forte activité (`ST_Intersects`)
- Portail `DashboardPage` : KPI, barres espèces, alertes, carte MapLibre des foyers
- Design Gabon/Afrique : accents okoumé, motif tressage, copy autorités / Estuaire
- Icône Pilotage ; contrats + README

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.6 indicateurs minimums + acceptation chiffres exacts
- Utilisateurs cibles : autorités et agents (Gabon)

**Technologies / principes utilisés :**
- FastAPI agrégats SQL exacts, MapLibre, CSS tokens okoumé/earth

**Tests réalisés :**
- `pytest` suite : **42 passed** (dont 3 M6 §5.6)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Foyers d’activité = zones réglementées intersectées (pas grille hex libre)
- M7 alertes règles restantes (intrusion auto, tendance 7j)

---

## [2026-07-28] — Module M7 : Alertes intelligentes + shell command-center

**Ce qui a été construit :**
- Règles auto : zone interdite (`ST_Intersects`), dépassement quota (M5), tendance 7j > 2× moyenne hist.
- API `GET/PATCH /api/v1/alertes` ; hooks positions + captures ; `declencheur` obligatoire
- Page Alertes (traiter / ignorer)
- Design réf. command-center : rail icônes desktop, bottom nav mobile, accents or / glass

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.7 trois règles explicites (positif + négatif) ; fin Phase 2 MVP modules

**Technologies / principes utilisés :**
- FastAPI, PostGIS, React rail CSS, Expo BottomNav glass

**Tests réalisés :**
- `pytest` suite : verts (dont 3 M7 §5.7)
- `tsc` web : OK

**Points ouverts / dette technique :**
- Anti-doublon alertes 12 h (fingerprint)
- Dashboard map-first plein écran encore perfectible (panels flottants)

---

## [2026-07-27] — Module M3 : Cartographie des zones réglementées

**Ce qui a été construit :**
- Modèle `ZoneReglementee` + index GIST Alembic ; module `backend/app/modules/zones/`
- API CRUD `/api/v1/zones`, import GeoJSON, détection `POST .../detect/intersection` via PostGIS `ST_Intersects`
- UI web « Zones réglementées » (liste, import, test lon/lat)
- Seed démo fictif Estuaire / Cap Lopez ; contrats dans `docs/api-contracts.md`
- README module

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.3 polygones + intersection PostGIS ; préparation intrusion zone → M7
- §4 entité ZoneReglementee ; §9 sous-jalon M3

**Technologies / principes utilisés :**
- FastAPI, SQLAlchemy 2 async, GeoAlchemy2, PostGIS `ST_Intersects`, React/TS (admin simple)

**Tests réalisés :**
- `pytest` M1+M2+M3+phase1+health : **23 passed** (dont 6 M3 inside/outside §5.3)
- module-verifier : **PASS**

**Points ouverts / dette technique :**
- Pas d’éditeur graphique de polygones (import GeoJSON suffisant §5.3)
- Alertes / `declencheur` réservés à M7
- Filtre période début/fin appliqué après intersection géométrique


## [2026-07-30] — Front office : landing + demandes de licence

**Ce qui a été construit :**
- Landing FO redesignée : hero carousel (3 slides), typo display, fond maritime, structure claire (outils / demande / modules / connexion)
- Formulaire public demande de licence (personne physique ou morale) → `POST /api/v1/demandes-licence`
- Back-office : pages Demandes (liste, approuver, refuser, supprimer) et Organisations (CRUD personnes morales)
- Migration `demandes_licence` ; rail portail « Demandes » / « Organis. »

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Extension M1 (§5.1) : entrée FO pour inscription pêcheurs / orgs avant attribution licence
- Portail autorités (§5.6) : traitement des dossiers côté agents

**Technologies / principes utilisés :**
- FastAPI public + JWT staff ; React landing glass ; CSS FO dédié

**Tests réalisés :**
- `pytest app/tests/test_demandes_licence.py` : **4 passed**
- `tsc` web : OK
- Alembic `upgrade head` : OK (`d4b8e3f91233`)

**Points ouverts / dette technique :**
- Approbation org + pêcheur : commits séparés (risque org orpheline si échec pêcheur)
- Pas de suivi public du statut de demande (n° de dossier)
- Captcha / rate-limit sur POST public à prévoir en Phase 3

## [2026-07-30] — Charte logo, wizard modal & justificatifs

**Ce qui a été construit :**
- Logo CBM-PIGAP intégré (header FO + portail) ; tokens charte marine / bleu / sage
- Demande licence en **wizard modal** (5 étapes) ; connexion autorités en modale
- Upload justificatifs (PDF/JPG/PNG, max 5×5 Mo) via `POST /demandes-licence/with-files`
- BO : téléchargement des pièces jointes sur la fiche demande

**Pourquoi (lien avec le cahier des charges / ce document) :**
- UX FO accessible (§ utilisateurs non experts) ; extension M1 inscription

**Technologies / principes utilisés :**
- Multipart FastAPI, stockage local `uploads/`, JSONB `pieces_jointes`

**Tests réalisés :**
- `pytest app/tests/test_demandes_licence.py` : 4 passed
- `tsc` web : OK

**Points ouverts / dette technique :**
- Stockage local (pas S3) ; antivirus / rate-limit Phase 3

## [2026-07-30] — Notifications temps réel portail

**Ce qui a été construit :**
- API `GET /notifications/summary` + `GET /notifications/stream` (SSE)
- Hub in-process poussé à chaque nouvelle demande / alerte
- Cloche header + badges rail Demandes / Alertes ; pulse sur items en attente
- Correctif FO 404 : `VITE_API_URL` local vide (proxy Vite → :8000) au lieu de Railway obsolète

**Pourquoi (lien avec le cahier des charges / ce document) :**
- Pilotage autorités (§5.6 / §5.7) — file d’attente visible sans rafraîchir

**Technologies / principes utilisés :**
- SSE + poll 12 s de secours ; badges sage charte

**Tests réalisés :**
- `pytest` notifications + demandes : **5 passed**
- `tsc` web : OK

**Points ouverts / dette technique :**
- Hub mono-process (pas Redis) — suffisant MVP / un worker uvicorn

## [2026-07-30] — Messages clairs + notifs + gate experts déploiement

**Ce qui a été construit :**
- Erreurs API FR (backend validation + parseApiError web/mobile) — plus de JSON brut
- Toasts opérations web ; badges notifications exacts ; purge alertes/demandes démo
- FO wizard licence + pièces ; MIME upload durci (type ET extension)
- Mobile : validation MDP 8 car. + messages clairs tous écrans

**Pourquoi :**
- UX non experts (§ utilisateurs) ; préparation publication Phase 3

**Tests réalisés :**
- `pytest` suite : **58 passed**
- Gate experts : Sécurité / Mobile / Web = **GO réserves** (majorité)

**Points ouverts :**
- JWT_SECRET + rate-limit + CORS prod (ops)

## [2026-07-30] — Publication & déploiement

**Ce qui a été construit :**
- Push `main` (`8587241`) sur GitHub
- Web prod Vercel : https://cbm-pigap-web.vercel.app
- API prod Railway redeploy SUCCESS : https://cbm-pigap-production.up.railway.app (`/health` ok ; erreurs validation en string FR)

**Pourquoi :**
- Gate experts majorité GO réserves → publication autorisée

**Tests réalisés :**
- Smoke prod : `/health` ok ; `VALIDATION_ERROR` FR sur login / demandes-licence
- Suite locale antérieure : **58 passed**

**Points ouverts :**
- Renforcer JWT_SECRET, rate-limit POST public, CORS (réserves sécu)

## [2026-09-09] — Refonte UI/UX maquettes + neuroscience

**Ce qui a été construit :**
- Design system FO/BO (tokens navy/primary, sidebar, topbar, KPI, status, hubs)
- Landing FO fidèle maquette (hero, services ×6, mission, chiffres démo, footer)
- Shell BO : IA stricte (Acteurs / Navires / Pêches / Surveillance / Alertes / Rapports / Cartographie / Admin)
- Dashboard dense (KPI, carte, secteurs, alertes, raccourcis, table)
- Hubs Acteurs & Pêches ; Rapports stub KPIs ; Surveillance = carte + zones

**Pourquoi :**
- Alignement maquettes produit + charge cognitive réduite (hiérarchie alertes → carte → KPI)

**Tests réalisés :**
- `npx tsc --noEmit` (web) : OK
- Maritime (routing carte) : **GO** — pas de régression trajectoires à terre

**Points ouverts :**
- Chiffres FO = placeholders démo (pas d’API publique stats)
- Export CSV rapports Phase 3
- Harmoniser titres internes des pages métier (doubles stage-head dans hubs)

---

## [2026-09-09] — Circulation near-live (côte + fleuves)

**Ce qui a été construit :**
- API `GET /api/v1/positions/live` : dernière position par embarcation (eau only, secteur côte/bras/fleuve, statut actif/recent/silence)
- Portail : polling 20 s sur Navires/Surveillance + carte dashboard « temps réel »
- Semis : ping live en fin de corridor ; script `simulate_live_fleet.py` pour avancer la flotte

**Pourquoi :**
- Avant : trajectoires historiques chargées à la demande, pas de vue flotte en circulation
- MVP réaliste sans AIS/IoT (§ hors périmètre) : GPS mobile + corridors open data

**Tests réalisés :**
- `pytest app/tests/test_m2_geoloc.py` : 12 passed
- `tsc --noEmit` (web) : OK

**Points ouverts :**
- Pas de WebSocket positions (polling volontaire)
- AIS / balises = point d’extension `source=balise` seulement

---

## [2026-09-09] — Couche AIS ZEE Gabon (open data)

**Ce qui a été construit :**
- Module `ais_gabon` : poll Open Waters + filtre polygone ZEE Marine Regions
- API `GET /api/v1/ais/live` (rôles autorités) · marqueurs distincts sur Navires
- `AIS_DEMO_WHEN_EMPTY` si flux réel vide (couverture AIS faible au Gabon)
- ADR-005

**Pourquoi :**
- Demande : agréger des données open temps réel limitées au Gabon, sans confondre avec GPS pêcheurs

**Tests réalisés :**
- `pytest` AIS + M2 : 16 passed
- `tsc` web : OK

**Points ouverts :**
- Densifier via AISStream (clé) ou partenariat GFW/CLS
- Pas d’AIS sur pirogues / fleuves (limite physique du signal)

---

## [2026-09-10] — AIS réel : AISStream + snapshot

**Ce qui a été construit :**
- Ingest AISStream (WebSocket) + Open Waters WS/REST, filtre ZEE, snapshot disque
- `AIS_DEMO_WHEN_EMPTY=false` par défaut ; CTA UI si 0 navire
- Script `collect_ais_gabon.py` ; semis GPS live rafraîchi

**Pourquoi :**
- Open Waters REST renvoie 0 sur le Gabon ; besoin d’une source live réelle (clé gratuite AISStream)

**Tests réalisés :**
- `pytest app/tests/test_ais_gabon.py` : 5 passed

**Points ouverts :**
- Christian doit créer `AISSTREAM_API_KEY` sur aisstream.io

---

## [2026-09-10] — Graphiques KPI + moteur de prédiction (ADR-006)

**Ce qui a été construit :**
- `GET /api/v1/dashboard/series` : volumes / espèces / alertes par jour, semaine ou mois (somme = dashboard)
- Module `predictions` : sklearn Ridge / Poisson, horizon 7 ou 30 j — pêches, pénuries, intrusions, zones d’incidents
- Portail : Recharts sur le tableau de bord et page Rapports (saisons sèche / pluies, carte des risques)
- Seed `scripts/seed_series_saisonnieres.py` : 12 mois fictifs + graphe d’intrusions + baisse sardine
- ADR-006 (écart cahier §2.2, prédictions consultatives, pas d’alerte M7 auto)

**Pourquoi (lien avec le cahier des charges / ce document) :**
- §5.6 : indicateurs exacts, désormais aussi en série temporelle
- §2.2 / §5.7 : le ML stocks restait hors MVP ; itération post-MVP actée (ADR-006)

**Technologies / principes utilisés :**
- PostgreSQL `date_trunc`, sklearn Ridge + PoissonRegressor, Recharts, `justification` analogue à `declencheur`

**Tests réalisés :**
- `pytest app/tests/test_dashboard_series.py app/tests/test_predictions.py` : 6 passed
- Régression M1–M7 (dont M2 live, M6, M7) : OK
- `tsc --noEmit` (web) : OK
- Page Rapports : documents PDF/CSV conservés + graphiques saisonniers

**Points ouverts / dette technique :**
- Courbes saisonnières du seed **fictives** — à valider expert halieutique
- Calendrier juin–septembre / octobre–mai : labels d’affichage seulement
- Pas d’export CSV ; pas de prévision AIS (pas d’historique)


---

## [2026-09-10] — Documents officiels (licence, fiche, bilan, rapport)

**Ce qui a été construit :**
- Module `documents` : PDF A4 (bandeau Gabon) pour licence de pêche, fiche d’enregistrement (pêcheur ou demande FO), bilan d’activité, rapport de pilotage
- Export CSV du rapport (dette « export Phase 3 »)
- Portail : page Rapports (4 cartes) ; boutons PDF sur Acteurs → Licences et Demandes
- Journal d’accès `LogAcces` à chaque export

**Pourquoi (lien avec le cahier des charges / ce document) :**
- M1 §5.1 : licence associée au pêcheur — pièce imprimable pour l’agent
- M6 §5.6 : indicateurs exacts du tableau de bord dans un rapport périodique
- §7 : traçabilité des consultations de données nominatives
- Pas un 8ᵉ module métier : génération à partir des données déjà en base

**Technologies / principes utilisés :**
- ReportLab (PDF) ; CSV UTF-8 BOM pour tableur
- Rôles identiques au registre (licence/fiche) et au dashboard (bilan/rapport)
- Période par défaut = 31 jours si non précisée (évite un export de tout l’historique)

**Tests réalisés :**
- `pytest app/tests/test_documents.py` : 5 passed
- Régression M1 / M6 / demandes : 15 passed (avec documents)
- `tsc` : erreurs préexistantes `TrendCharts` / recharts (hors périmètre)

**Points ouverts / dette technique :**
- Les PDF ne sont pas des actes ministériels : mention « usage officiel soumis à validation »
- Modèle graphique à caler avec Kimba Connect (cachet, QR, photo)
- Si l’API locale ne répond plus : relancer `uvicorn` (un export trop large peut bloquer le worker unique)
