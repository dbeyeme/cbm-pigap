"""Services M7 — règles d'alertes explicites (§5.7)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_Intersects
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import not_found
from app.db.enums import NiveauGravite, StatutAlerte, TypeAlerte, TypeZone
from app.db.models import Alerte, Capture, Embarcation, Pecheur, Position, ZoneReglementee
from app.modules.alertes.schemas import AlerteRead, AlerteUpdateStatut
from app.modules.geolocalisation.geo import point_to_wkt
from app.schemas.common import PointGeoJSON


def to_read(row: Alerte) -> AlerteRead:
    return AlerteRead.model_validate(row)


async def list_alertes(
    db: AsyncSession,
    *,
    type_alerte: TypeAlerte | None = None,
    statut: StatutAlerte | None = None,
    embarcation_id: UUID | None = None,
    limit: int = 100,
) -> list[AlerteRead]:
    stmt = select(Alerte).order_by(Alerte.horodatage.desc()).limit(min(limit, 500))
    if type_alerte is not None:
        stmt = stmt.where(Alerte.type == type_alerte)
    if statut is not None:
        stmt = stmt.where(Alerte.statut == statut)
    if embarcation_id is not None:
        stmt = stmt.where(Alerte.embarcation_id == embarcation_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [to_read(r) for r in rows]


async def update_statut(db: AsyncSession, alerte_id: UUID, data: AlerteUpdateStatut) -> AlerteRead:
    row = await db.get(Alerte, alerte_id)
    if row is None:
        raise not_found("Alerte introuvable", "ALERTE_NOT_FOUND")
    row.statut = data.statut
    await db.commit()
    await db.refresh(row)
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "alerte_statut", "id": str(row.id)})
    return to_read(row)


async def _has_similar(
    db: AsyncSession,
    *,
    type_alerte: TypeAlerte,
    embarcation_id: UUID | None,
    fingerprint: str,
    since: datetime,
) -> bool:
    """Anti-doublon court : même type + empreinte dans declencheur depuis `since`."""
    stmt = select(Alerte.id).where(
        Alerte.type == type_alerte,
        Alerte.horodatage >= since,
        Alerte.declencheur["fingerprint"].as_string() == fingerprint,
    )
    if embarcation_id is not None:
        stmt = stmt.where(Alerte.embarcation_id == embarcation_id)
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none() is not None


async def _create(
    db: AsyncSession,
    *,
    type_alerte: TypeAlerte,
    gravite: NiveauGravite,
    embarcation_id: UUID | None,
    declencheur: dict[str, Any],
) -> Alerte | None:
    fp = str(declencheur.get("fingerprint", ""))
    since = datetime.now(UTC) - timedelta(hours=12)
    if fp and await _has_similar(
        db,
        type_alerte=type_alerte,
        embarcation_id=embarcation_id,
        fingerprint=fp,
        since=since,
    ):
        return None
    row = Alerte(
        type=type_alerte,
        niveau_gravite=gravite,
        embarcation_id=embarcation_id,
        declencheur=declencheur,
        statut=StatutAlerte.nouvelle,
    )
    db.add(row)
    await db.flush()
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "alerte", "id": str(row.id)})
    return row


async def evaluate_zone_interdite(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 1 : intrusion zone interdite (PostGIS ST_Intersects)."""
    when = a_la_date or datetime.now(UTC)
    point = point_to_wkt(position)
    stmt = (
        select(ZoneReglementee)
        .where(ZoneReglementee.actif.is_(True))
        .where(ZoneReglementee.type == TypeZone.interdite)
        .where(ST_Intersects(ZoneReglementee.geometrie, point))
    )
    zones = (await db.execute(stmt)).scalars().all()
    created: list[Alerte] = []
    for zone in zones:
        if zone.periode_debut and when.date() < zone.periode_debut:
            continue
        if zone.periode_fin and when.date() > zone.periode_fin:
            continue
        alerte = await _create(
            db,
            type_alerte=TypeAlerte.zone_interdite,
            gravite=NiveauGravite.critique,
            embarcation_id=embarcation_id,
            declencheur={
                "regle": "intrusion_zone_interdite",
                "fingerprint": f"zone:{zone.id}:emb:{embarcation_id}",
                "zone_id": str(zone.id),
                "zone_nom": zone.nom,
                "position": {
                    "type": "Point",
                    "coordinates": list(position.coordinates),
                },
            },
        )
        if alerte:
            created.append(alerte)
    return created


