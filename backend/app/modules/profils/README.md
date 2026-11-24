# Page de profil d'un acteur (lot 2 du chantier de novembre 2026)

## Objectif

Donner à chaque pêcheur et à chaque organisation une page de présentation :
texte court, espèces pêchées et, si l'acteur le décide, ses tarifs.

## Règles

| Règle | Statut |
|-------|--------|
| Page visible des personnes connectées ; ouverture au public par lien ou QR code, désactivée au départ | Décidée le 2026-11-24 (Christian) |
| Tarifs facultatifs, par espèce, au kilo ou à l'unité, en francs CFA, affichés si l'acteur le décide | Décidée le 2026-11-24 (Christian) |
| Espèces tirées des captures déclarées, l'acteur pouvant en masquer | Proposé (Christian, DGPA) |
| Espèce protégée : ni affichée, ni tarifée | Proposé (Christian, DGPA) |
| Espèce inconnue du référentiel : jamais affichée ; sans référentiel ou sans liste des espèces protégées, ni espèce ni tarif | Décidée le 2026-11-24 (Christian) |
| Tarif d'une espèce masquée : non affiché | Décidée le 2026-11-24 (Christian) |
| Présentation sans coordonnée : adresse électronique, adresse de site, longue suite de chiffres refusées à la saisie | Décidée le 2026-11-24 (Christian) |
| Acteur suspendu, désactivé ou à la licence expirée : page lisible de lui seul | Décidée le 2026-11-24 (Christian) |
| Version publique sans aucune coordonnée personnelle, servie seulement pour un acteur actif | Proposé (Christian) |

Paramètres dans `backend/app/data/regles/profil_acteur.json`, relus dès que le
fichier change : fenêtre des captures (365 jours), nombre d'espèces (12),
longueur de la présentation (600 caractères), contrôle des coordonnées dans
la présentation et son seuil (six chiffres à la suite), nombre de tarifs (30),
unités.

Aucun champ de la page ne porte de coordonnée (téléphone, e-mail, adresse), ni
numéro de licence, ni immatriculation, dans aucune de ses vues. Le texte de
présentation est libre : il est contrôlé à la saisie, ce qui réduit le risque
sans le supprimer. C'est du texte brut : l'interface l'affiche tel quel,
jamais comme du code de page.

Échec fermé : si le référentiel des espèces manque sur le serveur (image
déployée sans `data/`, voir `scripts/sync_data.py`), la page ne montre ni
espèce ni tarif, et le journal porte `profil_referentiel_especes_indisponible`.

## Points d'accès

| Méthode | Chemin | Rôles | Effet |
|---------|--------|-------|-------|
| GET | `/api/v1/profils/moi` | pêcheur, organisation | Ma page et mes réglages |
| PATCH | `/api/v1/profils/moi` | pêcheur, organisation | Présentation, espèces masquées, tarifs, affichage des tarifs, ouverture au public |
| GET | `/api/v1/profils/moi/qr` | pêcheur, organisation | QR code du lien public (SVG) ; 409 tant que la page est fermée |
| GET | `/api/v1/profils/pecheurs/{pecheur_id}` | tout compte connecté | Page d'un pêcheur |
| GET | `/api/v1/profils/organisations/{organisation_id}` | tout compte connecté | Page d'une organisation |
| GET | `/api/v1/public/profils/{jeton}` | aucun (public) | Vitrine publique, si l'acteur l'a ouverte |

Contrat détaillé et exemples : `docs/lot-2-profil-serveur.md`.

## Tester

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_lot2_profil.py -q
```
