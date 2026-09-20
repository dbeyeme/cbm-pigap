"""Enums métier alignés sur le cahier §4."""

import enum


class RoleUtilisateur(enum.StrEnum):
    pecheur = "pecheur"
    agent_controle = "agent_controle"
    autorite = "autorite"
    chercheur = "chercheur"
    admin = "admin"
    organisation = "organisation"


class StatutPecheur(enum.StrEnum):
    actif = "actif"
    suspendu = "suspendu"


class SourcePosition(enum.StrEnum):
    mobile = "mobile"
    balise = "balise"  # point d'extension V2 (hors MVP IoT)


class TypeZone(enum.StrEnum):
    interdite = "interdite"
    protegee = "protegee"
    sensible = "sensible"


class TypeAlerte(enum.StrEnum):
    zone_interdite = "zone_interdite"
    depassement_quota = "depassement_quota"
    anomalie = "anomalie"


class NiveauGravite(enum.StrEnum):
    info = "info"
    attention = "attention"
    critique = "critique"


class StatutAlerte(enum.StrEnum):
    nouvelle = "nouvelle"
    traitee = "traitee"
    ignoree = "ignoree"


class TypeDemandeLicence(enum.StrEnum):
    personne_physique = "personne_physique"
    personne_morale = "personne_morale"


class StatutDemandeLicence(enum.StrEnum):
    en_attente = "en_attente"
    approuvee = "approuvee"
    refusee = "refusee"


class CanalAbonnement(enum.StrEnum):
    b2c = "b2c"
    b2b_autorite = "b2b_autorite"
    b2b_flotte = "b2b_flotte"


class PeriodeAbonnement(enum.StrEnum):
    mensuel = "mensuel"
    annuel = "annuel"


class CodeOffreAbonnement(enum.StrEnum):
    b2c_mensuel = "b2c_mensuel"
    b2c_annuel = "b2c_annuel"
    b2b_autorite_mensuel = "b2b_autorite_mensuel"
    b2b_autorite_annuel = "b2b_autorite_annuel"
    b2b_flotte_mensuel = "b2b_flotte_mensuel"
    b2b_flotte_annuel = "b2b_flotte_annuel"


class StatutAbonnement(enum.StrEnum):
    brouillon = "brouillon"
    en_attente_paiement = "en_attente_paiement"
    actif = "actif"
    expire = "expire"
    annule = "annule"


class StatutPaiement(enum.StrEnum):
    initie = "initie"
    en_attente = "en_attente"
    reussi = "reussi"
    echoue = "echoue"
    expire = "expire"


class OperateurMobileMoney(enum.StrEnum):
    airtel_money = "airtel_money"
    moov_money = "moov_money"
    demo = "demo"
