"""Point d'entrée FastAPI — CBM-PIGAP."""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import api_router
from app.core.config import settings
from app.core.errors import ApiError
from app.core.logging import configure_logging

configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("app_startup", env=settings.app_env)
    yield
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


app.include_router(api_router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    """Santé minimale pour CI, compose et sondes (cahier §3.2)."""
    return {"status": "ok"}
