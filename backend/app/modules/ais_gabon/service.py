"""Surveillance AIS — navires dans les eaux gabonaises (ADR-005, révisé 2026-09-20).

Architecture :
1. **Flux AISStream permanent** (WebSocket, clé gratuite) : chaque message de
   position ou de données statiques met à jour un état de flotte en mémoire
   (`FleetStore`). Plus de « fenêtre de 25 s » : un navire à quai qui n'émet
   que toutes les 3 minutes reste visible entre deux émissions.
2. **Récepteurs AIS locaux** (`POST /ais/ingest`) : un récepteur VHF installé
   à Owendo ou Port-Gentil (AIS-catcher, dAISy…) alimente le même état de
   flotte. C'est la seule source fiable pour les ports gabonais : les réseaux
   communautaires (AISStream, Open Waters) n'y ont pratiquement aucune station.
3. Open Waters REST (optionnel) en complément.
4. Snapshot disque au redémarrage (positions marquées « dernière connue »).
5. Démo explicite si `AIS_DEMO_WHEN_EMPTY=true`.

Filtre géographique : ZEE Marine Regions **élargie d'une marge côtière**
(`AIS_COASTAL_BUFFER_DEG`) afin d'inclure quais, estuaires et lagunes (le
polygone ZEE strict exclut par exemple le bassin de Port-Gentil).
Séparé du GPS pêcheurs PIGAP. Pas de pirogues fluviales (pas d'AIS).
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import httpx
import structlog
from geoalchemy2 import WKTElement
from geoalchemy2.functions import ST_Intersects
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.datafiles import data_path
from app.db.models import Embarcation, Organisation, Pecheur, ZoneReglementee
from app.modules.ais_gabon import ingest as ingest_mod
from app.modules.ais_gabon.flags import PAVILLONS_LIBRE_IMMATRICULATION
from app.modules.ais_gabon.fleet import FleetStore
from app.modules.ais_gabon.ports import load_ports
from app.modules.ais_gabon.schemas import (
    AisIngestPayload,
    AisIngestResult,
    AisLiveResponse,
    AisPortDetail,
    AisPortsResponse,
    AisPortSummary,
    AisRegistreCorrespondance,
    AisStreamStatus,
    AisVesselDetail,
    AisVesselRead,
    AisZoneTouchee,
)
from app.schemas.common import PointGeoJSON

logger = structlog.get_logger(__name__)

_EEZ_PATH = data_path("eez_marineregions.geojson")
_SNAPSHOT_PATH = data_path("ais_zee_snapshot.geojson")

# Bbox enveloppe ZEE + marge (minLat, minLon, maxLat, maxLon)
_GABON_BBOX = (-6.6, 6.7, 1.3, 11.4)


def _wide_bbox() -> tuple[float, float, float, float]:
    """Zone de veille élargie (golfe de Guinée) — minLat, minLon, maxLat, maxLon."""
    try:
        parts = [float(x) for x in str(settings.ais_wide_bbox).split(",")]
        if len(parts) == 4:
            return parts[0], parts[1], parts[2], parts[3]
    except ValueError:
        pass
    return -9.0, -5.0, 7.0, 14.0


def _aisstream_box() -> list[list[float]]:
    """AISStream : coins [[lat,lon],[lat,lon]] de la zone de veille élargie."""
    min_lat, min_lon, max_lat, max_lon = _wide_bbox()
    return [[min_lat, min_lon], [max_lat, max_lon]]


def point_in_surveillance_zone(lon: float, lat: float) -> bool:
    """Zone de veille élargie : navires en approche du Gabon (golfe de Guinée).

    Exclut l'enveloppe nationale gabonaise : un point y est soit dans les eaux
    (traité par `point_in_gabon_waters`), soit à terre, donc erroné.
    """
    g_min_lat, g_min_lon, g_max_lat, g_max_lon = _GABON_BBOX
    if g_min_lon <= lon <= g_max_lon and g_min_lat <= lat <= g_max_lat:
        return False
    min_lat, min_lon, max_lat, max_lon = _wide_bbox()
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


_AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"
_AISSTREAM_TYPES = [
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
    "LongRangeAisBroadcastMessage",
    "ShipStaticData",
    "StaticDataReport",
]

fleet = FleetStore()

_cache_lock = asyncio.Lock()
_cache_fetched_at: datetime | None = None
_cache_response: AisLiveResponse | None = None
_cache_ttl_sec = 5.0
_last_snapshot_at: datetime | None = None
_snapshot_loaded = False

stream_status = AisStreamStatus()


# --------------------------------------------------------------------------- #
# Géométrie
# --------------------------------------------------------------------------- #


@lru_cache(maxsize=1)
def _eez_geom() -> BaseGeometry | None:
    if not _EEZ_PATH.exists():
        logger.warning("ais_eez_missing", path=str(_EEZ_PATH))
        return None
    data = json.loads(_EEZ_PATH.read_text(encoding="utf-8"))
    feats = data.get("features") or []
    if not feats:
        return None
    return shape(feats[0]["geometry"])


@lru_cache(maxsize=1)
def _waters_geom() -> BaseGeometry | None:
    """ZEE + marge côtière : inclut quais, estuaires, lagunes portuaires."""
    geom = _eez_geom()
    if geom is None:
        return None
    buffer_deg = max(0.0, float(settings.ais_coastal_buffer_deg))
    if buffer_deg == 0:
        return geom
    return geom.buffer(buffer_deg)


def point_in_gabon_eez(lon: float, lat: float) -> bool:
    """Filtre ZEE strict (Marine Regions)."""
    geom = _eez_geom()
    if geom is None:
        return False
    p = Point(lon, lat)
    return bool(geom.contains(p) or geom.covers(p))


def point_in_gabon_waters(lon: float, lat: float) -> bool:
    """ZEE élargie d'une marge côtière — filtre appliqué aux navires AIS."""
    geom = _waters_geom()
    if geom is None:
        return False
    min_lat, min_lon, max_lat, max_lon = _GABON_BBOX
    if not (min_lon - 0.5 <= lon <= max_lon + 0.5 and min_lat - 0.5 <= lat <= max_lat + 0.5):
        return False
    return bool(geom.covers(Point(lon, lat)))


