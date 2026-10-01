# Exploitation du rapport d'étude « PêcheGabon Hub » (NTSAGUI Digital, 1er octobre 2026)

> Source : rapport d'étude NTSAGUI-2026-PGH-001, étude du dépôt `okatech-org/peche-gabon-hub`
> (prototype généré du 7 au 15 novembre 2025), transmis par le porteur le 2026-10-01.
> Objet de cette note : ce que le rapport nous apprend du métier et des données de
> l'administration, ce que PIGAP fait déjà, ce qui a été ajouté le 2026-10-01 et ce qui reste à faire.
> Les chiffres cités proviennent du rapport, lui-même fondé sur les tableurs 2024-2025 de
> l'administration des pêches pour le Grand Libreville ; ils restent à valider par la DGPA.

---

## 1. Ce que le rapport apporte

| Domaine | Enseignement | Chiffres clés (rapport) |
|---|---|---|
| Acteurs | 21 rôles en six familles : gouvernance (Ministre, directions), administration (DGPA, DGMM, COREP), contrôle (ANPA, AGASA, OPRAG, ANPN, DGDDI, inspecteur), terrain (pêcheur, coopérative, agent de collecte, observateur embarqué), industrie (armement), système | 8 espaces actifs sur 21, six rôles sans écran |
| Espèces | 26 espèces et une rubrique « Divers », classées en pélagiques, démersaux, crustacés ; la sardine domine | 15 555 t estimées en 2024, sardine 65,9 % ; pélagiques 83,8 % |
| Engins | 9 engins observés dans les dossiers d'autorisation | filet à sardine 365 dossiers, filet maillant de fond 239, filet multifilament 169 |
| Flotte | pirogues en bois à 93 %, moteur Yamaha 40 CV dans 877 dossiers sur 906, année médiane de construction 2012 | 605 pirogues distinctes, préfixes OW, L, AK, CC, KG |
| Propriétaires | majorité d'étrangers | 441 nationaux, 465 étrangers (Nigéria 345, Bénin 104) |
| Territoire | trois strates (Aviation, Libreville, Owendo) et une trentaine de sites de débarquement | Ozoungué 169 dossiers, Grande Poubelle 134, Capal 107 |
| Taxes | autorisation annuelle par pirogue ; taxe à la production au kilo payée au Trésor par quittance ; licence industrielle en euros | autorisations 2024 : 382 pour 48,1 M FCFA ; 2025 : 524 pour 67,4 M FCFA ; taxe 2024 : 5 294 t, 53,26 M FCFA |
| Barème taxe | sardines 5 FCFA/kg, autres pélagiques 10, démersaux 25, crustacés environ 78 | taux effectif 7,5 à 20,7 FCFA/kg selon le mélange d'espèces |
| Effort | tableau de bord 2024 du Grand Libreville | 27 604 débarquements, 46 802 jours de pêche, 147 kg par jour, valeur 4,90 milliards FCFA |
| Contrôle | chaîne mission, contrôle, infraction, sanction ; huit modèles de workflow entre institutions avec délais | signalement d'infraction en 1 jour, validation de licence en 5 jours |
| Points d'attention | données personnelles publiées, comptes de démonstration ouverts, taxes recalculées après paiement, barèmes sans base réglementaire, aucun test | quatre défauts critiques |

## 2. Confrontation avec PIGAP, domaine par domaine

