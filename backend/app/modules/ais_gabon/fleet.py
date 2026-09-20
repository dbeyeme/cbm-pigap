"""État de flotte AIS en mémoire — accumulation continue, expiration par TTL.

Un flux AIS ne « liste » jamais les navires : chaque navire émet sa position à
son rythme (toutes les 2 à 10 s en route, toutes les 3 min à quai ou au
mouillage, toutes les 6 min pour les données statiques). Une collecte de
quelques secondes ne voit donc presque jamais les navires immobiles au port.
Ce magasin conserve la dernière position connue de chaque MMSI et l'expire
selon son état (en route vs immobile).
"""

from __future__ import annotations

import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.modules.ais_gabon.flags import pavillon_from_mmsi
from app.modules.ais_gabon.navigation import estimated_position, predict_entry
from app.modules.ais_gabon.ports import (
    classify_statut_nav,
    port_proche,
    ship_type_label,
)
from app.modules.ais_gabon.schemas import AisTrackPoint, AisVesselRead
from app.schemas.common import PointGeoJSON

TRACK_MAXLEN = 120


@dataclass
class _Static:
    nom: str | None = None
    ship_type: int | None = None
    destination: str | None = None
    imo: str | None = None
    callsign: str | None = None
    longueur_m: float | None = None
    updated_at: datetime | None = None


@dataclass
class _Entry:
    mmsi: str
    lon: float
    lat: float
    horodatage: datetime
    received_at: datetime
    provider: str
    sog_kn: float | None = None
    cog_deg: float | None = None
    heading_deg: float | None = None
    nav_code: int | None = None
    nom_position: str | None = None
    demo: bool = False
    dans_eaux: bool = True
    static: _Static = field(default_factory=_Static)
    track: deque[tuple[datetime, float, float, float | None, float | None]] = field(
        default_factory=lambda: deque(maxlen=TRACK_MAXLEN)
    )


def _clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).replace("@", "").strip()
    return text or None