fleet.inside_gabon = point_in_gabon_waters


# --------------------------------------------------------------------------- #
# Construction / parsing (compat scripts & tests)
# --------------------------------------------------------------------------- #


def _vessel(
    *,
    mmsi: str,
    nom: str,
    lon: float,
    lat: float,
    horodatage: datetime,
    sog_kn: float | None = None,
    cog_deg: float | None = None,
    ship_type: str | None = None,
    provider: str,
    demo: bool = False,
) -> AisVesselRead | None:
    if not point_in_gabon_waters(lon, lat):
        return None
    return AisVesselRead(
        mmsi=mmsi[:32],
        nom=(nom or "Navire AIS")[:120],
        position=PointGeoJSON(coordinates=(float(lon), float(lat))),
        horodatage=horodatage,
        sog_kn=sog_kn,
        cog_deg=cog_deg,
        ship_type=ship_type,
        provider=provider,
        demo=demo,
    )


def _parse_openwaters_feature(feat: dict[str, Any]) -> AisVesselRead | None:
    geom = feat.get("geometry") or {}
    coords = geom.get("coordinates")
    if not isinstance(coords, (list, tuple)) or len(coords) < 2:
        return None
    lon, lat = float(coords[0]), float(coords[1])
    props = feat.get("properties") or {}
    mmsi = str(props.get("mmsi") or props.get("MMSI") or props.get("userid") or "").strip()
    if not mmsi:
        mmsi = f"unk-{round(lon, 4)}-{round(lat, 4)}"
    name = (
        props.get("name")
        or props.get("shipname")
        or props.get("ShipName")
        or props.get("vessel_name")
        or "Navire AIS"
    )
    ts_raw = props.get("timestamp") or props.get("last_seen") or props.get("time")
    try:
        if isinstance(ts_raw, (int, float)):
            horodatage = datetime.fromtimestamp(float(ts_raw), tz=UTC)
        elif isinstance(ts_raw, str) and ts_raw:
            horodatage = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        else:
            horodatage = datetime.now(UTC)
    except ValueError:
        horodatage = datetime.now(UTC)
    sog = props.get("sog") if props.get("sog") is not None else props.get("speed")
    cog = props.get("cog") if props.get("cog") is not None else props.get("course")
    ship_type = props.get("ship_type") or props.get("shiptype") or props.get("type")
    return _vessel(
        mmsi=mmsi,
        nom=str(name),
        lon=lon,
        lat=lat,
        horodatage=horodatage,
        sog_kn=float(sog) if sog not in (None, "") else None,
        cog_deg=float(cog) if cog not in (None, "") else None,
        ship_type=str(ship_type) if ship_type is not None else None,
        provider=str(props.get("provider") or "openwaters"),
    )


