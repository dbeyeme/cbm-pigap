"""Schémas — bulletin météo-marine, fleuves, zones calculées (risque / opportunité)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ConditionsMer(BaseModel):
    horodatage: datetime
    houle_m: float | None = Field(None, description="Hauteur significative des vagues (m)")
    houle_max_24h_m: float | None = None
    houle_direction_deg: float | None = None
    periode_s: float | None = None
    courant_noeuds: float | None = Field(None, description="Vitesse du courant de surface (nœuds)")
    courant_direction_deg: float | None = None
    vent_noeuds: float | None = None
    rafales_noeuds: float | None = None
    rafales_max_24h_noeuds: float | None = None
    vent_direction_deg: float | None = None
    pluie_mm_h: float | None = None
    visibilite_km: float | None = None
    temperature_mer_c: float | None = None
    niveau_mer_m: float | None = Field(
        None, description="Hauteur d'eau par rapport au niveau moyen (m)"
    )
    maree: str | None = Field(None, description="montante | descendante | etale")
    prochaine_pleine_mer: datetime | None = None
    prochaine_basse_mer: datetime | None = None
    etat_mer: str = Field("inconnu", description="Échelle de Douglas : calme … très forte")


class RisqueSecteur(BaseModel):
    niveau_pirogue: str = Field(
        "vert", description="vert | orange | rouge (embarcations artisanales)"
    )
    niveau_navire: str = Field("vert", description="vert | orange | rouge (navires pontés)")
    motifs: list[str] = Field(default_factory=list)


class OpportuniteSecteur(BaseModel):
    score: int = Field(0, ge=0, le=100)
    classe: str = Field(
        "neutre", description="favorable | prudence | surexploitee | danger | neutre"
    )
    motifs: list[str] = Field(default_factory=list)
    captures_30j_kg: float = 0
    sorties_30j: int = 0
    quota_max_taux: float | None = Field(
        None, description="Taux de consommation max des quotas du secteur"
    )
    especes_sous_pression: list[str] = Field(default_factory=list)


class SecteurBulletin(BaseModel):
    id: str
    nom: str
    type: str
    lon: float
    lat: float
    rayon_km: float
    conditions: ConditionsMer
    risque: RisqueSecteur
    opportunite: OpportuniteSecteur
    conseil: str = Field("", description="Avis en langage clair pour les pêcheurs")


class FleuveBulletin(BaseModel):
    id: str
    nom: str
    fleuve: str
    lon: float
    lat: float
    debit_m3s: float | None = None
    debit_j3_m3s: float | None = None
    debit_max_7j_m3s: float | None = None
    tendance: str = Field("stable", description="hausse | baisse | stable")
    variation_pct: float | None = None
    niveau: str = Field("normal", description="bas | normal | haut | crue")
    conseil: str = ""


class BulletinMeteoMarine(BaseModel):
    genere_a: datetime
    valide_jusqua: datetime
    source: str = "Open-Meteo (Marine, Prévisions, Flood / GloFAS) · CC BY 4.0"
    disponible: bool = True
    note: str = ""
    synthese: str = ""
    secteurs: list[SecteurBulletin] = Field(default_factory=list)
    fleuves: list[FleuveBulletin] = Field(default_factory=list)
    alertes_emises: int = 0


class ZoneCalculee(BaseModel):
    id: str
    nom: str
    classe: str
    niveau_pirogue: str
    score: int
    motifs: list[str]
    centre: list[float] = Field(description="[lon, lat]")
    rayon_km: float
    polygone: list[list[float]] = Field(description="Anneau [[lon, lat], …] approximant le secteur")


class ZonesCalculeesResponse(BaseModel):
    genere_a: datetime
    zones: list[ZoneCalculee]
    legende: dict[str, str]


class AvisMer(BaseModel):
    secteur: SecteurBulletin | None
    distance_km: float | None
    fleuve_proche: FleuveBulletin | None = None
    message: str
    niveau: str
