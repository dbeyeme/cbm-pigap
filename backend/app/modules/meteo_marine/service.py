"""Bulletin météo-marine et zones calculées (risques, opportunités, surexploitation).

Sources ouvertes (Open-Meteo, licence CC BY 4.0, sans clé) :
- Marine API : hauteur et direction des vagues, houle, période, courant de
  surface, température de surface, hauteur d'eau (marée) ;
- Forecast API : vent et rafales, pluie, visibilité ;
- Flood API : débit journalier des fleuves (modèle GloFAS, Copernicus).

Croisements PIGAP :
- captures déclarées des 30 derniers jours dans le rayon du secteur (densité) ;
- quotas des zones réglementées qui contiennent le centre du secteur
  (taux de consommation → surexploitation) ;
- zones interdites actives (danger réglementaire).

Les avis sont des aides à la décision, jamais des injonctions : le pêcheur
reste responsable de sa sortie et l'autorité de ses décisions.
"""

from __future__ import annotations

import asyncio
import json
import math
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import httpx
import structlog
from geoalchemy2 import WKTElement
from geoalchemy2.functions import ST_DWithin, ST_Intersects
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.datafiles import data_path
from app.db.enums import NiveauGravite, TypeAlerte
from app.db.models import Capture, Quota, ZoneReglementee
from app.modules.meteo_marine.schemas import (
    AvisMer,
    BulletinMeteoMarine,
    ConditionsMer,
    FleuveBulletin,
    OpportuniteSecteur,
    RisqueSecteur,
    SecteurBulletin,
    ZoneCalculee,
    ZonesCalculeesResponse,
)

logger = structlog.get_logger(__name__)

_SECTEURS_PATH = data_path("secteurs_mer.json")

KMH_TO_KN = 0.539957
KN_TO_MS = 0.514444

_cache_lock = asyncio.Lock()
_cache: BulletinMeteoMarine | None = None
_cache_at: datetime | None = None
_last_alert_block: dict[str, str] = {}


# --------------------------------------------------------------------------- #
# Référentiel
# --------------------------------------------------------------------------- #


@lru_cache(maxsize=1)
def load_referentiel() -> dict[str, Any]:
    if not _SECTEURS_PATH.exists():
        return {"secteurs": [], "fleuves": []}
    return json.loads(_SECTEURS_PATH.read_text(encoding="utf-8"))


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def circle_ring(lon: float, lat: float, rayon_km: float, n: int = 28) -> list[list[float]]:
    ring: list[list[float]] = []
    dlat = rayon_km / 111.32
    dlon = rayon_km / (111.32 * max(0.2, math.cos(math.radians(lat))))
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        ring.append([round(lon + dlon * math.cos(a), 4), round(lat + dlat * math.sin(a), 4)])
    return ring


# --------------------------------------------------------------------------- #
# Open-Meteo
# --------------------------------------------------------------------------- #


async def fetch_open_meteo(points: list[tuple[float, float]]) -> tuple[dict, dict]:
    """Marine + prévisions pour une liste de points (une requête par API)."""
    if not points:
        return {}, {}
    lats = ",".join(str(p[1]) for p in points)
    lons = ",".join(str(p[0]) for p in points)
    marine_url = (
        "https://marine-api.open-meteo.com/v1/marine"
        f"?latitude={lats}&longitude={lons}"
        "&hourly=wave_height,wave_direction,wave_period,swell_wave_height,"
        "ocean_current_velocity,ocean_current_direction,sea_surface_temperature,"
        "sea_level_height_msl&forecast_days=2&timezone=UTC"
    )
    weather_url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        "&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,visibility"
        "&wind_speed_unit=kn&forecast_days=2&timezone=UTC"
    )
    async with httpx.AsyncClient(timeout=25.0) as client:
        marine, weather = await asyncio.gather(client.get(marine_url), client.get(weather_url))
    marine.raise_for_status()
    weather.raise_for_status()
    return marine.json(), weather.json()