def _absorb(vessel: AisVesselRead, *, provider: str | None = None) -> None:
    """Intègre un AisVesselRead (REST, snapshot, démo) dans l'état de flotte."""
    lon, lat = vessel.position.coordinates
    fleet.upsert_position(
        mmsi=vessel.mmsi,
        lon=lon,
        lat=lat,
        horodatage=vessel.horodatage,
        sog_kn=vessel.sog_kn,
        cog_deg=vessel.cog_deg,
        nav_code=vessel.statut_nav_code,
        nom=vessel.nom,
        provider=provider or vessel.provider,
        demo=vessel.demo,
    )
    if vessel.ship_type or vessel.destination:
        try:
            st = int(vessel.ship_type) if vessel.ship_type else None
        except ValueError:
            st = None
        fleet.upsert_static(
            mmsi=vessel.mmsi,
            nom=vessel.nom if not vessel.nom.startswith("MMSI ") else None,
            ship_type=st,
            destination=vessel.destination,
            imo=vessel.imo,
            callsign=vessel.callsign,
            longueur_m=vessel.longueur_m,
        )


# --------------------------------------------------------------------------- #
# AISStream — messages
# --------------------------------------------------------------------------- #


def _handle_aisstream_message(msg: dict[str, Any], *, provider: str = "aisstream") -> bool:
    """Met à jour la flotte depuis un message AISStream. True si intégré."""
    meta = msg.get("MetaData") or {}
    body = msg.get("Message") or {}
    mmsi = str(meta.get("MMSI") or "").strip()
    if not mmsi:
        return False
    msg_type = msg.get("MessageType")
    name = meta.get("ShipName")

    if msg_type in ("ShipStaticData", "StaticDataReport"):
        data = body.get(msg_type) or {}
        if msg_type == "StaticDataReport":
            report_a = data.get("ReportA") or {}
            report_b = data.get("ReportB") or {}
            dim = report_b.get("Dimension") or {}
            fleet.upsert_static(
                mmsi=mmsi,
                nom=report_a.get("Name") or name,
                ship_type=report_b.get("ShipType"),
                callsign=report_b.get("CallSign"),
                longueur_m=(dim.get("A") or 0) + (dim.get("B") or 0) or None,
            )
        else:
            dim = data.get("Dimension") or {}
            fleet.upsert_static(
                mmsi=mmsi,
                nom=data.get("Name") or name,
                ship_type=data.get("Type"),
                destination=data.get("Destination"),
                imo=str(data.get("ImoNumber")) if data.get("ImoNumber") else None,
                callsign=data.get("CallSign"),
                longueur_m=(dim.get("A") or 0) + (dim.get("B") or 0) or None,
            )
        return True

    lon = meta.get("longitude")
    lat = meta.get("latitude")
    report = body.get(msg_type or "") or body.get("PositionReport") or {}
    if lon is None or lat is None:
        lon = report.get("Longitude")
        lat = report.get("Latitude")
    if lon is None or lat is None:
        return False
    lon, lat = float(lon), float(lat)
    in_gabon = point_in_gabon_waters(lon, lat)
    if not in_gabon and not point_in_surveillance_zone(lon, lat):
        return False
    sog = report.get("Sog")
    cog = report.get("Cog")
    heading = report.get("TrueHeading")
    nav = report.get("NavigationalStatus")
    ts: datetime | None = None
    raw_ts = meta.get("time_utc")
    if isinstance(raw_ts, str):
        try:
            ts = datetime.fromisoformat(raw_ts.split(" +")[0].replace(" ", "T")).replace(tzinfo=UTC)
        except ValueError:
            ts = None
    fleet.upsert_position(
        mmsi=mmsi,
        lon=lon,
        lat=lat,
        horodatage=ts,
        sog_kn=float(sog) if sog is not None and float(sog) < 102.3 else None,
        cog_deg=float(cog) if cog is not None and float(cog) < 360 else None,
        heading_deg=float(heading) if heading is not None else None,
        nav_code=int(nav) if nav is not None else None,
        nom=name,
        provider=provider,
        dans_eaux=in_gabon,
    )
    return True


