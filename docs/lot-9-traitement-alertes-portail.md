# Lot 9, partie portail : traitement des alertes

- **Statut :** compte rendu interne, projet soumis à validation humaine
- **Date :** 2026-11-26
- **État :** présent en code dans `web/`, non commité ; s'appuie sur la partie serveur (`lot-9-traitement-alertes-serveur.md`)

## 1. Compréhension

La page Alertes ne connaissait que trois boutons (traiter, ignorer) sans commentaire ni auteur. La description se limitait au déclencheur technique.

Les cinq états et le commentaire obligatoire restent « Proposé » (`alertes_traitement.json`).

## 2. Ce qui est livré

| Sujet | Après |
|-------|-------|
| Liste | Titre et résumé calculés par le serveur ; filtre par état de traitement (ouvertes par défaut) |
| Détail | Description lisible (quand, où, règle, données) |
| Traitement | Choix d'un état permis, commentaire obligatoire, bouton Enregistrer |
| Journal | État avant / après, date, nom de l'auteur, commentaire |
| Chercheur | Lecture de la liste, pas du journal nominatif ni du formulaire |

L'ancien point d'accès `PATCH /alertes/{id}` n'est plus appelé par le portail ; il reste sur le serveur.