async def fetch_flood(points: list[tuple[float, float]]) -> dict:
    if not points:
        return {}
    lats = ",".join(str(p[1]) for p in points)
    lons = ",".join(str(p[0]) for p in points)
    url = (
        "https://flood-api.open-meteo.com/v1/flood"
        f"?latitude={lats}&longitude={lons}"
        "&daily=river_discharge,river_discharge_max&forecast_days=7"
    )
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.get(url)
    resp.raise_for_status()
    return resp.json()


def _as_list(payload: dict | list) -> list[dict]:
    """Open-Meteo renvoie un objet pour un point, une liste pour plusieurs."""
    if isinstance(payload, list):
        return payload
    return [payload] if payload else []


def _now_index(times: list[str], now: datetime) -> int:
    target = now.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")
    if target in times:
        return times.index(target)
    return 0


def _val(series: list | None, i: int) -> float | None:
    if not series or i >= len(series):
        return None
    v = series[i]
    return float(v) if v is not None else None


def _max_window(series: list | None, i: int, n: int = 24) -> float | None:
    if not series:
        return None
    vals = [float(v) for v in series[i : i + n] if v is not None]
    return max(vals) if vals else None


def etat_mer_douglas(houle_m: float | None) -> str:
    if houle_m is None:
        return "inconnu"
    if houle_m < 0.1:
        return "calme"
    if houle_m < 0.5:
        return "ridée"
    if houle_m < 1.25:
        return "belle"
    if houle_m < 2.5:
        return "peu agitée"
    if houle_m < 4.0:
        return "agitée"
    if houle_m < 6.0:
        return "forte"
    return "très forte"


def _maree(levels: list | None, i: int) -> tuple[str | None, int | None, int | None]:
    """Tendance de marée + index de la prochaine pleine / basse mer."""
    if not levels or i + 2 >= len(levels):
        return None, None, None
    cur = levels[i]
    nxt = levels[i + 1]
    if cur is None or nxt is None:
        return None, None, None
    delta = float(nxt) - float(cur)
    tendance = "montante" if delta > 0.03 else "descendante" if delta < -0.03 else "étale"
    pleine = basse = None
    for j in range(i + 1, min(len(levels) - 1, i + 14)):
        a, b, c = levels[j - 1], levels[j], levels[j + 1]
        if a is None or b is None or c is None:
            continue
        if pleine is None and b >= a and b > c:
            pleine = j
        if basse is None and b <= a and b < c:
            basse = j
        if pleine is not None and basse is not None:
            break
    return tendance, pleine, basse


def build_conditions(marine: dict, weather: dict, now: datetime) -> ConditionsMer:
    mh = marine.get("hourly") or {}
    wh = weather.get("hourly") or {}
    times = mh.get("time") or wh.get("time") or []
    i = _now_index(times, now)
    wi = _now_index(wh.get("time") or [], now)
    houle = _val(mh.get("wave_height"), i)
    courant_kmh = _val(mh.get("ocean_current_velocity"), i)
    tendance, ip, ib = _maree(mh.get("sea_level_height_msl"), i)

    def t_at(j: int | None) -> datetime | None:
        if j is None or j >= len(times):
            return None
        return datetime.fromisoformat(times[j]).replace(tzinfo=UTC)

    vis_m = _val(wh.get("visibility"), wi)
    return ConditionsMer(
        horodatage=t_at(i) or now,
        houle_m=houle,
        houle_max_24h_m=_max_window(mh.get("wave_height"), i),
        houle_direction_deg=_val(mh.get("wave_direction"), i),
        periode_s=_val(mh.get("wave_period"), i),
        courant_noeuds=round(courant_kmh * KMH_TO_KN, 2) if courant_kmh is not None else None,
        courant_direction_deg=_val(mh.get("ocean_current_direction"), i),
        vent_noeuds=_val(wh.get("wind_speed_10m"), wi),
        rafales_noeuds=_val(wh.get("wind_gusts_10m"), wi),
        rafales_max_24h_noeuds=_max_window(wh.get("wind_gusts_10m"), wi),
        vent_direction_deg=_val(wh.get("wind_direction_10m"), wi),
        pluie_mm_h=_val(wh.get("precipitation"), wi),
        visibilite_km=round(vis_m / 1000, 1) if vis_m is not None else None,
        temperature_mer_c=_val(mh.get("sea_surface_temperature"), i),
        niveau_mer_m=_val(mh.get("sea_level_height_msl"), i),
        maree=tendance,
        prochaine_pleine_mer=t_at(ip),
        prochaine_basse_mer=t_at(ib),
        etat_mer=etat_mer_douglas(houle),
    )


