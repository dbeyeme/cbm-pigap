# Un appareil, un seul compte pêcheur (lot 10, ADR-012)

## Objectif

Empêcher qu'un même téléphone serve tour à tour à plusieurs comptes de pêcheurs,
et qu'une personne « suive » à la place d'une autre. Le serveur rattache
l'appareil au compte à la connexion, vérifie ce rattachement à chaque envoi de
positions et garde sur chaque position la référence de l'appareil.

Ce que la règle n'empêche pas : laisser le téléphone à terre, ou le confier à
quelqu'un d'autre. Ces cas relèvent des balises, de l'AIS et du contrôle.

## Règles

| Règle | Statut |
|-------|--------|
| R1. Un appareil n'accepte qu'un seul compte pêcheur | Décidée le 2026-11-24 (Christian) |
| R2. Un compte n'est rattaché qu'à un appareil, sauf autorisation d'un agent | Proposé (Christian, DGPA) |
| R3. Une embarcation n'est suivie que par un appareil à la fois | Proposé (Christian, expert halieutique) |
| R4. Le changement de téléphone passe par une libération motivée | Proposé (Christian) |
| R5. Seule une empreinte de l'identifiant est conservée | Proposé (Christian) |
| R6. Les comptes d'agents ne sont pas concernés | Proposé (Christian) |

Paramètres dans `backend/app/data/regles/appareils.json`, relus dès que le
fichier change : fenêtre d'exclusivité (30 minutes), nombre d'appareils par
défaut (1), plafond d'autorisation (3), obligation de l'en-tête (désactivée).

## Contrat

L'application envoie l'en-tête `X-Appareil-Id` (`android:...` ou `install:...`,
16 à 128 caractères) à la connexion et à l'envoi des positions. Le serveur n'en
garde qu'une empreinte calculée avec un secret (`APPAREIL_SECRET`, à défaut le
secret de signature des sessions).

| Moment | Situation | Réponse |
|--------|-----------|---------|
| `POST /auth/login` | Appareil inconnu, compte sans appareil | 200, rattachement créé |
| | Appareil déjà rattaché à ce compte | 200 |
| | Appareil rattaché à un autre compte | 409 `APPAREIL_DEJA_RATTACHE` |
| | Compte rattaché à un autre appareil | 409 `COMPTE_RATTACHE_AUTRE_APPAREIL` |
| `POST /positions`, `/positions/batch` | Appareil non rattaché au compte | 403 `APPAREIL_NON_RATTACHE` |
| | Autre appareil déjà en suivi de l'embarcation | 409 `SUIVI_DEJA_ASSURE` et une alerte |

Sans en-tête, la requête de l'ancienne application est acceptée tant que
`entete_obligatoire` est faux. Les autres rôles ne sont jamais concernés.

## Points d'accès des agents de contrôle et des administrateurs

| Méthode | Chemin | Effet |
|---------|--------|-------|
| GET | `/api/v1/pecheurs/{pecheur_id}/appareils` | Appareils du pêcheur : empreinte abrégée, dates, état |
| POST | `/api/v1/pecheurs/{pecheur_id}/appareils/{appareil_id}/liberation` | Libère l'appareil ; motif obligatoire |
| POST | `/api/v1/pecheurs/{pecheur_id}/appareils/autorisation` | Autorise un appareil de plus ; motif obligatoire |

Contrat détaillé et exemples : `docs/lot-10-appareil-unique-serveur.md`.

## Tester

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_lot10_appareils.py -q
```
