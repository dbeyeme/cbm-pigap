"""Contrats API de l'essai Global Fishing Watch (ADR-011).

Chaque réponse porte la période demandée, la date de fraîcheur des données et
la mention d'attribution exigée par l'éditeur. Les libellés parlent de « pêche
apparente » et d'indice : une estimation, jamais une infraction constatée.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class PeriodeGfw(BaseModel):
    """Bornes transmises telles quelles à l'éditeur (dates UTC)."""

    debut: date
    fin: date


class AttributionGfw(BaseModel):
    mention: str = Field(..., description="À afficher sur tout écran qui montre ces données")
    lien: str


class ZoneGfw(BaseModel):
    identifiant: int
    jeu: str
    nom: str


class FraicheurGfw(BaseModel):
    donnees_jusqu_au: date = Field(
        ..., description="Dernier jour publié par l'éditeur, compte tenu de son retard"
    )
    retard_publication_heures: int
    recupere_a: datetime = Field(..., description="Date de la réponse de l'éditeur")
    en_cache: bool = Field(..., description="Réponse resservie sans nouvel appel à l'éditeur")
    perime: bool = Field(
        False, description="Réponse ancienne resservie parce que l'éditeur ne répond pas"
    )
    periode_incomplete: bool = Field(
        ..., description="La période demandée dépasse le dernier jour publié"
    )
    resultat_partiel: bool = Field(
        False, description="L'éditeur annonce une suite de résultats que la plateforme n'a pas lue"
    )


class EnteteGfw(BaseModel):
    """Bloc commun à toute réponse : période, fraîcheur, attribution, zone, mise en garde."""

    periode: PeriodeGfw
    fraicheur: FraicheurGfw
    attribution: AttributionGfw
    zone: ZoneGfw
    avertissement: str


class EtatGfw(BaseModel):
    active: bool
    jeton_configure: bool
    zone: ZoneGfw
    attribution: AttributionGfw
    retard_publication_heures: dict[str, int]
    cache_heures: float
    statut: str = Field(..., description="Statut du paramétrage de l'essai")
    version: str


# --- Pêche apparente ---------------------------------------------------------- #


class HeuresMois(BaseModel):
    mois: str = Field(..., description="AAAA-MM")
    heures: float


class HeuresPavillon(BaseModel):
    pavillon: str | None = Field(None, description="Code du pavillon donné par l'éditeur")
    heures: float


class PecheApparenteRead(EnteteGfw):
    total_heures: float
    par_mois: list[HeuresMois]
    par_pavillon: list[HeuresPavillon]


# --- Navires observés --------------------------------------------------------- #


class NavireObserve(BaseModel):
    vessel_id: str | None = Field(None, description="Identifiant du navire chez l'éditeur")
    nom: str | None = None
    pavillon: str | None = None
    mmsi: str | None = None
    numero_omi: str | None = None
    indicatif: str | None = None
    engin: str | None = None
    heures: float = Field(..., description="Heures de pêche apparente sur la période")
    premiere_entree: datetime | None = None
    derniere_sortie: datetime | None = None


class NaviresObservesRead(EnteteGfw):
    total_heures: float
    nb_navires: int
    navires: list[NavireObserve]


# --- Détections radar --------------------------------------------------------- #


class DetectionsMois(BaseModel):
    mois: str
    detections: int


class DetectionsPavillon(BaseModel):
    pavillon: str | None = Field(
        None, description="Pavillon quand la détection est rapprochée d'un navire émetteur"
    )
    detections: int


class DetectionsRadarRead(EnteteGfw):
    total_detections: int
    par_mois: list[DetectionsMois]
    par_pavillon: list[DetectionsPavillon]


# --- Évènements de pêche apparente (points sur la carte) ---------------------- #


class EvenementPeche(BaseModel):
    """Un épisode de pêche apparente, avec un lieu pour le poser sur la carte."""

    id: str
    vessel_id: str | None = None
    nom: str | None = None
    pavillon: str | None = None
    mmsi: str | None = None
    numero_omi: str | None = None
    indicatif: str | None = None
    engin: str | None = None
    heures: float = 0
    debut: datetime | None = None
    fin: datetime | None = None
    longitude: float
    latitude: float


class EvenementsPecheRead(EnteteGfw):
    total: int
    nb_affiches: int
    evenements: list[EvenementPeche]


# --- Fiche d'identité d'un navire ---------------------------------------------- #


class RegistreNavire(BaseModel):
    """Ce que disent les registres publics réunis par l'éditeur."""

    nom: str | None = None
    pavillon: str | None = None
    mmsi: str | None = None
    numero_omi: str | None = None
    indicatif: str | None = None
    engins: list[str] = Field(default_factory=list)
    longueur_m: float | None = None
    jauge_brute: float | None = None
    du: datetime | None = None
    au: datetime | None = None


class EmissionNavire(BaseModel):
    """Ce que le navire déclare lui-même en émettant (AIS)."""

    vessel_id: str | None = None
    nom: str | None = None
    pavillon: str | None = None
    mmsi: str | None = None
    numero_omi: str | None = None
    indicatif: str | None = None
    premiere_emission: datetime | None = None
    derniere_emission: datetime | None = None


class ProprietaireNavire(BaseModel):
    nom: str | None = None
    pavillon: str | None = None
    du: datetime | None = None
    au: datetime | None = None
    sources: list[str] = Field(default_factory=list)


class AutorisationNavire(BaseModel):
    sources: list[str] = Field(default_factory=list)
    du: datetime | None = None
    au: datetime | None = None


class FraicheurIdentite(BaseModel):
    recupere_a: datetime
    en_cache: bool
    perime: bool = False


class IdentiteNavireRead(BaseModel):
    vessel_id: str
    registre: list[RegistreNavire]
    emission: list[EmissionNavire]
    proprietaires: list[ProprietaireNavire]
    autorisations: list[AutorisationNavire]
    fraicheur: FraicheurIdentite
    attribution: AttributionGfw
    avertissement: str