# --------------------------------------------------------------------------- #
# Risque et opportunité
# --------------------------------------------------------------------------- #


def evaluer_risque(c: ConditionsMer) -> RisqueSecteur:
    motifs: list[str] = []
    pirogue = navire = 0  # 0 vert · 1 orange · 2 rouge

    def raise_to(p: int, n: int, motif: str) -> None:
        nonlocal pirogue, navire
        pirogue = max(pirogue, p)
        navire = max(navire, n)
        motifs.append(motif)

    h = c.houle_max_24h_m if c.houle_max_24h_m is not None else c.houle_m
    if h is not None:
        if h >= settings.meteo_houle_rouge_m:
            raise_to(
                2,
                2 if h >= settings.meteo_houle_rouge_m + 1.5 else 1,
                f"Houle jusqu'à {h:.1f} m sur 24 h",
            )
        elif h >= settings.meteo_houle_orange_m:
            raise_to(1, 0, f"Houle de {h:.1f} m : mer agitée pour les pirogues")
    g = c.rafales_max_24h_noeuds if c.rafales_max_24h_noeuds is not None else c.rafales_noeuds
    if g is not None:
        if g >= settings.meteo_rafales_rouge_kn:
            raise_to(2, 1, f"Rafales jusqu'à {g:.0f} nœuds")
        elif g >= settings.meteo_rafales_orange_kn:
            raise_to(1, 0, f"Vent soutenu, rafales {g:.0f} nœuds")
    if c.courant_noeuds is not None:
        if c.courant_noeuds >= settings.meteo_courant_rouge_kn:
            raise_to(2, 1, f"Courant fort de {c.courant_noeuds:.1f} nœuds")
        elif c.courant_noeuds >= settings.meteo_courant_orange_kn:
            raise_to(1, 0, f"Courant de {c.courant_noeuds:.1f} nœuds : dérive à anticiper")
    if c.visibilite_km is not None and c.visibilite_km < 1.0:
        raise_to(2, 1, f"Visibilité réduite à {c.visibilite_km:.1f} km")
    elif c.visibilite_km is not None and c.visibilite_km < 4.0:
        raise_to(1, 0, f"Visibilité limitée ({c.visibilite_km:.0f} km)")
    if c.pluie_mm_h is not None and c.pluie_mm_h >= 5.0:
        raise_to(1, 0, f"Fortes pluies ({c.pluie_mm_h:.0f} mm/h)")
    if not motifs:
        motifs.append("Conditions favorables à la navigation côtière")
    niveaux = ("vert", "orange", "rouge")
    return RisqueSecteur(
        niveau_pirogue=niveaux[pirogue], niveau_navire=niveaux[navire], motifs=motifs
    )


