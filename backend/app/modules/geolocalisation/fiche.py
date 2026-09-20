"""Fiche d'une embarcation PIGAP : identification, régularité, localisation.

Pendant de la fiche navire AIS pour la flotte enregistrée (pirogues et navires
suivis par GPS mobile) : titulaire et licence, couverture d'abonnement, dernière
position et statut au port, trajectoire des 24 dernières heures, zones
réglementées touchées, alertes récentes, captures déclarées sur 30 jours.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from geoalchemy2 import WKTElement
from geoalchemy2.functions import ST_AsGeoJSON, ST_Intersects
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import not_found
from app.db.models import (
    Alerte,
    Capture,
    Embarcation,
    Organisation,
    Pecheur,
    Position,
    Utilisateur,
    ZoneReglementee,
)
from app.modules.ais_gabon.ports import port_proche
from app.modules.geolocalisation.presence import _intervals, _statut_courant
from app.modules.geolocalisation.schemas import (
    FicheAlerteRead,
    FicheEmbarcationRead,
    FichePositionRead,
    FicheZoneRead,
)
from app.modules.geolocalisation.service import (
    _classify_secteur,
    _live_statut,
    _to_read,
    list_embarcations_for_user,
)
from app.schemas.common import PointGeoJSON

_TRAJ_HOURS = 24
_TRAJ_MAX = 240


async def fiche_embarcation(
    db: AsyncSession, user: Utilisateur, embarcation_id: UUID
) -> FicheEmbarcationRead:
    autorisees = {e.id: e for e in await list_embarcations_for_user(db, user)}
    emb: Embarcation | None = autorisees.get(embarcation_id)
    if emb is None:
        raise not_found(
            "Embarcation introuvable ou hors de votre périmètre", "EMBARCATION_NOT_FOUND"
        )

    now = datetime.now(UTC)
    motifs: list[str] = []
    niveau = 0  # 0 conforme · 1 à vérifier · 2 alerte

    # Titulaire, organisation
    row = await db.execute(
        select(Pecheur, Organisation)
        .outerjoin(Organisation, Organisation.id == Pecheur.organisation_id)
        .where(Pecheur.id == emb.pecheur_id)
    )
    pecheur, org = row.one()
    if pecheur.statut.value != "actif":
        niveau = 2
        motifs.append(f"Licence {pecheur.numero_licence} : pêcheur {pecheur.statut.value}")

    # Couverture d'abonnement (B2C ou organisation)
    couvert, couverture_motif, source = True, "", None
    try:
        from app.modules.abonnements.service import couverture_pecheur

        couvert, couverture_motif, _ab, source = await couverture_pecheur(db, pecheur)
    except Exception:  # noqa: BLE001 — module facultatif
        couverture_motif = "Couverture non évaluée"
    if couvert and "ENFORCE" in (couverture_motif or "").upper():
        couverture_motif = "Phase pilote : abonnement non exigé"
    if not couvert:
        niveau = max(niveau, 1)
        motifs.append(f"Abonnement : {couverture_motif}")

    # Trajectoire 24 h
    cutoff = now - timedelta(hours=_TRAJ_HOURS)
    res = await db.execute(
        select(Position, ST_AsGeoJSON(Position.position).label("geo"))
        .where(Position.embarcation_id == emb.id, Position.horodatage >= cutoff)
        .order_by(Position.horodatage.asc())
        .limit(_TRAJ_MAX)
    )
    points: list[FichePositionRead] = []
    raw: list[tuple[datetime, float, float]] = []
    for pos, geo in res.all():
        read = _to_read(pos, geo)
        lon, lat = read.position.coordinates
        ts = read.horodatage.astimezone(UTC)
        raw.append((ts, lon, lat))
        points.append(
            FichePositionRead(horodatage=ts, position=read.position, source=read.source.value)
        )
    if not points:
        # Dernière position connue au-delà de 24 h
        res = await db.execute(
            select(Position, ST_AsGeoJSON(Position.position).label("geo"))
            .where(Position.embarcation_id == emb.id)
            .order_by(Position.horodatage.desc())
            .limit(1)
        )
        last = res.first()
        if last is not None:
            read = _to_read(last[0], last[1])
            lon, lat = read.position.coordinates
            ts = read.horodatage.astimezone(UTC)
            raw.append((ts, lon, lat))
            points.append(
                FichePositionRead(horodatage=ts, position=read.position, source=read.source.value)
            )

    derniere = points[-1] if points else None
    age_s = int((now - derniere.horodatage).total_seconds()) if derniere else None
    statut_signal = _live_statut(age_s) if age_s is not None else "aucun"
    intervals = _intervals(raw)
    statut_presence, courant, dernier_port, depart = _statut_courant(intervals, now=now)
    port_nom = None
    dernier_port_nom = None
    if courant and courant.port_id and statut_presence in ("a_quai", "en_manoeuvre"):
        near = port_proche(raw[-1][1], raw[-1][2])
        port_nom = near[0].nom if near else None
    if dernier_port and dernier_port.port_id:
        from app.modules.ais_gabon.ports import load_ports

        for p in load_ports():
            if p.id == dernier_port.port_id:
                dernier_port_nom = p.nom
    if age_s is not None and age_s > settings.presence_silence_heures * 3600:
        motifs.append(f"Aucune position GPS depuis {age_s // 3600} h")
    if derniere is None:
        motifs.append("Aucune position GPS enregistrée")

    # Zones réglementées à la dernière position
    zones: list[FicheZoneRead] = []
    if derniere is not None:
        lon, lat = derniere.position.coordinates
        point = WKTElement(f"POINT({lon} {lat})", srid=4326)
        zres = await db.execute(
            select(ZoneReglementee)
            .where(ZoneReglementee.actif.is_(True))
            .where(ST_Intersects(ZoneReglementee.geometrie, point))
        )
        today = now.date()
        for z in zres.scalars().all():
            if z.periode_debut and today < z.periode_debut:
                continue
            if z.periode_fin and today > z.periode_fin:
                continue
            zones.append(FicheZoneRead(id=str(z.id), nom=z.nom, type=z.type.value))
            if z.type.value == "interdite":
                niveau = 2
                motifs.append(f"Dernière position dans la zone interdite « {z.nom} »")
            elif z.type.value == "protegee":
                niveau = max(niveau, 1)
                motifs.append(f"Dernière position dans la zone protégée « {z.nom} »")

    # Alertes récentes
    ares = await db.execute(
        select(Alerte)
        .where(Alerte.embarcation_id == emb.id)
        .order_by(Alerte.horodatage.desc())
        .limit(5)
    )
    alertes = [
        FicheAlerteRead(
            id=str(a.id),
            type=a.type.value,
            niveau_gravite=a.niveau_gravite.value,
            statut=a.statut.value,
            horodatage=a.horodatage,
            regle=str((a.declencheur or {}).get("regle") or ""),
        )
        for a in ares.scalars().all()
    ]
    nouvelles = sum(1 for a in alertes if a.statut == "nouvelle")
    if nouvelles:
        niveau = max(niveau, 1)
        motifs.append(f"{nouvelles} alerte{'s' if nouvelles > 1 else ''} à traiter")

    # Captures 30 jours
    cres = await db.execute(
        select(func.coalesce(func.sum(Capture.quantite_kg), 0.0), func.count(Capture.id)).where(
            Capture.embarcation_id == emb.id, Capture.date_capture >= now - timedelta(days=30)
        )
    )
    kg, n = cres.one()

    return FicheEmbarcationRead(
        embarcation_id=emb.id,
        nom=emb.nom,
        immatriculation=emb.immatriculation,
        type=emb.type,
        longueur_m=emb.longueur,
        pecheur_id=pecheur.id,
        pecheur_nom=f"{pecheur.prenom} {pecheur.nom}",
        numero_licence=pecheur.numero_licence,
        statut_pecheur=pecheur.statut.value,
        date_delivrance_licence=pecheur.date_delivrance_licence,
        organisation=org.nom if org else None,
        couverture_ok=couvert,
        couverture_motif=couverture_motif,
        couverture_source=source,
        derniere_position=derniere.position if derniere else None,
        derniere_horodatage=derniere.horodatage if derniere else None,
        age_s=age_s,
        statut_signal=statut_signal,
        secteur=_classify_secteur(*derniere.position.coordinates) if derniere else None,
        statut_presence=statut_presence,
        port_nom=port_nom,
        depuis=courant.debut if courant and statut_presence != "sans_signal" else None,
        dernier_port_nom=dernier_port_nom,
        dernier_depart=depart,
        trajectoire=points,
        zones_reglementees=zones,
        alertes=alertes,
        captures_30j_kg=float(kg or 0),
        captures_30j=int(n or 0),
        regularite=("conforme", "a_verifier", "alerte")[niveau],
        motifs=motifs,
    )


__all__ = ["fiche_embarcation", "PointGeoJSON"]
