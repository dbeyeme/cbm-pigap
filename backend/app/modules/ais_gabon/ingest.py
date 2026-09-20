"""Normalisation des messages d'un récepteur AIS local.

Deux formats acceptés :
- JSON décodé par AIS-catcher (`AIS-catcher -H http://…/api/v1/ais/ingest`
  ou export JSON) — clés `mmsi`, `lat`, `lon`, `speed`, `course`, `heading`,
  `status`, `shipname`, `shiptype`, `destination`, `imo`, `callsign`,
  `to_bow`, `to_stern`, `type` (numéro de message), `rxtime`.
- NMEA brut (`!AIVDM` / `!AIVDO`), décodé avec `pyais` (dépendance optionnelle).

Sortie : dictionnaires normalisés, tous avec `kind` = `position` ou `static`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

POSITION_MSG_TYPES = {1, 2, 3, 9, 18, 19, 27}
STATIC_MSG_TYPES = {5, 24}


def _f(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if out != out:  # NaN
        return None
    return out


def _i(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _valid_coords(lon: float | None, lat: float | None) -> bool:
    if lon is None or lat is None:
        return False
    # 181 / 91 = « non disponible » dans la norme AIS
    return -180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0


def _parse_rxtime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%Y%m%d%H%M%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(text, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_aiscatcher(obj: dict[str, Any]) -> dict[str, Any] | None:
    """Message JSON AIS-catcher → dict normalisé (ou None si inutilisable)."""
    mmsi = obj.get("mmsi")
    if mmsi in (None, "", 0):
        return None
    msg_type = _i(obj.get("type"))
    lon = _f(obj.get("lon"))
    lat = _f(obj.get("lat"))
    ts = _parse_rxtime(obj.get("rxtime")) or datetime.now(UTC)

    if (msg_type in POSITION_MSG_TYPES or msg_type is None) and _valid_coords(lon, lat):
        sog = _f(obj.get("speed"))
        if sog is not None and sog >= 102.3:  # 1023 = non disponible
            sog = None
        cog = _f(obj.get("course"))
        if cog is not None and cog >= 360:
            cog = None
        return {
            "kind": "position",
            "mmsi": str(mmsi),
            "lon": lon,
            "lat": lat,
            "horodatage": ts,
            "sog_kn": sog,
            "cog_deg": cog,
            "heading_deg": _f(obj.get("heading")),
            "nav_code": _i(obj.get("status")),
            "nom": obj.get("shipname"),
        }
    if msg_type in STATIC_MSG_TYPES or any(
        k in obj for k in ("shipname", "shiptype", "destination", "callsign")
    ):
        to_bow = _f(obj.get("to_bow"))
        to_stern = _f(obj.get("to_stern"))
        length = (to_bow or 0) + (to_stern or 0) if (to_bow or to_stern) else None
        return {
            "kind": "static",
            "mmsi": str(mmsi),
            "nom": obj.get("shipname"),
            "ship_type": _i(obj.get("shiptype")),
            "destination": obj.get("destination"),
            "imo": obj.get("imo"),
            "callsign": obj.get("callsign"),
            "longueur_m": length,
        }
    return None


def _group_nmea(lines: list[str]) -> list[list[str]]:
    """Regroupe les fragments multi-phrases (champs 2/3/4 : total, index, seq)."""
    groups: list[list[str]] = []
    pending: dict[str, list[str | None]] = {}
    for raw in lines:
        line = raw.strip()
        if not line.startswith(("!AIVDM", "!AIVDO", "!BSVDM", "!ABVDM")):
            continue
        parts = line.split(",")
        if len(parts) < 6:
            continue
        try:
            total = int(parts[1])
            idx = int(parts[2])
        except ValueError:
            continue
        if total <= 1:
            groups.append([line])
            continue
        seq = parts[3] or "0"
        slots = pending.setdefault(seq, [None] * total)
        if 1 <= idx <= total:
            slots[idx - 1] = line
        if all(slots):
            groups.append([s for s in slots if s])
            del pending[seq]
    return groups


def normalize_nmea(lines: list[str]) -> tuple[list[dict[str, Any]], int]:
    """Phrases NMEA → dicts normalisés. Retourne (messages, erreurs)."""
    try:
        from pyais import decode
    except ImportError:
        logger.warning("ais_pyais_missing", hint="pip install pyais")
        return [], len(lines)

    out: list[dict[str, Any]] = []
    errors = 0
    for group in _group_nmea(lines):
        try:
            msg = decode(*group)
        except Exception:  # noqa: BLE001 — trame corrompue : on continue
            errors += 1
            continue
        data = msg.asdict()
        mmsi = data.get("mmsi")
        if not mmsi:
            errors += 1
            continue
        msg_type = _i(data.get("msg_type"))
        lon = _f(data.get("lon"))
        lat = _f(data.get("lat"))
        if msg_type in POSITION_MSG_TYPES and _valid_coords(lon, lat):
            status = data.get("status")
            nav_code = _i(getattr(status, "value", status))
            sog = _f(data.get("speed"))
            if sog is not None and sog >= 102.3:
                sog = None
            cog = _f(data.get("course"))
            if cog is not None and cog >= 360:
                cog = None
            out.append(
                {
                    "kind": "position",
                    "mmsi": str(mmsi),
                    "lon": lon,
                    "lat": lat,
                    "horodatage": datetime.now(UTC),
                    "sog_kn": sog,
                    "cog_deg": cog,
                    "heading_deg": _f(data.get("heading")),
                    "nav_code": nav_code,
                    "nom": None,
                }
            )
        elif msg_type in STATIC_MSG_TYPES:
            ship_type = data.get("ship_type")
            to_bow = _f(data.get("to_bow"))
            to_stern = _f(data.get("to_stern"))
            length = (to_bow or 0) + (to_stern or 0) if (to_bow or to_stern) else None
            out.append(
                {
                    "kind": "static",
                    "mmsi": str(mmsi),
                    "nom": data.get("shipname"),
                    "ship_type": _i(getattr(ship_type, "value", ship_type)),
                    "destination": data.get("destination"),
                    "imo": data.get("imo"),
                    "callsign": data.get("callsign"),
                    "longueur_m": length,
                }
            )
    return out, errors