def _parse_aisstream_message(msg: dict[str, Any]) -> AisVesselRead | None:
    """Compat : parse un message AISStream en AisVesselRead (collecte ponctuelle)."""
    meta = msg.get("MetaData") or {}
    lon = meta.get("longitude")
    lat = meta.get("latitude")
    mmsi = str(meta.get("MMSI") or "").strip()
    if lon is None or lat is None or not mmsi:
        return None
    pr = (msg.get("Message") or {}).get("PositionReport") or {}
    return _vessel(
        mmsi=mmsi,
        nom=str(meta.get("ShipName") or "Navire AIS").strip() or "Navire AIS",
        lon=float(lon),
        lat=float(lat),
        horodatage=datetime.now(UTC),
        sog_kn=float(pr["Sog"]) if pr.get("Sog") is not None else None,
        cog_deg=float(pr["Cog"]) if pr.get("Cog") is not None else None,
        provider="aisstream",
    )


def _aisstream_subscribe() -> dict[str, Any]:
    return {
        "APIKey": (settings.aisstream_api_key or "").strip(),
        "BoundingBoxes": [_aisstream_box()],
        "FilterMessageTypes": _AISSTREAM_TYPES,
    }


async def fetch_aisstream_ws(seconds: float | None = None) -> list[AisVesselRead]:
    """Collecte ponctuelle (script). Le service utilise le flux permanent."""
    key = (settings.aisstream_api_key or "").strip()
    if not key:
        return []
    try:
        import websockets
    except ImportError:
        return []
    sec = seconds if seconds is not None else float(settings.ais_collect_seconds)
    found: dict[str, AisVesselRead] = {}
    try:
        async with websockets.connect(_AISSTREAM_URL, open_timeout=25, max_size=4_000_000) as ws:
            await ws.send(json.dumps(_aisstream_subscribe()))
            loop = asyncio.get_running_loop()
            end = loop.time() + sec
            while loop.time() < end:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                except TimeoutError:
                    continue
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict):
                    _handle_aisstream_message(msg)
                    v = _parse_aisstream_message(msg)
                    if v:
                        found[v.mmsi] = v
    except Exception as exc:  # noqa: BLE001
        logger.warning("ais_ws_failed", provider="aisstream", error=str(exc))
    return list(found.values())


async def _stream_loop() -> None:
    """Connexion AISStream permanente avec reconnexion progressive."""
    try:
        import websockets
    except ImportError:
        stream_status.last_error = "dépendance websockets absente"
        logger.warning("ais_websockets_missing")
        return

    backoff = 5.0
    while True:
        key = (settings.aisstream_api_key or "").strip()
        stream_status.configured = bool(key)
        if not key:
            stream_status.connected = False
            await asyncio.sleep(60)
            continue
        try:
            async with websockets.connect(
                _AISSTREAM_URL, open_timeout=25, close_timeout=5, max_size=4_000_000
            ) as ws:
                await ws.send(json.dumps(_aisstream_subscribe()))
                stream_status.connected = True
                stream_status.since = datetime.now(UTC)
                stream_status.last_error = None
                backoff = 5.0
                logger.info("ais_stream_connected")
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=90.0)
                    except TimeoutError:
                        # Aucun message depuis 90 s : normal au Gabon (faible
                        # couverture). On garde la connexion ouverte.
                        continue
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(msg, dict):
                        continue
                    err = msg.get("error") or msg.get("Error")
                    if err and not msg.get("MessageType"):
                        stream_status.last_error = str(err)[:200]
                        logger.warning("ais_stream_server_error", error=str(err)[:200])
                        break
                    if msg.get("MessageType") == "SubscriptionConfirmation":
                        continue
                    if _handle_aisstream_message(msg):
                        stream_status.messages += 1
                        stream_status.last_message_at = datetime.now(UTC)
        except asyncio.CancelledError:
            stream_status.connected = False
            raise
        except Exception as exc:  # noqa: BLE001
            stream_status.last_error = str(exc)[:200]
            logger.warning("ais_stream_disconnected", error=str(exc)[:200])
        stream_status.connected = False
        stream_status.reconnects += 1
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 120.0)


# --------------------------------------------------------------------------- #
# Open Waters (complément optionnel)
# --------------------------------------------------------------------------- #


