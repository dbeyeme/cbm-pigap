"""Extrapolation de route (navigation à l'estime) pour la surveillance AIS.

Un navire vu au large du Nigeria ou de l'Angola avec un cap et une vitesse
stables entrera dans les eaux gabonaises à une heure prévisible. Ce module
projette la dernière position connue le long de la route fond (COG) à la
vitesse fond (SOG) pour :

- estimer la position actuelle d'un navire silencieux depuis quelques minutes ;
- annoncer l'entrée prévue dans les eaux gabonaises des navires en approche.

Hypothèses : route et vitesse constantes (loxodromie sur courte distance),
Terre sphérique. Précision suffisante pour une alerte d'approche ; ce n'est
pas une position mesurée et l'interface le signale comme telle.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

EARTH_RADIUS_KM = 6371.0088
KM_PER_NM = 1.852


def dead_reckon(
    lon: float, lat: float, sog_kn: float, cog_deg: float, hours: float
) -> tuple[float, float]:
    """Position (lon, lat) après `hours` heures à `sog_kn` nœuds sur le cap `cog_deg`."""
    dist_km = sog_kn * KM_PER_NM * hours
    ang = dist_km / EARTH_RADIUS_KM
    brg = math.radians(cog_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(ang) + math.cos(lat1) * math.sin(ang) * math.cos(brg)
    )
    lon2 = lon1 + math.atan2(
        math.sin(brg) * math.sin(ang) * math.cos(lat1),
        math.cos(ang) - math.sin(lat1) * math.sin(lat2),
    )
    lon_out = (math.degrees(lon2) + 540) % 360 - 180
    return lon_out, math.degrees(lat2)


@dataclass(frozen=True)
class EntreePrevue:
    heures: float
    lon: float
    lat: float


def predict_entry(
    lon: float,
    lat: float,
    sog_kn: float | None,
    cog_deg: float | None,
    *,
    inside: Callable[[float, float], bool],
    horizon_h: float = 48.0,
    step_h: float = 0.25,
) -> EntreePrevue | None:
    """Première entrée prévue dans la zone `inside` le long de la route, ou None.

    Retourne None si le navire est immobile, sans cap, déjà dans la zone ou si
    la route ne coupe pas la zone dans l'horizon.
    """
    if sog_kn is None or cog_deg is None or sog_kn < 1.0:
        return None
    if inside(lon, lat):
        return None
    t = step_h
    while t <= horizon_h + 1e-9:
        plon, plat = dead_reckon(lon, lat, sog_kn, cog_deg, t)
        if inside(plon, plat):
            return EntreePrevue(heures=round(t, 2), lon=round(plon, 4), lat=round(plat, 4))
        t += step_h
    return None


def estimated_position(
    lon: float,
    lat: float,
    sog_kn: float | None,
    cog_deg: float | None,
    age_s: int,
    *,
    max_hours: float = 6.0,
) -> tuple[float, float] | None:
    """Position estimée maintenant, si le navire faisait route lors du dernier message."""
    if sog_kn is None or cog_deg is None or sog_kn < 0.5 or age_s < 120:
        return None
    hours = min(age_s / 3600.0, max_hours)
    plon, plat = dead_reckon(lon, lat, sog_kn, cog_deg, hours)
    return round(plon, 4), round(plat, 4)
