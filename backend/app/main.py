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

configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("app_startup", env=settings.app_env)
    start_ais_background()
    yield
    await stop_ais_background()
    logger.info("app_shutdown")


app = FastAPI(
    title="CBM-PIGAP API",
    description="Plateforme Intelligente Gabonaise des Activités de Pêche — MVP",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