async def fetch_openwaters_rest() -> list[AisVesselRead]:
    if not settings.ais_openwaters_enabled:
        return []
    min_lat, min_lon, max_lat, max_lon = _GABON_BBOX
    url = (
        f"{settings.ais_openwaters_url.rstrip('/')}/v1/vessels"
        f"?bbox={min_lat},{min_lon},{max_lat},{max_lon}"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"User-Agent": "CBM-PIGAP/0.3 (AIS Gabon)"})
        resp.raise_for_status()
        data = resp.json()
    out: list[AisVesselRead] = []
    for f in data.get("features") or []:
        if isinstance(f, dict):
            v = _parse_openwaters_feature(f)
            if v:
                out.append(v)
    return out


async def fetch_openwaters_ws(seconds: float | None = None) -> list[AisVesselRead]:  # noqa: ARG001
    """Conservé pour compatibilité : le stream Open Waters n'est plus interrogé."""
    return []


# --------------------------------------------------------------------------- #
# Snapshot disque
# --------------------------------------------------------------------------- #


def load_snapshot() -> list[AisVesselRead]:
    if not _SNAPSHOT_PATH.exists():
        return []
    try:
        data = json.loads(_SNAPSHOT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    out: list[AisVesselRead] = []
    for f in data.get("features") or []:
        if isinstance(f, dict):
            v = _parse_openwaters_feature(f)
            if v:
                out.append(v.model_copy(update={"provider": "snapshot", "demo": False}))
    return out


def save_snapshot(vessels: list[AisVesselRead]) -> None:
    real = [v for v in vessels if not v.demo]
    if not real:
        return
    feats = []
    for v in real:
        feats.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [v.position.coordinates[0], v.position.coordinates[1]],
                },
                "properties": {
                    "mmsi": v.mmsi,
                    "name": v.nom,
                    "sog": v.sog_kn,
                    "cog": v.cog_deg,
                    "ship_type": v.ship_type,
                    "destination": v.destination,
                    "timestamp": v.horodatage.isoformat(),
                    "provider": v.provider,
                },
            }
        )
    payload = {
        "type": "FeatureCollection",
        "generated": datetime.now(UTC).isoformat(),
        "note": "Snapshot AIS eaux gabonaises (PIGAP ADR-005)",
        "features": feats,
    }
    try:
        _SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SNAPSHOT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("ais_snapshot_write_failed", error=str(exc))


def _demo_vessels() -> list[AisVesselRead]:
    now = datetime.now(UTC)
    samples = [
        (8.55, -0.15, "DÉMO AIS — cargo ZEE", "999000001", 8.5, 0),
        (8.85, -0.72, "DÉMO AIS — Port-Gentil", "999000002", 0.0, 5),
        (9.05, 0.25, "DÉMO AIS — large Estuaire", "999000003", 6.2, 7),
    ]
    out: list[AisVesselRead] = []
    for lon, lat, nom, mmsi, sog, nav in samples:
        v = _vessel(
            mmsi=mmsi,
            nom=nom,
            lon=lon,
            lat=lat,
            horodatage=now,
            sog_kn=sog,
            cog_deg=210.0,
            ship_type="70",
            provider="demo",
            demo=True,
        )
        if v:
            out.append(v.model_copy(update={"statut_nav_code": nav}))
    return out


# --------------------------------------------------------------------------- #
# Ingestion récepteurs locaux
# --------------------------------------------------------------------------- #


def ingest_local(payload: AisIngestPayload) -> AisIngestResult:
    provider = f"local:{payload.recepteur}" if payload.recepteur else "local"
    normalized: list[dict[str, Any]] = []
    errors = 0
    total = 0
    for obj in payload.messages or []:
        total += 1
        n = ingest_mod.normalize_aiscatcher(obj)
        if n is None:
            errors += 1
        else:
            normalized.append(n)
    if payload.nmea:
        total += len(payload.nmea)
        parsed, nmea_errors = ingest_mod.normalize_nmea(payload.nmea)
        errors += nmea_errors
        normalized.extend(parsed)

    integrated = 0
    out_of_zone = 0
    for n in normalized:
        if n["kind"] == "position":
            in_gabon = point_in_gabon_waters(n["lon"], n["lat"])
            if not in_gabon and not point_in_surveillance_zone(n["lon"], n["lat"]):
                out_of_zone += 1
                continue
            fleet.upsert_position(
                dans_eaux=in_gabon,
                mmsi=n["mmsi"],
                lon=n["lon"],
                lat=n["lat"],
                horodatage=n.get("horodatage"),
                sog_kn=n.get("sog_kn"),
                cog_deg=n.get("cog_deg"),
                heading_deg=n.get("heading_deg"),
                nav_code=n.get("nav_code"),
                nom=n.get("nom"),
                provider=provider,
            )
            integrated += 1
        else:
            fleet.upsert_static(
                mmsi=n["mmsi"],
                nom=n.get("nom"),
                ship_type=n.get("ship_type"),
                destination=n.get("destination"),
                imo=n.get("imo"),
                callsign=n.get("callsign"),
                longueur_m=n.get("longueur_m"),
            )
            integrated += 1
    fleet.touch_receiver(payload.recepteur or "local")
    _invalidate_cache()
    return AisIngestResult(
        recus=total,
        integres=integrated,
        hors_zone=out_of_zone,
        erreurs=errors,
        flotte=len(fleet),
    )