class FleetStore:
    """Dernière position connue par MMSI, données statiques fusionnées."""

    def __init__(self) -> None:
        self._entries: dict[str, _Entry] = {}
        self._lock = threading.Lock()
        self.receivers: dict[str, datetime] = {}
        # Injecté par le service (évite l'import circulaire) : eaux gabonaises ?
        self.inside_gabon: Callable[[float, float], bool] = lambda _lon, _lat: True

    # ---- écriture -------------------------------------------------------

    def upsert_position(
        self,
        *,
        mmsi: str,
        lon: float,
        lat: float,
        horodatage: datetime | None = None,
        sog_kn: float | None = None,
        cog_deg: float | None = None,
        heading_deg: float | None = None,
        nav_code: int | None = None,
        nom: str | None = None,
        provider: str,
        demo: bool = False,
        dans_eaux: bool = True,
    ) -> None:
        now = datetime.now(UTC)
        ts = horodatage or now
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        key = str(mmsi).strip()[:32]
        with self._lock:
            prev = self._entries.get(key)
            if prev is not None and prev.horodatage > ts and prev.provider == provider:
                return  # message plus ancien que l'état courant
            entry = _Entry(
                mmsi=key,
                lon=float(lon),
                lat=float(lat),
                horodatage=ts,
                received_at=now,
                provider=provider,
                sog_kn=sog_kn,
                cog_deg=cog_deg,
                heading_deg=heading_deg if heading_deg is not None and heading_deg < 360 else None,
                nav_code=nav_code,
                nom_position=_clean_text(nom),
                demo=demo,
                dans_eaux=dans_eaux,
                static=prev.static if prev is not None else _Static(),
                track=prev.track if prev is not None else deque(maxlen=TRACK_MAXLEN),
            )
            entry.track.append((ts, float(lon), float(lat), sog_kn, cog_deg))
            self._entries[key] = entry

    def upsert_static(
        self,
        *,
        mmsi: str,
        nom: str | None = None,
        ship_type: int | None = None,
        destination: str | None = None,
        imo: str | None = None,
        callsign: str | None = None,
        longueur_m: float | None = None,
    ) -> None:
        key = str(mmsi).strip()[:32]
        now = datetime.now(UTC)
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                # Données statiques avant toute position : on mémorise via une
                # entrée « sans position » ? Non — on ignore, la position
                # arrive dans les minutes suivantes et le statique se répète.
                return
            st = entry.static
            if nom := _clean_text(nom):
                st.nom = nom
            if ship_type not in (None, 0):
                st.ship_type = int(ship_type)  # type: ignore[arg-type]
            if destination := _clean_text(destination):
                st.destination = destination
            if imo and str(imo) not in ("0", ""):
                st.imo = str(imo)
            if callsign := _clean_text(callsign):
                st.callsign = callsign
            if longueur_m and longueur_m > 0:
                st.longueur_m = float(longueur_m)
            st.updated_at = now

    def touch_receiver(self, receiver_id: str) -> None:
        with self._lock:
            self.receivers[receiver_id[:64]] = datetime.now(UTC)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self.receivers.clear()

    # ---- maintenance ----------------------------------------------------

    def purge(self, now: datetime | None = None) -> int:
        now = now or datetime.now(UTC)
        ttl_moving = timedelta(minutes=settings.ais_ttl_moving_min)
        ttl_moored = timedelta(minutes=settings.ais_ttl_moored_min)
        ttl_snapshot = timedelta(hours=settings.ais_ttl_snapshot_hours)
        removed = 0
        with self._lock:
            for key in list(self._entries):
                e = self._entries[key]
                if e.provider == "snapshot":
                    ttl = ttl_snapshot
                elif e.sog_kn is not None and e.sog_kn >= 0.5:
                    ttl = ttl_moving
                else:
                    ttl = ttl_moored
                if now - e.received_at > ttl:
                    del self._entries[key]
                    removed += 1
            for rid in list(self.receivers):
                if now - self.receivers[rid] > timedelta(minutes=15):
                    del self.receivers[rid]
        return removed

    # ---- lecture --------------------------------------------------------

    def __len__(self) -> int:
        return len(self._entries)

    def active_receivers(self) -> int:
        return len(self.receivers)

    def _to_read(self, e: _Entry, now: datetime) -> AisVesselRead:
        near = port_proche(e.lon, e.lat)
        statut = classify_statut_nav(e.nav_code, e.sog_kn, dans_port=near is not None)
        nom = e.static.nom or e.nom_position or f"MMSI {e.mmsi}"
        age_s = max(0, int((now - e.horodatage).total_seconds()))
        code, pays = pavillon_from_mmsi(e.mmsi)
        entree = None
        if not e.dans_eaux:
            entree = predict_entry(
                e.lon,
                e.lat,
                e.sog_kn,
                e.cog_deg,
                inside=self.inside_gabon,
                horizon_h=float(settings.ais_prediction_horizon_h),
            )
        estimee = estimated_position(e.lon, e.lat, e.sog_kn, e.cog_deg, age_s)
        return AisVesselRead(
            mmsi=e.mmsi,
            nom=nom[:120],
            position=PointGeoJSON(coordinates=(e.lon, e.lat)),
            horodatage=e.horodatage,
            sog_kn=e.sog_kn,
            cog_deg=e.cog_deg,
            heading_deg=e.heading_deg,
            ship_type=str(e.static.ship_type) if e.static.ship_type is not None else None,
            type_label=ship_type_label(e.static.ship_type),
            statut_nav=statut,
            statut_nav_code=e.nav_code,
            destination=e.static.destination,
            imo=e.static.imo,
            callsign=e.static.callsign,
            longueur_m=e.static.longueur_m,
            port_id=near[0].id if near else None,
            port_proche=near[0].nom if near else None,
            distance_port_km=round(near[1], 2) if near else None,
            age_s=age_s,
            provider=e.provider,
            demo=e.demo,
            pavillon=pays,
            pavillon_code=code,
            dans_eaux_gabon=e.dans_eaux,
            entree_prevue_h=entree.heures if entree else None,
            entree_prevue_position=(
                PointGeoJSON(coordinates=(entree.lon, entree.lat)) if entree else None
            ),
            position_estimee=PointGeoJSON(coordinates=estimee) if estimee else None,
        )

    def get(
        self, mmsi: str, now: datetime | None = None
    ) -> tuple[AisVesselRead, list[AisTrackPoint]] | None:
        now = now or datetime.now(UTC)
        with self._lock:
            e = self._entries.get(str(mmsi).strip()[:32])
            if e is None:
                return None
            track = list(e.track)
        points = [
            AisTrackPoint(
                horodatage=ts,
                position=PointGeoJSON(coordinates=(lon, lat)),
                sog_kn=sog,
                cog_deg=cog,
            )
            for ts, lon, lat, sog, cog in track
        ]
        return self._to_read(e, now), points

    def snapshot(self, now: datetime | None = None) -> list[AisVesselRead]:
        now = now or datetime.now(UTC)
        with self._lock:
            entries = list(self._entries.values())
        out = [self._to_read(e, now) for e in entries]
        out.sort(key=lambda v: v.horodatage, reverse=True)
        return out
