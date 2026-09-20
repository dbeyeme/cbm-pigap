"""Schémas API — AIS eaux gabonaises (couche surveillance, pas GPS pêcheurs)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import PointGeoJSON


class AisVesselRead(BaseModel):
    mmsi: str
    nom: str
    position: PointGeoJSON
    horodatage: datetime = Field(description="Horodatage de la dernière position")
    sog_kn: float | None = Field(None, description="Vitesse (nœuds) si connue")
    cog_deg: float | None = Field(None, description="Route fond (°) si connue")
    heading_deg: float | None = Field(None, description="Cap compas (°) si connu")
    ship_type: str | None = Field(None, description="Code type AIS (message 5/24)")
    type_label: str | None = Field(None, description="Type de navire en français")
    statut_nav: str = Field(
        "inconnu",
        description="a_quai · au_mouillage · en_route · en_peche · … (voir ports.STATUT_NAV_FR)",
    )
    statut_nav_code: int | None = None
    destination: str | None = None
    imo: str | None = None
    callsign: str | None = None
    longueur_m: float | None = None
    port_id: str | None = None
    port_proche: str | None = Field(None, description="Port dont le rayon contient le navire")
    distance_port_km: float | None = None
    age_s: int = Field(0, description="Ancienneté de la dernière position (secondes)")
    provider: str = "aisstream"
    demo: bool = Field(False, description="True si marqueur de démonstration")
    pavillon: str | None = Field(None, description="État du pavillon déduit du MMSI (UIT)")
    pavillon_code: str | None = None
    dans_eaux_gabon: bool = Field(True, description="False = zone de veille élargie (approche)")
    entree_prevue_h: float | None = Field(
        None, description="Heures avant l'entrée prévue dans les eaux gabonaises (estime)"
    )
    entree_prevue_position: PointGeoJSON | None = None
    position_estimee: PointGeoJSON | None = Field(
        None, description="Position extrapolée à l'instant présent si le navire faisait route"
    )


class AisTrackPoint(BaseModel):
    horodatage: datetime
    position: PointGeoJSON
    sog_kn: float | None = None
    cog_deg: float | None = None


class AisRegistreCorrespondance(BaseModel):
    embarcation_id: str
    embarcation_nom: str
    immatriculation: str
    pecheur_nom: str | None = None
    numero_licence: str | None = None
    statut_pecheur: str | None = None
    organisation: str | None = None
    methode: str = Field(..., description="nom | immatriculation | mmsi")


class AisZoneTouchee(BaseModel):
    id: str
    nom: str
    type: str


class AisVesselDetail(BaseModel):
    vessel: AisVesselRead
    track: list[AisTrackPoint] = Field(default_factory=list)
    zones_reglementees: list[AisZoneTouchee] = Field(default_factory=list)
    registre: AisRegistreCorrespondance | None = None
    regularite: str = Field("conforme", description="conforme | a_verifier | alerte")
    motifs: list[str] = Field(default_factory=list)
    libre_immatriculation: bool = False


class AisStreamStatus(BaseModel):
    provider: str = "aisstream"
    configured: bool = Field(False, description="Clé API présente")
    connected: bool = False
    since: datetime | None = None
    last_message_at: datetime | None = None
    messages: int = 0
    reconnects: int = 0
    last_error: str | None = None


class AisPortSummary(BaseModel):
    id: str
    nom: str
    type: str
    lon: float
    lat: float
    rayon_km: float
    navires: int = 0
    a_quai: int = 0
    au_mouillage: int = 0
    en_route: int = 0
    en_peche: int = 0


class AisPortDetail(AisPortSummary):
    vessels: list[AisVesselRead] = Field(default_factory=list)


class AisLiveResponse(BaseModel):
    enabled: bool
    vessels: list[AisVesselRead]
    fetched_at: datetime | None = None
    source: str
    note: str = ""
    eez_filter: bool = True
    stream: AisStreamStatus | None = None
    ports: list[AisPortSummary] = Field(default_factory=list)
    recepteurs_locaux: int = Field(0, description="Récepteurs AIS locaux actifs (15 min)")
    approches: list[AisVesselRead] = Field(
        default_factory=list,
        description="Navires hors eaux gabonaises dont la route prévoit une entrée",
    )


class AisPortsResponse(BaseModel):
    fetched_at: datetime
    ports: list[AisPortDetail]


class AisIngestPayload(BaseModel):
    """Messages d'un récepteur AIS local (AIS-catcher JSON ou NMEA brut)."""

    recepteur: str | None = Field(
        None, max_length=64, description="Identifiant du récepteur (ex. owendo-quai-1)"
    )
    messages: list[dict[str, Any]] | None = Field(
        None, description="Messages décodés au format JSON AIS-catcher"
    )
    nmea: list[str] | None = Field(None, description="Phrases NMEA brutes !AIVDM / !AIVDO")


class AisIngestResult(BaseModel):
    recus: int
    integres: int
    hors_zone: int
    erreurs: int
    flotte: int
