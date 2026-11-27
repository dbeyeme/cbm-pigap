"""Point d'entrée FastAPI — CBM-PIGAP."""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import api_router
from app.core.config import settings
from app.core.errors import ApiError
from app.core.logging import configure_logging
from app.core.validation_messages import format_validation_errors
from app.modules.ais_gabon.service import start_ais_background, stop_ais_background
from app.modules.meteo_marine.service import start_meteo_background, stop_meteo_background
from app.modules.sorties.service import start_sorties_background, stop_sorties_background

configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("app_startup", env=settings.app_env)
    start_ais_background()
    start_meteo_background()
    start_sorties_background()
    yield
    await stop_sorties_background()
    await stop_meteo_background()
    await stop_ais_background()
    logger.info("app_shutdown")


_docs_enabled = settings.app_env != "production"
app = FastAPI(
    title="CBM-PIGAP API",
    description="Plateforme Intelligente Gabonaise des Activités de Pêche — MVP",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

_JWT_SECRET_DEV = "change-me-in-production-use-openssl-rand-hex-32"
_JWT_SECRET_MIN_LEN = 32


def assert_production_security(env: str, jwt_secret: str, cors_origins: str) -> None:
    """Refuse un démarrage production avec secret JWT faible/défaut ou CORS joker."""
    if env != "production":
        return
    if not jwt_secret or jwt_secret == _JWT_SECRET_DEV:
        raise RuntimeError(
            "JWT_SECRET obligatoire en production (valeur distincte du défaut de développement)"
        )
    if len(jwt_secret) < _JWT_SECRET_MIN_LEN:
        raise RuntimeError(
            f"JWT_SECRET trop court en production (minimum {_JWT_SECRET_MIN_LEN} caractères)"
        )
    origins = [o.strip() for o in cors_origins.split(",") if o.strip()]
    if not origins or "*" in origins:
        raise RuntimeError(
            "CORS_ORIGINS obligatoire en production (liste d'origines, sans joker *)"
        )


def assert_live_payment_security(
    mobile_money_mode: str,
    webhook_secret: str | None,
    pawapay_api_token: str | None,
) -> None:
    """Mode live : au moins un secret webhook ou jeton PawaPay (fail-closed au boot)."""
    mode = (mobile_money_mode or "demo").strip().lower()
    if mode != "live":
        return
    secret = (webhook_secret or "").strip()
    token = (pawapay_api_token or "").strip()
    if not secret and not token:
        raise RuntimeError(
            "MOBILE_MONEY_MODE=live exige MOBILE_MONEY_WEBHOOK_SECRET ou PAWAPAY_API_TOKEN"
        )


assert_production_security(settings.app_env, settings.jwt_secret, settings.cors_origins)
assert_live_payment_security(
    settings.mobile_money_mode,
    settings.mobile_money_webhook_secret,
    settings.pawapay_api_token,
)

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
_wildcard = "*" in _origins or not _origins
if _wildcard and settings.app_env == "production":
    # Filet de sécurité : assert_production_security doit déjà avoir bloqué.
    logger.error("cors_wildcard_in_production", hint="définir CORS_ORIGINS")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _wildcard else _origins,
    allow_origin_regex=None if _wildcard else settings.cors_origin_regex,
    # Authentification par jeton Bearer : pas de cookie, donc pas de credentials
    # avec le joker ; activés uniquement pour une liste explicite d'origines.
    allow_credentials=not _wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
    # Total des listes paginées (alertes, lot 9), lisible par le portail
    expose_headers=["X-Total-Count"],
)


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Transforme les erreurs Pydantic en message français unique."""
    detail = format_validation_errors(list(exc.errors()))
    return JSONResponse(
        status_code=422,
        content={"detail": detail, "code": "VALIDATION_ERROR"},
    )


app.include_router(api_router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    """Santé minimale pour CI, compose et sondes (cahier §3.2)."""
    return {"status": "ok"}