async def evaluate_tendance_embarcation(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    reference: datetime | None = None,
) -> list[Alerte]:
    """Règle 3 : volume 7j > 2× moyenne historique (fenêtres 7j antérieures)."""
    now = reference or datetime.now(UTC)
    window_start = now - timedelta(days=7)

    vol_7j = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(
                    Capture.embarcation_id == embarcation_id,
                    Capture.date_capture >= window_start,
                    Capture.date_capture <= now,
                )
            )
        ).scalar_one()
        or 0.0
    )

    # Historique : captures avant la fenêtre 7j
    hist_start_row = await db.execute(
        select(func.min(Capture.date_capture)).where(
            Capture.embarcation_id == embarcation_id,
            Capture.date_capture < window_start,
        )
    )
    hist_min = hist_start_row.scalar_one_or_none()
    if hist_min is None:
        return []

    vol_hist = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(
                    Capture.embarcation_id == embarcation_id,
                    Capture.date_capture < window_start,
                )
            )
        ).scalar_one()
        or 0.0
    )
    days_hist = max((window_start - hist_min).total_seconds() / 86400.0, 1.0)
    nb_fenetres = max(days_hist / 7.0, 1.0)
    moyenne_hist_7j = vol_hist / nb_fenetres

    if moyenne_hist_7j <= 0:
        return []
    if vol_7j <= 2.0 * moyenne_hist_7j:
        return []

    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.attention,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "activite_inhabituelle",
            "fingerprint": f"tendance:{embarcation_id}:{window_start.date().isoformat()}",
            "embarcation_id": str(embarcation_id),
            "volume_7j_kg": vol_7j,
            "moyenne_historique_7j_kg": round(moyenne_hist_7j, 3),
            "seuil_multiplicateur": 2.0,
            "fenetre_debut": window_start.isoformat(),
            "fenetre_fin": now.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_sortie_limite(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 4 : dépassement d'une limite géographique (§5.3).

    Les zones de type ``autorisee`` délimitent les eaux où la pêche est permise
    (zone artisanale, limites territoriales). Une position maritime relevée hors
    de toute zone autorisée active déclenche une alerte critique. Sans zone
    autorisée définie, la limite retenue est la ZEE gabonaise élargie de la
    marge côtière (eaux nationales). Les positions fluviales sont ignorées.
    """
    from app.modules.ais_gabon.service import point_in_gabon_waters
    from app.modules.geolocalisation.service import _classify_secteur

    lon, lat = position.coordinates
    if _classify_secteur(lon, lat) == "fleuve":
        return []
    when = a_la_date or datetime.now(UTC)
    point = point_to_wkt(position)
    stmt = (
        select(ZoneReglementee)
        .where(ZoneReglementee.actif.is_(True))
        .where(ZoneReglementee.type == TypeZone.autorisee)
    )
    zones = (await db.execute(stmt)).scalars().all()
    actives = [
        z
        for z in zones
        if not (z.periode_debut and when.date() < z.periode_debut)
        and not (z.periode_fin and when.date() > z.periode_fin)
    ]
    if actives:
        inside = await db.execute(
            select(ZoneReglementee.id)
            .where(ZoneReglementee.id.in_([z.id for z in actives]))
            .where(ST_Intersects(ZoneReglementee.geometrie, point))
            .limit(1)
        )
        if inside.scalar_one_or_none() is not None:
            return []
        limite = "zones_autorisees"
        reference = ", ".join(z.nom for z in actives[:5])
    else:
        if point_in_gabon_waters(lon, lat):
            return []
        limite = "zee_gabon"
        reference = "ZEE gabonaise (Marine Regions) élargie de la marge côtière"

    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.critique,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "sortie_limite_geographique",
            "fingerprint": f"limite:{embarcation_id}:{when.date().isoformat()}",
            "limite": limite,
            "reference": reference,
            "position": {"type": "Point", "coordinates": [lon, lat]},
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


def _cellule(lon: float, lat: float, *, pas_deg: float = 0.02) -> str:
    """Cellule de grille (~2 km) utilisée comme empreinte anti-doublon."""
    return f"{round(lon / pas_deg) * pas_deg:.2f},{round(lat / pas_deg) * pas_deg:.2f}"


async def evaluate_concentration(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 5 : concentration excessive de pêcheurs dans une zone (§5.7).

    Compte les embarcations distinctes ayant relevé une position dans le rayon
    ``alerte_concentration_rayon_km`` autour de la position, dans la fenêtre
    ``alerte_concentration_fenetre_min`` centrée sur l'horodatage. Au-delà du
    seuil ``alerte_concentration_seuil``, une alerte d'attention est émise au
    niveau de la zone (sans embarcation ciblée), une fois par cellule et par heure.
    """
    seuil = int(settings.alerte_concentration_seuil)
    if seuil <= 0:
        return []
    when = a_la_date or datetime.now(UTC)
    fenetre = timedelta(minutes=int(settings.alerte_concentration_fenetre_min))
    rayon_m = float(settings.alerte_concentration_rayon_km) * 1000.0
    lon, lat = position.coordinates
    point = point_to_wkt(position)
    stmt = select(func.count(func.distinct(Position.embarcation_id))).where(
        Position.horodatage >= when - fenetre,
        Position.horodatage <= when + fenetre,
        ST_DWithin(cast(Position.position, Geography), cast(point, Geography), rayon_m),
    )
    nb = int((await db.execute(stmt)).scalar_one() or 0)
    if nb < seuil:
        return []

    zone_nom: str | None = None
    zres = await db.execute(
        select(ZoneReglementee.nom)
        .where(ZoneReglementee.actif.is_(True))
        .where(ZoneReglementee.type != TypeZone.autorisee)
        .where(ST_Intersects(ZoneReglementee.geometrie, point))
        .limit(1)
    )
    zone_nom = zres.scalar_one_or_none()
    cellule = _cellule(lon, lat)
    heure = when.astimezone(UTC).strftime("%Y-%m-%dT%H")
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.attention,
        embarcation_id=None,
        declencheur={
            "regle": "concentration_zone",
            "fingerprint": f"concentration:{cellule}:{heure}",
            "cellule": cellule,
            "zone_nom": zone_nom,
            "nb_embarcations": nb,
            "seuil": seuil,
            "rayon_km": float(settings.alerte_concentration_rayon_km),
            "fenetre_min": int(settings.alerte_concentration_fenetre_min),
            "position": {"type": "Point", "coordinates": [lon, lat]},
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_espece_protegee(
    db: AsyncSession,
    *,
    espece: str | None,
    embarcation_id: UUID,
    reference: datetime | None = None,
) -> list[Alerte]:
    """Règle 6 : capture déclarée d'une espèce protégée (référentiel)."""
    from app.modules.referentiels import service as ref

    if not espece or not ref.espece_protegee(espece):
        return []
    when = reference or datetime.now(UTC)
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.critique,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "espece_protegee",
            "fingerprint": f"protegee:{embarcation_id}:{espece}:{when.date().isoformat()}",
            "espece": espece,
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_licence_pecheur(
    db: AsyncSession,
    *,
    pecheur_id: UUID | None,
    embarcation_id: UUID | None,
    reference: datetime | None = None,
) -> list[Alerte]:
    """Règle 7 : activité avec une autorisation annuelle expirée ou un pêcheur suspendu."""
    from app.core.licence import date_expiration, statut_licence

    if pecheur_id is None and embarcation_id is not None:
        emb = await db.get(Embarcation, embarcation_id)
        pecheur_id = emb.pecheur_id if emb else None
    if pecheur_id is None:
        return []
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        return []
    when = reference or datetime.now(UTC)
    statut = statut_licence(pecheur, today=when.date())
    if statut not in ("expiree", "suspendue"):
        return []
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.attention,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "licence_expiree" if statut == "expiree" else "pecheur_suspendu",
            "fingerprint": f"licence:{pecheur_id}:{when.strftime('%Y-%m')}",
            "pecheur_id": str(pecheur_id),
            "numero_licence": pecheur.numero_licence,
            "date_expiration": (date_expiration(pecheur) or when.date()).isoformat(),
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def evaluate_declaration_manquante(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> list[Alerte]:
    """Règle 8 : retour au port sans déclaration de capture dans le délai (rappel).

    Reconstitue les séjours port / mer des dernières heures depuis le GPS PIGAP :
    si le dernier séjour est au port depuis plus de ``alerte_rappel_declaration_heures``
    après une sortie en mer, et qu'aucune capture n'a été déclarée depuis le départ,
    une alerte d'information est émise (une par sortie).
    """
    from geoalchemy2.functions import ST_AsGeoJSON

    from app.modules.geolocalisation.geo import geojson_text_to_point
    from app.modules.geolocalisation.presence import _intervals

    when = a_la_date or datetime.now(UTC)
    fenetre = timedelta(hours=int(settings.presence_fenetre_heures))
    res = await db.execute(
        select(Position.horodatage, ST_AsGeoJSON(Position.position))
        .where(Position.embarcation_id == embarcation_id)
        .where(Position.horodatage >= when - fenetre, Position.horodatage <= when)
        .order_by(Position.horodatage.asc())
        .limit(500)
    )
    raw: list[tuple[datetime, float, float]] = []
    for ts, geo in res.all():
        pt = geojson_text_to_point(geo)
        if pt is None:
            continue
        lon, lat = pt.coordinates
        raw.append((ts.astimezone(UTC), lon, lat))
    intervals = _intervals(raw)
    if len(intervals) < 2:
        return []
    last, prev = intervals[-1], intervals[-2]
    if last.port_id is None or prev.port_id is not None:
        return []
    delai = timedelta(hours=float(settings.alerte_rappel_declaration_heures))
    if when - last.debut < delai:
        return []
    if prev.fin - prev.debut < timedelta(minutes=int(settings.presence_port_min_minutes)):
        return []  # simple manœuvre, pas une sortie
    declared = await db.execute(
        select(Capture.id)
        .where(Capture.embarcation_id == embarcation_id)
        .where(Capture.date_capture >= prev.debut - timedelta(hours=1))
        .limit(1)
    )
    if declared.scalar_one_or_none() is not None:
        return []
    alerte = await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.info,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "declaration_manquante",
            "fingerprint": f"declaration:{embarcation_id}:{prev.debut.isoformat()}",
            "sortie_debut": prev.debut.isoformat(),
            "retour_port": last.debut.isoformat(),
            "port_id": last.port_id,
            "delai_heures": float(settings.alerte_rappel_declaration_heures),
            "horodatage": when.isoformat(),
        },
    )
    return [alerte] if alerte else []


async def signaler_detresse(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    position: PointGeoJSON,
    a_la_date: datetime | None,
    origine: str,
) -> Alerte | None:
    """Alerte critique « détresse » déclenchée par le bouton d'une balise (ADR-009).

    Empreinte = embarcation + origine : un même bouton maintenu ne crée pas
    une alerte par message pendant 12 h (anti-doublon de `_create`).
    """
    lon, lat = position.coordinates
    return await _create(
        db,
        type_alerte=TypeAlerte.anomalie,
        gravite=NiveauGravite.critique,
        embarcation_id=embarcation_id,
        declencheur={
            "regle": "detresse_balise",
            "fingerprint": f"detresse:{embarcation_id}:{origine}",
            "origine": origine,
            "position": {"lon": lon, "lat": lat},
            "a_la_date": a_la_date.isoformat() if a_la_date else None,
            "message": "Signal de détresse émis par la balise de l'embarcation",
        },
    )


async def evaluate_after_position(
    db: AsyncSession,
    *,
    position: PointGeoJSON,
    embarcation_id: UUID,
    a_la_date: datetime | None = None,
) -> None:
    await evaluate_zone_interdite(
        db, position=position, embarcation_id=embarcation_id, a_la_date=a_la_date
    )
    await evaluate_sortie_limite(
        db, position=position, embarcation_id=embarcation_id, a_la_date=a_la_date
    )
    await evaluate_concentration(
        db, position=position, embarcation_id=embarcation_id, a_la_date=a_la_date
    )
    await evaluate_licence_pecheur(
        db, pecheur_id=None, embarcation_id=embarcation_id, reference=a_la_date
    )
    await evaluate_declaration_manquante(db, embarcation_id=embarcation_id, a_la_date=a_la_date)


async def evaluate_after_capture(
    db: AsyncSession,
    *,
    embarcation_id: UUID,
    position: PointGeoJSON | None = None,
    reference: datetime | None = None,
    espece: str | None = None,
    pecheur_id: UUID | None = None,
) -> None:
    if position is not None:
        await evaluate_zone_interdite(
            db, position=position, embarcation_id=embarcation_id, a_la_date=reference
        )
    await evaluate_tendance_embarcation(db, embarcation_id=embarcation_id, reference=reference)
    await evaluate_espece_protegee(
        db, espece=espece, embarcation_id=embarcation_id, reference=reference
    )
    await evaluate_licence_pecheur(
        db, pecheur_id=pecheur_id, embarcation_id=embarcation_id, reference=reference
    )
