"""Agrégation des routes `/api/v1`."""

from app.api.v1 import auth
from app.modules.abonnements.router import router as abonnements_router
from app.modules.ais_gabon.router import router as ais_router
from app.modules.alertes.router import router as alertes_router
from app.modules.captures.router import router as captures_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.demandes_licence.router import router as demandes_licence_router
from app.modules.documents.router import router as documents_router
from app.modules.geolocalisation.router import config_router as geoloc_config_router
from app.modules.geolocalisation.router import router as positions_router
from app.modules.meteo_marine.router import router as meteo_router
from app.modules.notifications.router import router as notifications_router
from app.modules.pecheurs.router import router as pecheurs_router
from app.modules.predictions.router import router as predictions_router
from app.modules.quotas.router import router as quotas_router
from app.modules.utilisateurs.router import router as utilisateurs_router
from app.modules.zones.router import router as zones_router
from fastapi import APIRouter

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(utilisateurs_router)
api_router.include_router(pecheurs_router)
api_router.include_router(demandes_licence_router)
api_router.include_router(abonnements_router)
api_router.include_router(notifications_router)
api_router.include_router(positions_router)
api_router.include_router(geoloc_config_router)
api_router.include_router(ais_router)
api_router.include_router(meteo_router)
api_router.include_router(zones_router)
api_router.include_router(captures_router)
api_router.include_router(quotas_router)
api_router.include_router(dashboard_router)
api_router.include_router(documents_router)
api_router.include_router(predictions_router)
api_router.include_router(alertes_router)
