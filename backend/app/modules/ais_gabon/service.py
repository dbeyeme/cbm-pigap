"""Surveillance AIS open data — navires dans la ZEE gabonaise (ADR-005).

Sources (par priorité) :
1. AISStream WebSocket (clé gratuite) — meilleur pour couverture côtière
2. Open Waters REST + WebSocket
3. Dernier snapshot disque `ais_zee_snapshot.geojson`
4. Démo explicite si AIS_DEMO_WHEN_EMPTY=true

Séparé du GPS pêcheurs PIGAP. Pas de pirogues fluviales (pas d'AIS).
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
import structlog
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry

from app.core.config import settings
from app.modules.ais_gabon.schemas import AisLiveResponse, AisVesselRead
from app.schemas.common import PointGeoJSON

logger = structlog.get_logger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[4]
_EEZ_PATH = _REPO_ROOT / "data" / "open-data" / "gabon" / "eez_marineregions.geojson"
_SNAPSHOT_PATH = _REPO_ROOT / "data" / "open-data" / "gabon" / "ais_zee_snapshot.geojson"

# Bbox enveloppe ZEE (minLat, minLon, maxLat, maxLon)
_GABON_BBOX = (-6.6, 6.7, 1.3, 11.4)
# AISStream : coins [[lat,lon],[lat,lon]]
_AISSTREAM_BOX = [[_GABON_BBOX[0], _GABON_BBOX[1]], [_GABON_BBOX[2], _GABON_BBOX[3]]]

_cache_lock = asyncio.Lock()
_cache_vessels: list[AisVesselRead] = []
_cache_fetched_at: datetime | None = None
_cache_source: str = "none"
_cache_note: str = ""
_cache_ttl_sec = 30.0


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


def point_in_gabon_eez(lon: float, lat: float) -> bool:
    geom = _eez_geom()
    if geom is None:
        return False
    p = Point(lon, lat)
    return bool(geom.contains(p) or geom.covers(p))


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
    if not point_in_gabon_eez(lon, lat):
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
    sog = props.get("sog") or props.get("speed")
    cog = props.get("cog") or props.get("course")
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
        provider="openwaters",
    )


def _parse_aisstream_message(msg: dict[str, Any]) -> AisVesselRead | None:
    meta = msg.get("MetaData") or {}
    lon = meta.get("longitude")
    lat = meta.get("latitude")
    mmsi = str(meta.get("MMSI") or "").strip()
    name = meta.get("ShipName") or "Navire AIS"
    if lon is None or lat is None:
        pr = (msg.get("Message") or {}).get("PositionReport") or {}
        lon = pr.get("Longitude")
        lat = pr.get("Latitude")
    if lon is None or lat is None or not mmsi:
        return None
    sog = None
    cog = None
    pr = (msg.get("Message") or {}).get("PositionReport") or {}
    if pr.get("Sog") is not None:
        sog = float(pr["Sog"])
    if pr.get("Cog") is not None:
        cog = float(pr["Cog"])
    return _vessel(
        mmsi=mmsi,
        nom=str(name).strip() or "Navire AIS",
        lon=float(lon),
        lat=float(lat),
        horodatage=datetime.now(UTC),
        sog_kn=sog,
        cog_deg=cog,
        provider="aisstream",
    )


def _parse_openwaters_ws(msg: dict[str, Any]) -> AisVesselRead | None:
    """Formats variables du stream Open Waters v1."""
    if msg.get("MessageType") or msg.get("MetaData"):
        return _parse_aisstream_message(msg)
    lon = msg.get("lon") or msg.get("longitude")
    lat = msg.get("lat") or msg.get("latitude")
    if lon is None and isinstance(msg.get("geometry"), dict):
        coords = msg["geometry"].get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            lon, lat = coords[0], coords[1]
    if lon is None or lat is None:
        return None
    props = msg.get("properties") or msg
    mmsi = str(props.get("mmsi") or props.get("MMSI") or props.get("userid") or "").strip()
    if not mmsi:
        return None
    name = props.get("name") or props.get("shipname") or props.get("ShipName") or "Navire AIS"
    return _vessel(
        mmsi=mmsi,
        nom=str(name),
        lon=float(lon),
        lat=float(lat),
        horodatage=datetime.now(UTC),
        sog_kn=float(props["sog"]) if props.get("sog") not in (None, "") else None,
        cog_deg=float(props["cog"]) if props.get("cog") not in (None, "") else None,
        provider="openwaters_ws",
    )


async def fetch_openwaters_rest() -> list[AisVesselRead]:
    min_lat, min_lon, max_lat, max_lon = _GABON_BBOX
    url = (
        f"{settings.ais_openwaters_url.rstrip('/')}/v1/vessels"
        f"?bbox={min_lat},{min_lon},{max_lat},{max_lon}"
    )
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.get(url, headers={"User-Agent": "CBM-PIGAP/0.2 (AIS ZEE Gabon)"})
        resp.raise_for_status()
        data = resp.json()
    out: list[AisVesselRead] = []
    for f in data.get("features") or []:
        if isinstance(f, dict):
            v = _parse_openwaters_feature(f)
            if v:
                out.append(v)
    return out


async def _ws_collect(
    url: str,
    subscribe: dict[str, Any],
    *,
    seconds: float,
    parse,
    provider: str,
) -> list[AisVesselRead]:
    try:
        import websockets
    except ImportError:
        logger.warning("ais_websockets_missing", provider=provider)
        return []

    found: dict[str, AisVesselRead] = {}
    # Si un proxy SOCKS est injecté (Cursor), python-socks est requis.
    has_socks = any("socks" in k.lower() for k in os.environ)
    if has_socks:
        try:
            import python_socks  # noqa: F401
        except ImportError:
            logger.warning(
                "ais_ws_socks_missing",
                provider=provider,
                hint="pip install 'python-socks[asyncio]'",
            )

    connect_kwargs: dict[str, Any] = {
        "open_timeout": 25,
        "close_timeout": 5,
        "max_size": 4_000_000,
    }
    # Laisser websockets utiliser le proxy d'environnement s'il est présent.
    try:
        async with websockets.connect(url, **connect_kwargs) as ws:
            await ws.send(json.dumps(subscribe))
            loop = asyncio.get_running_loop()
            end = loop.time() + seconds
            while loop.time() < end:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                except TimeoutError:
                    continue
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(msg, dict):
                    continue
                err = msg.get("error") or msg.get("Error")
                if err and not msg.get("MessageType") and not msg.get("MetaData"):
                    logger.warning("ais_ws_server_error", provider=provider, error=str(err)[:200])
                    break
                v = parse(msg)
                if v:
                    found[v.mmsi] = v
    except Exception as exc:  # noqa: BLE001
        logger.warning("ais_ws_failed", provider=provider, error=str(exc))
    return list(found.values())


async def fetch_aisstream_ws(seconds: float | None = None) -> list[AisVesselRead]:
    key = (settings.aisstream_api_key or "").strip()
    if not key:
        return []
    sec = seconds if seconds is not None else float(settings.ais_collect_seconds)
    return await _ws_collect(
        "wss://stream.aisstream.io/v0/stream",
        {
            "APIKey": key,
            "BoundingBoxes": [_AISSTREAM_BOX],
            "FilterMessageTypes": ["PositionReport"],
        },
        seconds=sec,
        parse=_parse_aisstream_message,
        provider="aisstream",
    )


async def fetch_openwaters_ws(seconds: float | None = None) -> list[AisVesselRead]:
    sec = seconds if seconds is not None else min(20.0, float(settings.ais_collect_seconds))
    min_lat, min_lon, max_lat, max_lon = _GABON_BBOX
    return await _ws_collect(
        f"{settings.ais_openwaters_url.rstrip('/').replace('https://', 'wss://').replace('http://', 'ws://')}/v1/stream",
        {"type": "subscribe", "bbox": [[min_lat, min_lon, max_lat, max_lon]]},
        seconds=sec,
        parse=_parse_openwaters_ws,
        provider="openwaters_ws",
    )


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
                # snapshot = réel capturé, pas démo
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
                    "timestamp": v.horodatage.isoformat(),
                    "provider": v.provider,
                },
            }
        )
    payload = {
        "type": "FeatureCollection",
        "generated": datetime.now(UTC).isoformat(),
        "note": "Snapshot AIS filtré ZEE Gabon (PIGAP ADR-005)",
        "features": feats,
    }
    _SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SNAPSHOT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _demo_vessels() -> list[AisVesselRead]:
    now = datetime.now(UTC)
    samples = [
        (8.55, -0.15, "DÉMO AIS — cargo ZEE", "999000001"),
        (8.85, -0.72, "DÉMO AIS — Cap Lopez", "999000002"),
        (9.05, 0.25, "DÉMO AIS — large Estuaire", "999000003"),
    ]
    out: list[AisVesselRead] = []
    for lon, lat, nom, mmsi in samples:
        v = _vessel(
            mmsi=mmsi,
            nom=nom,
            lon=lon,
            lat=lat,
            horodatage=now,
            sog_kn=8.5,
            cog_deg=210.0,
            ship_type="cargo",
            provider="demo",
            demo=True,
        )
        if v:
            out.append(v)
    return out


def _dedupe(vessels: list[AisVesselRead]) -> list[AisVesselRead]:
    by_mmsi: dict[str, AisVesselRead] = {}
    for v in vessels:
        prev = by_mmsi.get(v.mmsi)
        if prev is None or v.horodatage >= prev.horodatage:
            by_mmsi[v.mmsi] = v
    return sorted(by_mmsi.values(), key=lambda x: x.horodatage, reverse=True)


async def refresh_ais_cache(*, force: bool = False) -> AisLiveResponse:
    global _cache_vessels, _cache_fetched_at, _cache_source, _cache_note

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
            and _cache_fetched_at is not None
            and (now - _cache_fetched_at).total_seconds() < _cache_ttl_sec
        ):
            return AisLiveResponse(
                enabled=True,
                vessels=list(_cache_vessels),
                fetched_at=_cache_fetched_at,
                source=_cache_source,
                note=_cache_note,
                eez_filter=True,
            )

        vessels: list[AisVesselRead] = []
        parts: list[str] = []
        sources: list[str] = []

        # 1) AISStream (clé)
        try:
            stream = await fetch_aisstream_ws()
            if stream:
                vessels.extend(stream)
                sources.append("aisstream")
                parts.append(f"AISStream {len(stream)}")
            elif not (settings.aisstream_api_key or "").strip():
                parts.append("AISStream: clé absente (AISSTREAM_API_KEY)")
            else:
                parts.append("AISStream: 0 message dans la fenêtre / hors ZEE")
        except Exception as exc:  # noqa: BLE001
            parts.append(f"AISStream erreur: {exc}")

        # 2) Open Waters REST
        try:
            rest = await fetch_openwaters_rest()
            vessels.extend(rest)
            if rest:
                sources.append("openwaters")
            parts.append(f"OpenWaters REST {len(rest)}")
        except Exception as exc:  # noqa: BLE001
            parts.append(f"OpenWaters REST: {exc}")

        # 3) Open Waters WS si toujours vide
        if not any(not v.demo for v in vessels):
            try:
                ows = await fetch_openwaters_ws()
                vessels.extend(ows)
                if ows:
                    sources.append("openwaters_ws")
                parts.append(f"OpenWaters WS {len(ows)}")
            except Exception as exc:  # noqa: BLE001
                parts.append(f"OpenWaters WS: {exc}")

        vessels = _dedupe([v for v in vessels if not v.demo])

        # 4) Snapshot disque
        if not vessels:
            snap = load_snapshot()
            if snap:
                vessels = _dedupe(snap)
                sources.append("snapshot")
                parts.append(f"snapshot disque {len(snap)}")

        # 5) Démo (opt-in)
        if not vessels and settings.ais_demo_when_empty:
            vessels = _demo_vessels()
            sources.append("demo")
            parts.append(
                "aucun AIS réel en ZEE → DÉMO " "(vérifie AISSTREAM_API_KEY / couverture AIS Gabon)"
            )

        if vessels and not all(v.demo for v in vessels):
            save_snapshot(vessels)

        source = "+".join(sources) if sources else "empty"
        note = " · ".join(parts)
        if not vessels:
            if (settings.aisstream_api_key or "").strip():
                note += (
                    " · Aucun navire AIS dans la ZEE Gabon sur cette fenêtre "
                    "(clé OK — couverture faible ou aucun transit). Réessaie plus tard "
                    "ou élargis AIS_COLLECT_SECONDS."
                )
            else:
                note += (
                    " · Aucun navire AIS en ZEE. Ajoute AISSTREAM_API_KEY "
                    "(https://aisstream.io)."
                )

        _cache_vessels = vessels
        _cache_fetched_at = now
        _cache_source = source
        _cache_note = note
        return AisLiveResponse(
            enabled=True,
            vessels=vessels,
            fetched_at=now,
            source=source,
            note=note,
            eez_filter=True,
        )


async def list_ais_live(*, force: bool = False) -> AisLiveResponse:
    return await refresh_ais_cache(force=force)


_bg_task: asyncio.Task | None = None


async def _background_loop() -> None:
    while True:
        try:
            await refresh_ais_cache(force=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("ais_bg_refresh_failed", error=str(exc))
        await asyncio.sleep(max(30, settings.ais_poll_seconds))


def start_ais_background() -> None:
    global _bg_task
    if not settings.ais_enabled:
        return
    if _bg_task is not None and not _bg_task.done():
        return
    _bg_task = asyncio.create_task(_background_loop(), name="ais-gabon-poll")
    logger.info(
        "ais_background_started",
        poll_seconds=settings.ais_poll_seconds,
        has_aisstream_key=bool((settings.aisstream_api_key or "").strip()),
    )


async def stop_ais_background() -> None:
    global _bg_task
    if _bg_task is None:
        return
    _bg_task.cancel()
    try:
        await _bg_task
    except asyncio.CancelledError:
        pass
    _bg_task = None
