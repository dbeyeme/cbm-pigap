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
    # Abonnements / Mobile Money (docs/modele-economique.md) — hors MVP cahier, activé Phase 4
    mobile_money_mode: str = "demo"  # demo | live
    mobile_money_webhook_secret: str | None = None
    # false = pilote Phase 3 (couverture toujours OK) ; true = exige abonnement actif
    abonnement_enforce: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> object:
        if isinstance(value, str):
            return _to_asyncpg_url(value)
        return value


settings = Settings()