| Domaine demandé | PIGAP avant le 2026-10-01 | Apport du rapport | Décision |
|---|---|---|---|
| Tarifs et redevances | abonnements PIGAP seulement ; aucune redevance publique | barèmes réels d'autorisation et de taxe à la production, circuit quittance | **Livré** : module redevances (taxe calculée une fois, quittance, paiement Mobile Money, paiement groupé coopérative, PDF avec QR code), montant d'autorisation calculé à l'approbation |
| Utilisateurs | six rôles (pêcheur, agent, autorité, chercheur, admin, organisation) | 21 rôles, dont agent de collecte, observateur embarqué, armement, institutions de contrôle | **Partiel** : nationalité du propriétaire ajoutée ; les rôles institutionnels seront portés par un attribut « institution » de l'utilisateur (feuille de route) |
| Processus métier | déclaration, quotas, alertes, présence au port | départ, retour, déclaration, taxe, quittance, répartition ; rappel 2 h après le retour | **Livré** : rappel automatique de déclaration après retour au port détecté par GPS ; la répartition des recettes n'est pas implémentée faute de texte |
| Contrôle | alertes seulement | missions, contrôles, infractions, QR de licence, workflows | **Livré** : missions, contrôles, infractions avec alerte, vérification de licence par QR code (page publique sans donnée personnelle) ; workflows inter-institutions en feuille de route |
| Alertes | zone interdite, quota, activité inhabituelle, météo, crue, limite, concentration | rappel de déclaration, licence expirée, espèce protégée, infraction | **Livré** : quatre règles supplémentaires |
| Géolocalisation | GPS mobile, AIS, présence au port, limites | sites de débarquement, strates, aucune donnée AIS dans le prototype | **Livré** : sites de débarquement en référentiel, site d'attache et strate sur l'embarcation ; PIGAP conserve son avance (AIS, présence, hors-ligne) |
| Quotas | quotas par espèce, zone, période, alerte 90 % | objectifs annuels et mensuels par pirogue, aucune règle automatique dans le prototype | **Conservé** ; objectif par pirogue en feuille de route |
| Espèces | sept espèces de pilote | 26 espèces avec groupe officiel et production 2024 | **Livré** : référentiel complet, alias des anciens codes, espèces protégées, prix moyens 2024 |
| Abonnement | B2C, Flotte, Autorité | prototype sans abonnement, paiement simulé | **Conservé** ; paiement partagé entre abonnements et quittances |
| KPI | pêcheurs actifs, volume, espèces, foyers d'activité, alertes | débarquements, jours de pêche, kg par jour, valeur, taxe due, licences | **Livré** : indicateurs d'effort, valeur estimée (prix moyens 2024), taxes, licences expirées, contrôles ; répartition par groupe, engin et site |

## 3. Leçons retenues des défauts du prototype étudié

| Défaut constaté dans le prototype | Réponse dans PIGAP |
|---|---|
| Données personnelles de 906 dossiers publiées dans le dépôt | aucune donnée réelle dans le dépôt ; le référentiel ne contient que des agrégats ; page publique de vérification sans donnée personnelle |
| Comptes de démonstration ouverts avec mot de passe dans le code | comptes créés par scripts hors dépôt, secrets dans les variables d'environnement |
| Taxes recalculées à chaque modification, paiements effacés | taxe calculée une seule fois à l'insertion ; capture figée dès qu'elle est quittancée ; paiement jamais recalculé |
| Barèmes sans base réglementaire, répartition arbitraire | barèmes marqués « à valider DGPA », référence de texte à renseigner, aucune répartition sans texte |
| Paiement « payé » depuis le navigateur sans contrôle | paiement par fonction serveur, Mobile Money depuis le numéro enregistré de l'acteur, confirmation démo tracée |
| Aucun test | suites de tests sur chaque module (taxe, quittance, contrôle, alertes) |
| Six rôles sans écran, libellés d'institutions incohérents | référentiel unique des institutions à établir avant d'ajouter des rôles |

## 4. Feuille de route issue du rapport

1. **Institutions et rôles** : attribut « institution » (DGPA, ANPA, AGASA, ANPN, DGMM, DGDDI, direction provinciale) sur les comptes agents et autorités, avec filtrage des vues.
2. **Workflows inter-institutions** : signalement d'infraction, demande de contrôle sanitaire, validation de licence, avec délais cibles.
3. **Objectifs de capture par pirogue** et taux de réalisation (quotas individuels).
4. **Pêche industrielle** : navires, armements et marées, en complément de la fiche AIS existante.
5. **Rappels par SMS** avant échéance de licence et de quittance (budget opérateur à prévoir).
6. **Interface en anglais** sur mobile : 75 % des propriétaires sont étrangers, majoritairement nigérians et béninois.
7. **Validation DGPA** des référentiels (espèces, engins, sites, barèmes) et chargement des strates et sites officiels.