def evaluer_opportunite(
    c: ConditionsMer,
    risque: RisqueSecteur,
    *,
    captures_kg: float,
    sorties: int,
    mediane_kg: float,
    quota_max_taux: float | None,
    especes_pression: list[str],
    zone_interdite: bool,
) -> OpportuniteSecteur:
    motifs: list[str] = []
    score = 50
    if zone_interdite:
        return OpportuniteSecteur(
            score=0,
            classe="danger",
            motifs=["Secteur couvert par une zone interdite active"],
            captures_30j_kg=captures_kg,
            sorties_30j=sorties,
            quota_max_taux=quota_max_taux,
            especes_sous_pression=especes_pression,
        )
    if risque.niveau_pirogue == "rouge":
        return OpportuniteSecteur(
            score=5,
            classe="danger",
            motifs=["Conditions de mer dangereuses pour les embarcations artisanales"]
            + risque.motifs,
            captures_30j_kg=captures_kg,
            sorties_30j=sorties,
            quota_max_taux=quota_max_taux,
            especes_sous_pression=especes_pression,
        )
    if quota_max_taux is not None and quota_max_taux >= settings.meteo_quota_surexploitation:
        motifs.append(
            f"Quota consommé à {quota_max_taux * 100:.0f} % "
            f"({', '.join(especes_pression) or 'espèce'})"
        )
        return OpportuniteSecteur(
            score=10,
            classe="surexploitee",
            motifs=motifs + ["Report de l'effort de pêche recommandé vers un autre secteur"],
            captures_30j_kg=captures_kg,
            sorties_30j=sorties,
            quota_max_taux=quota_max_taux,
            especes_sous_pression=especes_pression,
        )
    if risque.niveau_pirogue == "orange":
        score -= 20
        motifs.append("Prudence : " + risque.motifs[0].lower())
    else:
        score += 15
        motifs.append("Mer praticable pour les pirogues")
    if c.temperature_mer_c is not None:
        if 23.5 <= c.temperature_mer_c <= 28.5:
            score += 10
            motifs.append(
                f"Température de surface {c.temperature_mer_c:.1f} °C, propice aux espèces côtières"
            )
        elif c.temperature_mer_c < 23.5:
            score += 5
            motifs.append(
                f"Eaux fraîches ({c.temperature_mer_c:.1f} °C) : remontée d'eaux riches possible"
            )
    if mediane_kg > 0 and captures_kg >= mediane_kg * 1.3:
        score += 15
        motifs.append(f"Captures déclarées élevées sur 30 jours ({captures_kg:.0f} kg)")
    elif captures_kg > 0 and mediane_kg > 0 and captures_kg < mediane_kg * 0.5:
        score -= 5
        motifs.append("Peu de captures déclarées récemment dans ce secteur")
    if quota_max_taux is not None and quota_max_taux >= settings.meteo_quota_pression:
        score -= 15
        motifs.append(f"Quota déjà consommé à {quota_max_taux * 100:.0f} % : effort à modérer")
    if c.maree == "montante":
        score += 5
        motifs.append("Marée montante : accès aux estuaires et bancs facilité")
    score = max(0, min(100, score))
    if risque.niveau_pirogue == "orange":
        classe = "prudence"
    elif score >= 65:
        classe = "favorable"
    elif score <= 30:
        classe = "prudence"
    else:
        classe = "neutre"
    return OpportuniteSecteur(
        score=score,
        classe=classe,
        motifs=motifs,
        captures_30j_kg=captures_kg,
        sorties_30j=sorties,
        quota_max_taux=quota_max_taux,
        especes_sous_pression=especes_pression,
    )


def conseil_secteur(
    s_nom: str, risque: RisqueSecteur, opp: OpportuniteSecteur, c: ConditionsMer
) -> str:
    if opp.classe == "danger" and risque.niveau_pirogue == "rouge":
        return (
            f"{s_nom} : sortie déconseillée aux pirogues. "
            + " ; ".join(risque.motifs[:2])
            + ". Attendez l'amélioration annoncée dans le bulletin suivant."
        )
    if opp.classe == "danger":
        return f"{s_nom} : zone interdite active, toute pêche y est proscrite."
    if opp.classe == "surexploitee":
        return (
            f"{s_nom} : ressource sous pression, quota presque atteint. "
            "Reportez l'effort vers un secteur voisin."
        )
    if opp.classe == "favorable":
        return (
            f"{s_nom} : conditions favorables (mer {c.etat_mer}"
            + (f", houle {c.houle_m:.1f} m" if c.houle_m is not None else "")
            + "). Déclarez vos captures au retour."
        )
    if opp.classe == "prudence":
        return f"{s_nom} : sortie possible avec prudence. " + "; ".join(risque.motifs[:2]) + "."
    return f"{s_nom} : conditions ordinaires, mer {c.etat_mer}."


