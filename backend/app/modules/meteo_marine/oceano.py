"""Indicateurs océanographiques du score de secteur favorable (lot 11, ADR-016).

Statut : Proposé (valideurs : Christian, expert halieutique), paramétré dans
`data/regles/zones_favorables.json`.

- Température de surface : écart du jour à la moyenne des `jours_reference`
  derniers jours (Open-Meteo Marine, `past_days`), signe d'une remontée d'eaux.
- Chlorophylle a : médiane des mailles du secteur sur la dernière image, et
  moyenne des médianes des images précédentes (NOAA CoastWatch, ERDDAP, CC0-1.0,
  sans clé). Une seule requête couvre tous les secteurs ; résultat gardé en cache
  `cache_heures`, l'image ne changeant qu'une fois par jour au plus.

Une source indisponible laisse l'indicateur vide : le bulletin part sans lui.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx
import structlog
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.regles import charger_regles, regle_invalide

logger = structlog.get_logger(__name__)

FICHIER = "zones_favorables"


class RegleTemperature(BaseModel):
    model_config = ConfigDict(extra="forbid")

    propice_min_c: float
    propice_max_c: float
    points_propice: int = Field(..., ge=0, le=100)
    points_fraiche: int = Field(..., ge=0, le=100)
    jours_reference: int = Field(..., ge=1, le=92)
    refroidissement_min_c: float = Field(..., gt=0, le=10)
    points_refroidissement: int = Field(..., ge=0, le=100)


class RegleChlorophylle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actif: bool
    jeu: str = Field(..., min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_]+$")
    adresse: str = Field(..., pattern=r"^https://")
    jours_reference: int = Field(..., ge=1, le=92)
    riche_min_mg_m3: float = Field(..., gt=0)
    points_riche: int = Field(..., ge=0, le=100)
    enrichissement_min_ratio: float = Field(..., gt=1)
    points_enrichissement: int = Field(..., ge=0, le=100)
    delai_reponse_secondes: float = Field(..., gt=0, le=120)
    cache_heures: float = Field(..., gt=0, le=72)


class RegleAiresProtegees(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jamais_favorable: bool


class RegleClassement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signe_de_ressource_requis: bool


class RegleZonesFavorables(BaseModel):
    model_config = ConfigDict(extra="ignore")

    classement: RegleClassement
    temperature: RegleTemperature
    chlorophylle: RegleChlorophylle
    aires_protegees: RegleAiresProtegees


def regle_zones_favorables() -> RegleZonesFavorables:
    contenu = charger_regles(FICHIER)
    try:
        return RegleZonesFavorables.model_validate(contenu)
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc


@dataclass
class Chlorophylle:
    valeur_mg_m3: float
    moyenne_mg_m3: float | None
    date_image: date


# --------------------------------------------------------------------------- #
# Température de surface : moyenne des jours précédents
# --------------------------------------------------------------------------- #


async def fetch_temperature_reference(
    points: list[tuple[float, float]], jours: int, now: datetime
) -> list[float | None]:
    """Moyenne de la température de surface sur les `jours` jours entiers précédents."""
    if not points:
        return []
    lats = ",".join(str(p[1]) for p in points)
    lons = ",".join(str(p[0]) for p in points)
    url = (
        "https://marine-api.open-meteo.com/v1/marine"
        f"?latitude={lats}&longitude={lons}"
        f"&hourly=sea_surface_temperature&past_days={jours}&forecast_days=1&timezone=UTC"
    )
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.get(url)
    resp.raise_for_status()
    payload = resp.json()
    items = payload if isinstance(payload, list) else [payload]
    debut_jour = now.astimezone(UTC).strftime("%Y-%m-%dT00:00")
    out: list[float | None] = []
    for item in items:
        h = item.get("hourly") or {}
        valeurs = [
            float(v)
            for t, v in zip(
                h.get("time") or [], h.get("sea_surface_temperature") or [], strict=False
            )
            if v is not None and t < debut_jour
        ]
        out.append(round(statistics.fmean(valeurs), 2) if valeurs else None)
    return out


# --------------------------------------------------------------------------- #
# Chlorophylle a (ERDDAP)
# --------------------------------------------------------------------------- #

_cache_chl: tuple[datetime, tuple[Any, ...], dict[str, Chlorophylle]] | None = None


def _distance_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


def _emprise(secteurs: list[dict]) -> tuple[float, float, float, float]:
    """Emprise couvrant tous les disques de secteurs : lon min, lat min, lon max, lat max."""
    xs, ys = [], []
    for s in secteurs:
        dlat = float(s["rayon_km"]) / 111.32
        dlon = dlat / max(0.2, math.cos(math.radians(float(s["lat"]))))
        xs += [float(s["lon"]) - dlon, float(s["lon"]) + dlon]
        ys += [float(s["lat"]) - dlat, float(s["lat"]) + dlat]
    return min(xs), min(ys), max(xs), max(ys)


def chlorophylle_par_secteur(
    rows: list[list[Any]], secteurs: list[dict]
) -> dict[str, Chlorophylle]:
    """Lignes ERDDAP (temps, altitude, lat, lon, valeur) → indicateur par secteur."""
    par_jour: dict[str, list[tuple[float, float, float]]] = {}
    for t, _alt, lat, lon, v in rows:
        if v is None or lat is None or lon is None:
            continue
        par_jour.setdefault(str(t), []).append((float(lon), float(lat), float(v)))
    if not par_jour:
        return {}
    jours = sorted(par_jour)
    dernier = jours[-1]
    out: dict[str, Chlorophylle] = {}
    for s in secteurs:
        lon0, lat0, rayon = float(s["lon"]), float(s["lat"]), float(s["rayon_km"])
        # Mailles du disque du secteur, calculées une fois pour toutes les images
        cellules = {
            (lon, lat)
            for jour in jours
            for lon, lat, _ in par_jour[jour]
            if _distance_km(lon0, lat0, lon, lat) <= rayon
        }
        medianes: list[float | None] = []
        for jour in jours:
            vals = [v for lon, lat, v in par_jour[jour] if (lon, lat) in cellules]
            medianes.append(statistics.median(vals) if vals else None)
        valeur = medianes[-1]
        if valeur is None:
            continue
        precedentes = [m for m in medianes[:-1] if m is not None]
        out[str(s["id"])] = Chlorophylle(
            valeur_mg_m3=round(valeur, 3),
            moyenne_mg_m3=round(statistics.fmean(precedentes), 3) if precedentes else None,
            date_image=datetime.fromisoformat(dernier.replace("Z", "+00:00")).date(),
        )
    return out


async def fetch_chlorophylle(
    secteurs: list[dict], regle: RegleChlorophylle, now: datetime
) -> dict[str, Chlorophylle]:
    """Chlorophylle par secteur, en cache `cache_heures` ; vide si désactivée."""
    global _cache_chl
    if not regle.actif or not secteurs:
        return {}
    cle = (
        regle.jeu,
        regle.jours_reference,
        tuple((s["id"], s["lon"], s["lat"], s["rayon_km"]) for s in secteurs),
    )
    if (
        _cache_chl is not None
        and _cache_chl[1] == cle
        and now - _cache_chl[0] < timedelta(hours=regle.cache_heures)
    ):
        return _cache_chl[2]
    x1, y1, x2, y2 = _emprise(secteurs)
    # Latitudes décroissantes dans ce jeu : du nord vers le sud
    requete = (
        f"chlor_a[last-{regle.jours_reference}:last][(0.0)]"
        f"[({y2:.3f}):({y1:.3f})][({x1:.3f}):({x2:.3f})]"
    )
    # Requête ERDDAP brute (crochets encodés, sans « = ») : `params` ajouterait un « = »
    url = f"{regle.adresse.rstrip('/')}/{regle.jeu}.json?{quote(requete, safe='():.,-')}"
    async with httpx.AsyncClient(timeout=regle.delai_reponse_secondes) as client:
        resp = await client.get(url)
    resp.raise_for_status()
    rows = (resp.json().get("table") or {}).get("rows") or []
    resultat = chlorophylle_par_secteur(rows, secteurs)
    _cache_chl = (now, cle, resultat)
    return resultat


def reset_cache() -> None:
    global _cache_chl
    _cache_chl = None
