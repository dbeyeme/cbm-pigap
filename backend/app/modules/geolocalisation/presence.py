"""Présence au port calculée depuis les positions GPS PIGAP (aucun matériel).

Principe : pour chaque embarcation suivie, la suite chronologique des positions
sur la fenêtre (24 h par défaut) est découpée en intervalles « dans le rayon du
port X » / « hors port ». On en déduit :

- le statut courant : à quai (immobile dans un port depuis ≥ N min), en manœuvre
  (dans un port depuis < N min), en mer (hors port), sans signal (dernière
  position trop ancienne) ;
- les événements d'arrivée et de départ sur la fenêtre ;
- la cohérence entre les déclarations de captures (point de débarquement) et la
  présence GPS constatée au port déclaré.

Le référentiel des ports est celui de la couche AIS (`ports.json`), afin que la
flotte PIGAP et les navires AIS soient comptés sur les mêmes zones.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Capture, Embarcation, Position, Utilisateur
from app.modules.ais_gabon.ports import Port, load_ports, port_from_text, port_proche
from app.modules.geolocalisation.schemas import (
    DeclarationPresenceRead,
    EmbarcationPresenceRead,
    PortPresenceRead,
    PortPresenceResponse,
)
from app.modules.geolocalisation.service import _to_read, list_embarcations_for_user


@dataclass
class _Interval:
    port_id: str | None
    debut: datetime
    fin: datetime
    points: int = 1


def _intervals(points: list[tuple[datetime, float, float]]) -> list[_Interval]:
    """Découpe une trajectoire (triée) en séjours port / hors port."""
    out: list[_Interval] = []
    current: _Interval | None = None
    for ts, lon, lat in points:
        near = port_proche(lon, lat)
        pid = near[0].id if near else None
        if current is not None and current.port_id == pid:
            current.fin = ts
            current.points += 1
        else:
            if current is not None:
                out.append(current)
            current = _Interval(pid, ts, ts)
    if current is not None:
        out.append(current)
    return out


def _statut_courant(
    intervals: list[_Interval], *, now: datetime
) -> tuple[str, _Interval | None, _Interval | None, datetime | None]:
    """Retourne (statut, séjour courant, dernier séjour au port, date de départ)."""
    if not intervals:
        return "sans_signal", None, None, None
    last = intervals[-1]
    age = (now - last.fin).total_seconds()
    if age > settings.presence_silence_heures * 3600:
        statut = "sans_signal"
    elif last.port_id is not None:
        duree_min = (last.fin - last.debut).total_seconds() / 60
        statut = "a_quai" if duree_min >= settings.presence_port_min_minutes else "en_manoeuvre"
    else:
        statut = "en_mer"

    dernier_port: _Interval | None = None
    depart: datetime | None = None
    if last.port_id is None:
        for prev in reversed(intervals[:-1]):
            if prev.port_id is not None:
                dernier_port = prev
                break
        if dernier_port is not None:
            # le départ = première position hors port après le séjour
            idx = intervals.index(dernier_port)
            depart = intervals[idx + 1].debut if idx + 1 < len(intervals) else None
    return statut, last, dernier_port, depart


def _coherence(
    port_id: str,
    date: datetime,
    intervals: list[_Interval],
) -> str:
    if not intervals:
        return "non_verifiable"
    tol = timedelta(hours=settings.presence_tolerance_heures)
    for it in intervals:
        if it.port_id == port_id and it.debut - tol <= date <= it.fin + tol:
            return "coherente"
    return "incoherente"


async def compute_port_presence(
    db: AsyncSession,
    user: Utilisateur,
    *,
    fenetre_heures: int | None = None,
) -> PortPresenceResponse:
    now = datetime.now(UTC)
    heures = fenetre_heures or settings.presence_fenetre_heures
    cutoff = now - timedelta(hours=heures)

    emb_list: list[Embarcation] = await list_embarcations_for_user(db, user)
    ports = load_ports()
    port_by_id: dict[str, Port] = {p.id: p for p in ports}
    if not emb_list:
        return PortPresenceResponse(
            fetched_at=now,
            fenetre_heures=heures,
            seuil_minutes=settings.presence_port_min_minutes,
            ports=[_empty_port(p) for p in ports],
        )
    emb_by_id = {e.id: e for e in emb_list}
    ids: list[UUID] = list(emb_by_id)

    # Positions de la fenêtre, triées par embarcation puis par temps
    result = await db.execute(
        select(Position, ST_AsGeoJSON(Position.position).label("geo"))
        .where(Position.embarcation_id.in_(ids), Position.horodatage >= cutoff)
        .order_by(Position.embarcation_id, Position.horodatage.asc())
    )
    tracks: dict[UUID, list[tuple[datetime, float, float]]] = {}
    for pos, geo in result.all():
        read = _to_read(pos, geo)
        lon, lat = read.position.coordinates
        tracks.setdefault(pos.embarcation_id, []).append(
            (read.horodatage.astimezone(UTC), lon, lat)
        )

    # Déclarations de captures sur la fenêtre (point de débarquement → port)
    cap_result = await db.execute(
        select(Capture, ST_AsGeoJSON(Capture.position_capture).label("geo"))
        .where(Capture.embarcation_id.in_(ids), Capture.date_capture >= cutoff)
        .order_by(Capture.date_capture.desc())
    )
    declarations: dict[UUID, list[tuple[Port, datetime, float]]] = {}
    for cap, geo in cap_result.all():
        port = port_from_text(cap.point_debarquement)
        if port is None and geo:
            import json

            coords = (json.loads(geo).get("coordinates") or [None, None])[:2]
            if coords[0] is not None:
                near = port_proche(float(coords[0]), float(coords[1]))
                port = near[0] if near else None
        if port is None:
            continue
        declarations.setdefault(cap.embarcation_id, []).append(
            (port, cap.date_capture.astimezone(UTC), float(cap.quantite_kg))
        )

    embarcations: list[EmbarcationPresenceRead] = []
    arrivees: dict[str, int] = {p.id: 0 for p in ports}
    departs: dict[str, int] = {p.id: 0 for p in ports}
    debarquements: dict[str, int] = {p.id: 0 for p in ports}
    incoherences: list[DeclarationPresenceRead] = []

    for emb in emb_list:
        pts = tracks.get(emb.id, [])
        intervals = _intervals(pts)
        statut, courant, dernier_port, depart = _statut_courant(intervals, now=now)

        # Événements sur la fenêtre (transitions uniquement)
        for prev, nxt in zip(intervals, intervals[1:], strict=False):
            if prev.port_id is None and nxt.port_id is not None:
                arrivees[nxt.port_id] = arrivees.get(nxt.port_id, 0) + 1
            if prev.port_id is not None and nxt.port_id is None:
                departs[prev.port_id] = departs.get(prev.port_id, 0) + 1

        decl_read: DeclarationPresenceRead | None = None
        for port, date, kg in declarations.get(emb.id, []):
            debarquements[port.id] = debarquements.get(port.id, 0) + 1
            coh = _coherence(port.id, date, intervals)
            item = DeclarationPresenceRead(
                embarcation_id=emb.id,
                embarcation_nom=emb.nom,
                port_id=port.id,
                port_nom=port.nom,
                date=date,
                quantite_kg=kg,
                coherence=coh,
            )
            if decl_read is None:
                decl_read = item
            if coh == "incoherente":
                incoherences.append(item)

        last_ts = pts[-1][0] if pts else None
        port_id = courant.port_id if courant and statut in ("a_quai", "en_manoeuvre") else None
        embarcations.append(
            EmbarcationPresenceRead(
                embarcation_id=emb.id,
                nom=emb.nom,
                immatriculation=emb.immatriculation,
                type=emb.type,
                statut=statut,
                port_id=port_id,
                port_nom=port_by_id[port_id].nom if port_id else None,
                depuis=courant.debut if courant and statut != "sans_signal" else None,
                derniere_position=last_ts,
                age_s=int((now - last_ts).total_seconds()) if last_ts else None,
                dernier_port_id=dernier_port.port_id if dernier_port else None,
                dernier_port_nom=(
                    port_by_id[dernier_port.port_id].nom
                    if dernier_port and dernier_port.port_id in port_by_id
                    else None
                ),
                dernier_depart=depart,
                declaration=decl_read,
            )
        )

    ports_read: list[PortPresenceRead] = []
    for p in ports:
        here = [e for e in embarcations if e.port_id == p.id]
        ports_read.append(
            PortPresenceRead(
                id=p.id,
                nom=p.nom,
                type=p.type,
                lon=p.lon,
                lat=p.lat,
                rayon_km=p.rayon_km,
                a_quai=sum(1 for e in here if e.statut == "a_quai"),
                en_manoeuvre=sum(1 for e in here if e.statut == "en_manoeuvre"),
                arrivees=arrivees.get(p.id, 0),
                departs=departs.get(p.id, 0),
                debarquements_declares=debarquements.get(p.id, 0),
                embarcations=sorted(here, key=lambda e: e.depuis or now),
            )
        )

    en_mer = [e for e in embarcations if e.statut == "en_mer"]
    en_mer.sort(key=lambda e: e.age_s or 0)
    return PortPresenceResponse(
        fetched_at=now,
        fenetre_heures=heures,
        seuil_minutes=settings.presence_port_min_minutes,
        ports=ports_read,
        en_mer=en_mer,
        sans_signal=sum(1 for e in embarcations if e.statut == "sans_signal"),
        total_suivies=len(embarcations),
        incoherences=incoherences,
    )


def _empty_port(p: Port) -> PortPresenceRead:
    return PortPresenceRead(
        id=p.id, nom=p.nom, type=p.type, lon=p.lon, lat=p.lat, rayon_km=p.rayon_km
    )