def _invalidate_cache() -> None:
    global _cache_fetched_at
    _cache_fetched_at = None


# --------------------------------------------------------------------------- #
# Agrégation ports
# --------------------------------------------------------------------------- #


def _port_summaries(vessels: list[AisVesselRead], *, with_vessels: bool = False) -> list[Any]:
    by_port: dict[str, list[AisVesselRead]] = {}
    for v in vessels:
        if v.port_id:
            by_port.setdefault(v.port_id, []).append(v)
    out: list[Any] = []
    for port in load_ports():
        items = by_port.get(port.id, [])
        base = {
            "id": port.id,
            "nom": port.nom,
            "type": port.type,
            "lon": port.lon,
            "lat": port.lat,
            "rayon_km": port.rayon_km,
            "navires": len(items),
            "a_quai": sum(1 for v in items if v.statut_nav == "a_quai"),
            "au_mouillage": sum(1 for v in items if v.statut_nav == "au_mouillage"),
            "en_route": sum(1 for v in items if v.statut_nav in ("en_route", "en_route_voile")),
            "en_peche": sum(1 for v in items if v.statut_nav == "en_peche"),
        }
        if with_vessels:
            out.append(AisPortDetail(**base, vessels=items))
        else:
            out.append(AisPortSummary(**base))
    return out


# --------------------------------------------------------------------------- #
# Lecture / cache
# --------------------------------------------------------------------------- #


