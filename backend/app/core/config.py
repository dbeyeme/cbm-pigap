"""Configuration applicative (pydantic-settings)."""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _to_asyncpg_url(url: str) -> str:
    """Railway/Heroku exposent postgresql:// ; SQLAlchemy async exige asyncpg."""
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://pigap:pigap_dev_change_me@localhost:5432/pigap"
    jwt_secret: str = "change-me-in-production-use-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    # M2 — intervalle d'envoi GPS (minutes), paramétrable §5.2
    gps_interval_minutes: int = 5
    # Justificatifs demandes licence (FO)
    upload_dir: str = "uploads"
    upload_max_mb: int = 5
    upload_max_files: int = 5
    # ADR-005 — couche AIS ZEE Gabon (open data, hors IoT)
    ais_enabled: bool = True
    ais_openwaters_url: str = "https://ais.openwaters.io"
    ais_poll_seconds: int = 60
    ais_collect_seconds: int = 25
    # false recommandé dès qu'une clé AISStream est configurée
    ais_demo_when_empty: bool = False
    aisstream_api_key: str | None = None
    # Open Waters REST en complément (aucune couverture Gabon constatée 2026-09)
    ais_openwaters_enabled: bool = True
    # Marge côtière ajoutée au polygone ZEE (degrés) : inclut quais, estuaires,
    # lagunes portuaires (le polygone strict exclut le bassin de Port-Gentil)
    ais_coastal_buffer_deg: float = 0.12
    # Durée de conservation d'une position sans nouveau message
    ais_ttl_moving_min: int = 30
    ais_ttl_moored_min: int = 180
    ais_ttl_snapshot_hours: int = 24
    ais_snapshot_seconds: int = 120
    # Référentiel ports (JSON) — défaut data/open-data/gabon/ports.json
    ais_ports_path: str | None = None
    # Zone de veille élargie (minLat,minLon,maxLat,maxLon) : golfe de Guinée,
    # de la Côte d'Ivoire à l'Angola — navires en approche, extrapolation de route
    ais_wide_bbox: str = "-9,-5,7,14"
    ais_prediction_horizon_h: float = 48.0
    # Clé partagée des récepteurs AIS locaux (POST /ais/ingest) — vide = désactivé
    ais_ingest_key: str | None = None
    # Présence au port calculée depuis le GPS PIGAP (aucun matériel)
    presence_port_min_minutes: int = 10  # immobile dans le rayon → « à quai »
    presence_fenetre_heures: int = 24
    presence_silence_heures: int = 6  # au-delà : « sans signal »
    presence_tolerance_heures: int = 6  # déclaration vs présence GPS
    # Météo-marine (Open-Meteo, CC BY 4.0) : bulletin, zones calculées, alertes auto
    meteo_enabled: bool = True
    meteo_cache_minutes: int = 30
    meteo_houle_orange_m: float = 1.8
    meteo_houle_rouge_m: float = 2.5
    meteo_rafales_orange_kn: float = 22.0
    meteo_rafales_rouge_kn: float = 30.0
    meteo_courant_orange_kn: float = 1.2
    meteo_courant_rouge_kn: float = 2.0
    meteo_quota_pression: float = 0.75
    meteo_quota_surexploitation: float = 0.9
    # Numérotation automatique à l'approbation (formats indicatifs, à valider DGPA)
    # Variables : {annee} {seq} {seq:05d} {zone}
    numerotation_licence_format: str = "GA-PA-{annee}-{seq:05d}"
    numerotation_immatriculation_format: str = "GA-{zone}-{annee}-{seq:04d}"
    numerotation_zone_defaut: str = "EST"
    # Abonnements / Mobile Money (docs/modele-economique.md) — hors MVP cahier, activé Phase 4
    mobile_money_mode: str = "demo"  # demo | live
    mobile_money_webhook_secret: str | None = None
    # PawaPay (Gabon AIRTEL_GAB / XAF) — token Bearer Merchant API
    pawapay_api_token: str | None = None
    pawapay_base_url: str = "https://api.pawapay.io"
    # false = pilote Phase 3 (couverture toujours OK) ; true = exige abonnement actif
    abonnement_enforce: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> object:
        if isinstance(value, str):
            return _to_asyncpg_url(value)
        return value


settings = Settings()
