"""Enums métier alignés sur le cahier §4."""

import enum


class RoleUtilisateur(enum.StrEnum):
    pecheur = "pecheur"
    agent_controle = "agent_controle"
    autorite = "autorite"
    chercheur = "chercheur"
    admin = "admin"


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