# --------------------------------------------------------------------------- #
# Fleuves
# --------------------------------------------------------------------------- #


def build_fleuve(ref: dict, flood: dict) -> FleuveBulletin:
    daily = flood.get("daily") or {}
    disch = daily.get("river_discharge") or []
    dmax = daily.get("river_discharge_max") or []
    today = float(disch[0]) if disch and disch[0] is not None else None
    j3 = float(disch[3]) if len(disch) > 3 and disch[3] is not None else None
    max7 = max((float(v) for v in dmax if v is not None), default=None)
    tendance = "stable"
    variation = None
    if today and j3 is not None:
        variation = round((j3 - today) / today * 100, 1)
        if variation >= 8:
            tendance = "hausse"
        elif variation <= -8:
            tendance = "baisse"
    niveau = "normal"
    # Crue : le débit moyen prévu dépasse 1,4 × le débit du jour dans la semaine.
    # `river_discharge_max` mesure l'incertitude d'ensemble, pas un pic : il n'entre pas ici.
    prevu_max = max((float(v) for v in disch[1:7] if v is not None), default=None)
    if today and prevu_max is not None and prevu_max >= today * 1.4:
        niveau = "crue"
    elif tendance == "hausse" and variation is not None and variation >= 20:
        niveau = "haut"
    elif tendance == "baisse" and variation is not None and variation <= -20:
        niveau = "bas"
    if niveau == "crue":
        conseil = (
            f"{ref['nom']} : montée rapide des eaux prévue (débit ×1,4 sous 7 jours). "
            "Courants et bois flottants : prudence sur le fleuve."
        )
    elif tendance == "hausse":
        conseil = (
            f"{ref['nom']} : débit en hausse ({variation:+.0f} % sous 3 jours), "
            "courant plus fort dans les bras."
        )
    elif tendance == "baisse":
        conseil = (
            f"{ref['nom']} : décrue ({variation:+.0f} % sous 3 jours), "
            "bancs et hauts-fonds plus apparents."
        )
    else:
        conseil = f"{ref['nom']} : débit stable."
    return FleuveBulletin(
        id=ref["id"],
        nom=ref["nom"],
        fleuve=ref.get("fleuve", ""),
        lon=float(ref["lon"]),
        lat=float(ref["lat"]),
        debit_m3s=today,
        debit_j3_m3s=j3,
        debit_max_7j_m3s=max7,
        tendance=tendance,
        variation_pct=variation,
        niveau=niveau,
        conseil=conseil,
    )


# --------------------------------------------------------------------------- #
# Croisements PIGAP (captures, quotas, zones)
# --------------------------------------------------------------------------- #