def _humanize_age(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{s} s"
    if s < 3600:
        return f"{s // 60} min"
    return f"{s // 3600} h {(s % 3600) // 60:02d}"


def _build_note(vessels: list[AisVesselRead], parts: list[str]) -> str:
    key_present = bool((settings.aisstream_api_key or "").strip())
    real = [v for v in vessels if not v.demo]
    now = datetime.now(UTC)
    segments: list[str] = []

    if stream_status.connected:
        seg = "Flux AISStream connecté"
        if stream_status.last_message_at:
            age = _humanize_age((now - stream_status.last_message_at).total_seconds())
            seg += f" · dernier message il y a {age}"
        else:
            seg += " · aucun message reçu pour les eaux gabonaises depuis la connexion"
        segments.append(seg)
    elif key_present:
        segments.append(
            "Flux AISStream en reconnexion"
            + (f" ({stream_status.last_error})" if stream_status.last_error else "")
        )
    else:
        segments.append("Clé AISSTREAM_API_KEY absente : flux communautaire inactif")

    rx = fleet.active_receivers()
    if rx:
        segments.append(f"{rx} récepteur(s) AIS local(aux) actif(s)")
    else:
        segments.append("aucun récepteur AIS local raccordé")

    if real:
        ports = [v for v in real if v.port_id]
        segments.append(f"{len(real)} navire(s) suivi(s), dont {len(ports)} au port")
    else:
        segments.append(
            "Aucun navire AIS reçu : la couverture des réseaux communautaires est quasi "
            "nulle sur le littoral gabonais. Un récepteur AIS local à Owendo et à "
            "Port-Gentil est nécessaire pour voir les navires au port."
        )
    segments.extend(parts)
    return " · ".join(segments)


async def refresh_ais_cache(*, force: bool = False) -> AisLiveResponse:
    global _cache_fetched_at, _cache_response, _last_snapshot_at, _snapshot_loaded

    if not settings.ais_enabled:
        return AisLiveResponse(
            enabled=False,
            vessels=[],
            fetched_at=None,
            source="disabled",
            note="AIS désactivé (AIS_ENABLED=false).",
            eez_filter=True,
        )

    async with _cache_lock:
        now = datetime.now(UTC)
        if (
            not force
            and _cache_response is not None
            and _cache_fetched_at is not None
            and (now - _cache_fetched_at).total_seconds() < _cache_ttl_sec
        ):
            return _cache_response

        parts: list[str] = []
        sources: set[str] = set()

        # Snapshot disque : une seule fois, au premier appel après démarrage
        if not _snapshot_loaded:
            _snapshot_loaded = True
            for v in load_snapshot():
                _absorb(v, provider="snapshot")

        # Open Waters REST (complément, court timeout)
        try:
            rest = await fetch_openwaters_rest()
            for v in rest:
                _absorb(v, provider="openwaters")
            if rest:
                parts.append(f"Open Waters {len(rest)}")
        except Exception as exc:  # noqa: BLE001
            parts.append(f"Open Waters indisponible ({type(exc).__name__})")

        fleet.purge(now)
        tous = [v for v in fleet.snapshot(now) if not v.demo]
        vessels = [v for v in tous if v.dans_eaux_gabon]
        approches = sorted(
            (v for v in tous if not v.dans_eaux_gabon and v.entree_prevue_h is not None),
            key=lambda v: v.entree_prevue_h or 0,
        )
        for v in tous:
            sources.add(v.provider.split(":", 1)[0])
        if approches:
            parts.append(f"{len(approches)} navire(s) en approche (route extrapolée)")

        if not vessels and settings.ais_demo_when_empty:
            vessels = _demo_vessels()
            sources.add("demo")
            parts.append("mode démonstration (AIS_DEMO_WHEN_EMPTY=true)")

        real = [v for v in vessels if not v.demo]
        if real and (
            _last_snapshot_at is None
            or (now - _last_snapshot_at).total_seconds() >= settings.ais_snapshot_seconds
        ):
            save_snapshot(real)
            _last_snapshot_at = now

        note = _build_note(vessels, parts)
        if not vessels and not (settings.aisstream_api_key or "").strip():
            note += " · Ajoutez AISSTREAM_API_KEY (https://aisstream.io) ou raccordez un récepteur."

        stream_status.configured = bool((settings.aisstream_api_key or "").strip())
        response = AisLiveResponse(
            enabled=True,
            vessels=vessels,
            fetched_at=now,
            source="+".join(sorted(sources)) if sources else "empty",
            note=note,
            eez_filter=True,
            stream=stream_status.model_copy(),
            ports=_port_summaries(vessels),
            recepteurs_locaux=fleet.active_receivers(),
            approches=approches,
        )
        _cache_response = response
        _cache_fetched_at = now
        return response


async def list_ais_live(*, force: bool = False) -> AisLiveResponse:
    return await refresh_ais_cache(force=force)


async def list_ais_ports() -> AisPortsResponse:
    live = await refresh_ais_cache()
    return AisPortsResponse(
        fetched_at=live.fetched_at or datetime.now(UTC),
        ports=_port_summaries(live.vessels, with_vessels=True),
    )


# --------------------------------------------------------------------------- #
# Fiche navire : identification, régularité, localisation
# --------------------------------------------------------------------------- #


async def get_vessel_detail(db: AsyncSession, mmsi: str) -> AisVesselDetail | None:
    found = fleet.get(mmsi)
    if found is None:
        return None
    vessel, track = found
    lon, lat = vessel.position.coordinates
    motifs: list[str] = []
    niveau = 0  # 0 conforme · 1 à vérifier · 2 alerte

    # Zones réglementées touchées (PostGIS)
    zones: list[AisZoneTouchee] = []
    try:
        point = WKTElement(f"POINT({lon} {lat})", srid=4326)
        rows = await db.execute(
            select(ZoneReglementee)
            .where(ZoneReglementee.actif.is_(True))
            .where(ST_Intersects(ZoneReglementee.geometrie, point))
        )
        today = datetime.now(UTC).date()
        for z in rows.scalars().all():
            if z.periode_debut and today < z.periode_debut:
                continue
            if z.periode_fin and today > z.periode_fin:
                continue
            zones.append(AisZoneTouchee(id=str(z.id), nom=z.nom, type=z.type.value))
            if z.type.value == "interdite":
                niveau = 2
                motifs.append(f"Position relevée dans la zone interdite « {z.nom} »")
            elif z.type.value == "protegee":
                niveau = max(niveau, 1)
                motifs.append(f"Position dans la zone protégée « {z.nom} »")
    except Exception as exc:  # noqa: BLE001 — base indisponible : fiche partielle
        logger.warning("ais_detail_zones_failed", error=str(exc))

    # Correspondance avec le registre PIGAP (nom, indicatif, MMSI)
    registre: AisRegistreCorrespondance | None = None
    try:
        candidats = (
            [vessel.nom.strip()] if vessel.nom and not vessel.nom.startswith("MMSI ") else []
        )
        conds = [func.lower(Embarcation.nom) == c.lower() for c in candidats]
        immats = [x for x in (vessel.callsign, vessel.mmsi) if x]
        if immats:
            conds.append(Embarcation.immatriculation.in_(immats))
        if conds:
            rows = await db.execute(
                select(Embarcation, Pecheur, Organisation)
                .join(Pecheur, Pecheur.id == Embarcation.pecheur_id)
                .outerjoin(Organisation, Organisation.id == Pecheur.organisation_id)
                .where(or_(*conds))
                .limit(1)
            )
            hit = rows.first()
            if hit is not None:
                emb, pecheur, org = hit
                methode = "immatriculation" if emb.immatriculation in immats else "nom"
                registre = AisRegistreCorrespondance(
                    embarcation_id=str(emb.id),
                    embarcation_nom=emb.nom,
                    immatriculation=emb.immatriculation,
                    pecheur_nom=f"{pecheur.prenom} {pecheur.nom}",
                    numero_licence=pecheur.numero_licence,
                    statut_pecheur=pecheur.statut.value,
                    organisation=org.nom if org else None,
                    methode=methode,
                )
                if pecheur.statut.value != "actif":
                    niveau = 2
                    motifs.append(
                        f"Licence {pecheur.numero_licence} : pêcheur {pecheur.statut.value}"
                    )
    except Exception as exc:  # noqa: BLE001
        logger.warning("ais_detail_registre_failed", error=str(exc))

    est_pecheur = vessel.statut_nav == "en_peche" or (vessel.type_label or "") == "Navire de pêche"
    if registre is None and est_pecheur and vessel.dans_eaux_gabon:
        niveau = max(niveau, 1)
        motifs.append("Navire de pêche absent du registre PIGAP : licence à vérifier")
    if vessel.statut_nav == "en_peche" and vessel.dans_eaux_gabon:
        motifs.append("Statut AIS « en pêche » dans les eaux gabonaises")
    libre = bool(vessel.pavillon_code and vessel.pavillon_code in PAVILLONS_LIBRE_IMMATRICULATION)
    if libre:
        motifs.append(f"Pavillon de libre immatriculation ({vessel.pavillon})")
    if not vessel.pavillon:
        motifs.append("Pavillon indéterminé (MMSI hors table)")
    if vessel.age_s > 3600:
        motifs.append("Aucun message AIS depuis plus d'une heure")

    return AisVesselDetail(
        vessel=vessel,
        track=track,
        zones_reglementees=zones,
        registre=registre,
        regularite=("conforme", "a_verifier", "alerte")[niveau],
        motifs=motifs,
        libre_immatriculation=libre,
    )


# --------------------------------------------------------------------------- #
# Tâches de fond
# --------------------------------------------------------------------------- #

_stream_task: asyncio.Task | None = None
_maint_task: asyncio.Task | None = None


async def _maintenance_loop() -> None:
    while True:
        try:
            await refresh_ais_cache(force=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("ais_maintenance_failed", error=str(exc))
        await asyncio.sleep(max(15, settings.ais_poll_seconds))


def start_ais_background() -> None:
    global _stream_task, _maint_task
    if not settings.ais_enabled:
        return
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    if _stream_task is None or _stream_task.done():
        _stream_task = asyncio.create_task(_stream_loop(), name="ais-gabon-stream")
    if _maint_task is None or _maint_task.done():
        _maint_task = asyncio.create_task(_maintenance_loop(), name="ais-gabon-maintenance")
    logger.info(
        "ais_background_started",
        poll_seconds=settings.ais_poll_seconds,
        has_aisstream_key=bool((settings.aisstream_api_key or "").strip()),
        coastal_buffer_deg=settings.ais_coastal_buffer_deg,
    )


async def stop_ais_background() -> None:
    global _stream_task, _maint_task
    for task in (_stream_task, _maint_task):
        if task is None:
            continue
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    _stream_task = None
    _maint_task = None