async def _contexte_pigap(db: AsyncSession, secteurs: list[dict]) -> dict[str, dict[str, Any]]:
    """Captures 30 j, quotas et zones interdites par secteur (une requête par type)."""
    since = datetime.now(UTC) - timedelta(days=30)
    out: dict[str, dict[str, Any]] = {
        s["id"]: {"kg": 0.0, "sorties": 0, "quota_max": None, "especes": [], "interdite": False}
        for s in secteurs
    }
    today = datetime.now(UTC).date()
    for s in secteurs:
        point = WKTElement(f"POINT({s['lon']} {s['lat']})", srid=4326)
        try:
            row = await db.execute(
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0), func.count(Capture.id))
                .where(Capture.date_capture >= since)
                .where(Capture.position_capture.isnot(None))
                .where(ST_DWithin(Capture.position_capture, point, float(s["rayon_km"]) / 111.32))
            )
            kg, n = row.one()
            out[s["id"]]["kg"] = float(kg or 0)
            out[s["id"]]["sorties"] = int(n or 0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("meteo_captures_failed", secteur=s["id"], error=str(exc))
        try:
            zones = await db.execute(
                select(ZoneReglementee)
                .where(ZoneReglementee.actif.is_(True))
                .where(ST_Intersects(ZoneReglementee.geometrie, point))
            )
            zone_rows = list(zones.scalars().all())
            for z in zone_rows:
                if z.periode_debut and today < z.periode_debut:
                    continue
                if z.periode_fin and today > z.periode_fin:
                    continue
                if z.type.value == "interdite":
                    out[s["id"]]["interdite"] = True
            zone_ids = [z.id for z in zone_rows]
            if zone_ids:
                quotas = await db.execute(
                    select(Quota)
                    .where(Quota.zone_id.in_(zone_ids))
                    .where(Quota.periode_debut <= today, Quota.periode_fin >= today)
                )
                for q in quotas.scalars().all():
                    taux = (
                        (q.volume_consomme_kg / q.volume_autorise_kg)
                        if q.volume_autorise_kg
                        else 0.0
                    )
                    cur = out[s["id"]]["quota_max"]
                    if cur is None or taux > cur:
                        out[s["id"]]["quota_max"] = round(taux, 3)
                    if taux >= settings.meteo_quota_pression:
                        out[s["id"]]["especes"].append(q.espece)
        except Exception as exc:  # noqa: BLE001
            logger.warning("meteo_zones_failed", secteur=s["id"], error=str(exc))
    return out


# --------------------------------------------------------------------------- #
# Bulletin
# --------------------------------------------------------------------------- #


async def build_bulletin(db: AsyncSession | None, *, force: bool = False) -> BulletinMeteoMarine:
    global _cache, _cache_at
    now = datetime.now(UTC)
    async with _cache_lock:
        if (
            not force
            and _cache is not None
            and _cache_at is not None
            and (now - _cache_at).total_seconds() < settings.meteo_cache_minutes * 60
        ):
            return _cache

        ref = load_referentiel()
        secteurs_ref: list[dict] = ref.get("secteurs", [])
        fleuves_ref: list[dict] = ref.get("fleuves", [])
        note_parts: list[str] = []

        try:
            marine_raw, weather_raw = await fetch_open_meteo(
                [(s["lon"], s["lat"]) for s in secteurs_ref]
            )
            marine_list, weather_list = _as_list(marine_raw), _as_list(weather_raw)
        except Exception as exc:  # noqa: BLE001
            logger.warning("meteo_open_meteo_failed", error=str(exc))
            bulletin = BulletinMeteoMarine(
                genere_a=now,
                valide_jusqua=now + timedelta(minutes=settings.meteo_cache_minutes),
                disponible=False,
                note=(
                    f"Service météo-marine indisponible ({type(exc).__name__}). "
                    "Dernier bulletin conservé si présent."
                ),
            )
            if _cache is not None:
                return _cache
            _cache, _cache_at = bulletin, now
            return bulletin

        try:
            flood_list = _as_list(await fetch_flood([(f["lon"], f["lat"]) for f in fleuves_ref]))
        except Exception as exc:  # noqa: BLE001
            logger.warning("meteo_flood_failed", error=str(exc))
            flood_list = []
            note_parts.append("débits fluviaux indisponibles")

        contexte = (
            await _contexte_pigap(db, secteurs_ref)
            if db is not None
            else {
                s["id"]: {
                    "kg": 0.0,
                    "sorties": 0,
                    "quota_max": None,
                    "especes": [],
                    "interdite": False,
                }
                for s in secteurs_ref
            }
        )
        kgs = sorted(v["kg"] for v in contexte.values())
        mediane = kgs[len(kgs) // 2] if kgs else 0.0

        secteurs: list[SecteurBulletin] = []
        for idx, s in enumerate(secteurs_ref):
            m = marine_list[idx] if idx < len(marine_list) else {}
            w = weather_list[idx] if idx < len(weather_list) else {}
            cond = build_conditions(m, w, now)
            risque = evaluer_risque(cond)
            ctx = contexte[s["id"]]
            opp = evaluer_opportunite(
                cond,
                risque,
                captures_kg=ctx["kg"],
                sorties=ctx["sorties"],
                mediane_kg=mediane,
                quota_max_taux=ctx["quota_max"],
                especes_pression=ctx["especes"],
                zone_interdite=ctx["interdite"],
            )
            secteurs.append(
                SecteurBulletin(
                    id=s["id"],
                    nom=s["nom"],
                    type=s.get("type", "cote"),
                    lon=float(s["lon"]),
                    lat=float(s["lat"]),
                    rayon_km=float(s.get("rayon_km", 25)),
                    conditions=cond,
                    risque=risque,
                    opportunite=opp,
                    conseil=conseil_secteur(s["nom"], risque, opp, cond),
                )
            )

        fleuves = [
            build_fleuve(f, flood_list[i] if i < len(flood_list) else {})
            for i, f in enumerate(fleuves_ref)
        ]

        rouges = [s.nom for s in secteurs if s.risque.niveau_pirogue == "rouge"]
        favorables = [s.nom for s in secteurs if s.opportunite.classe == "favorable"]
        surex = [s.nom for s in secteurs if s.opportunite.classe == "surexploitee"]
        crues = [f.nom for f in fleuves if f.niveau == "crue"]
        synth: list[str] = []
        if rouges:
            synth.append(f"Sortie déconseillée aux pirogues : {', '.join(rouges)}")
        if favorables:
            synth.append(f"Conditions favorables : {', '.join(favorables)}")
        if surex:
            synth.append(f"Ressource sous pression : {', '.join(surex)}")
        if crues:
            synth.append(f"Crue annoncée : {', '.join(crues)}")
        if not synth:
            synth.append(
                "Aucun risque majeur signalé sur le littoral ; "
                "consultez les secteurs pour le détail"
            )

        bulletin = BulletinMeteoMarine(
            genere_a=now,
            valide_jusqua=now + timedelta(minutes=settings.meteo_cache_minutes),
            disponible=True,
            note=" · ".join(note_parts),
            synthese=". ".join(synth) + ".",
            secteurs=secteurs,
            fleuves=fleuves,
        )
        _cache, _cache_at = bulletin, now
        return bulletin


def zones_calculees(bulletin: BulletinMeteoMarine) -> ZonesCalculeesResponse:
    zones = [
        ZoneCalculee(
            id=s.id,
            nom=s.nom,
            classe=s.opportunite.classe,
            niveau_pirogue=s.risque.niveau_pirogue,
            score=s.opportunite.score,
            motifs=s.opportunite.motifs,
            centre=[s.lon, s.lat],
            rayon_km=s.rayon_km,
            polygone=circle_ring(s.lon, s.lat, s.rayon_km),
        )
        for s in bulletin.secteurs
    ]
    return ZonesCalculeesResponse(
        genere_a=bulletin.genere_a,
        zones=zones,
        legende={
            "danger": "Danger : mer dangereuse ou zone interdite",
            "prudence": "Prudence : conditions limites pour les pirogues",
            "favorable": "Favorable : mer praticable, activité et ressource au rendez-vous",
            "surexploitee": "Surexploitée : quota presque atteint, reporter l'effort",
            "neutre": "Conditions ordinaires",
        },
    )


def avis_pour_position(bulletin: BulletinMeteoMarine, lon: float, lat: float) -> AvisMer:
    best: tuple[float, SecteurBulletin] | None = None
    for s in bulletin.secteurs:
        d = haversine_km(lon, lat, s.lon, s.lat)
        if best is None or d < best[0]:
            best = (d, s)
    fleuve: FleuveBulletin | None = None
    bestf: tuple[float, FleuveBulletin] | None = None
    for f in bulletin.fleuves:
        d = haversine_km(lon, lat, f.lon, f.lat)
        if d <= 60 and (bestf is None or d < bestf[0]):
            bestf = (d, f)
    if bestf:
        fleuve = bestf[1]
    if best is None:
        return AvisMer(
            secteur=None,
            distance_km=None,
            fleuve_proche=fleuve,
            message=bulletin.synthese,
            niveau="vert",
        )
    d, s = best
    msg = s.conseil
    if fleuve and fleuve.niveau in ("crue", "haut"):
        msg += " " + fleuve.conseil
    return AvisMer(
        secteur=s,
        distance_km=round(d, 1),
        fleuve_proche=fleuve,
        message=msg,
        niveau=s.risque.niveau_pirogue,
    )


# --------------------------------------------------------------------------- #
# Alertes automatiques
# --------------------------------------------------------------------------- #


async def emettre_alertes(db: AsyncSession, bulletin: BulletinMeteoMarine) -> int:
    """Crée une alerte par secteur passé en rouge (bloc de 6 h) et par crue annoncée."""
    from app.modules.alertes.service import _create

    emises = 0
    bloc = bulletin.genere_a.strftime("%Y%m%d") + str(bulletin.genere_a.hour // 6)
    for s in bulletin.secteurs:
        if s.risque.niveau_pirogue != "rouge":
            continue
        fp = f"meteo:{s.id}:{bloc}"
        if _last_alert_block.get(s.id) == bloc:
            continue
        row = await _create(
            db,
            type_alerte=TypeAlerte.anomalie,
            gravite=NiveauGravite.critique
            if s.risque.niveau_navire == "rouge"
            else NiveauGravite.attention,
            embarcation_id=None,
            declencheur={
                "regle": "meteo_marine",
                "fingerprint": fp,
                "secteur": s.nom,
                "secteur_id": s.id,
                "niveau_pirogue": s.risque.niveau_pirogue,
                "houle_m": s.conditions.houle_max_24h_m,
                "rafales_kn": s.conditions.rafales_max_24h_noeuds,
                "courant_kn": s.conditions.courant_noeuds,
                "motifs": s.risque.motifs,
                "position": {"type": "Point", "coordinates": [s.lon, s.lat]},
            },
        )
        _last_alert_block[s.id] = bloc
        if row is not None:
            emises += 1
    for f in bulletin.fleuves:
        if f.niveau != "crue":
            continue
        fp = f"crue:{f.id}:{bulletin.genere_a.strftime('%Y%m%d')}"
        if _last_alert_block.get(f.id) == fp:
            continue
        row = await _create(
            db,
            type_alerte=TypeAlerte.anomalie,
            gravite=NiveauGravite.attention,
            embarcation_id=None,
            declencheur={
                "regle": "crue_fleuve",
                "fingerprint": fp,
                "fleuve": f.fleuve,
                "station": f.nom,
                "debit_m3s": f.debit_m3s,
                "debit_max_7j_m3s": f.debit_max_7j_m3s,
                "position": {"type": "Point", "coordinates": [f.lon, f.lat]},
            },
        )
        _last_alert_block[f.id] = fp
        if row is not None:
            emises += 1
    if emises:
        await db.commit()
        from app.modules.notifications.hub import hub

        await hub.publish({"kind": "meteo", "alertes": emises})
    bulletin.alertes_emises = emises
    return emises


_bg_task: asyncio.Task | None = None


async def _loop() -> None:
    from app.db.session import AsyncSessionLocal as async_session_factory

    while True:
        try:
            async with async_session_factory() as db:
                bulletin = await build_bulletin(db, force=True)
                if bulletin.disponible:
                    await emettre_alertes(db, bulletin)
        except Exception as exc:  # noqa: BLE001
            logger.warning("meteo_loop_failed", error=str(exc))
        await asyncio.sleep(max(300, settings.meteo_cache_minutes * 60))


def start_meteo_background() -> None:
    global _bg_task
    import os

    if not settings.meteo_enabled or os.environ.get("PYTEST_CURRENT_TEST"):
        return
    if _bg_task is None or _bg_task.done():
        _bg_task = asyncio.create_task(_loop(), name="meteo-marine")
        logger.info("meteo_background_started", cache_minutes=settings.meteo_cache_minutes)


async def stop_meteo_background() -> None:
    global _bg_task
    if _bg_task is None:
        return
    _bg_task.cancel()
    try:
        await _bg_task
    except asyncio.CancelledError:
        pass
    _bg_task = None
