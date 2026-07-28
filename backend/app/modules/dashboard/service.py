"""Services M6 — indicateurs exacts du tableau de bord (§5.6)."""

from __future__ import annotations

from datetime import UTC, datetime

from geoalchemy2.functions import ST_AsGeoJSON, ST_Centroid, ST_Intersects
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import StatutAlerte, StatutPecheur
from app.db.models import Alerte, Capture, Pecheur, ZoneReglementee
from app.modules.alertes.schemas import AlerteRead
from app.modules.dashboard.schemas import (
    DashboardRead,
    RepartitionEspece,
    ZoneActivite,
)
from app.modules.geolocalisation.geo import geojson_text_to_point


async def get_dashboard(
    db: AsyncSession,
    *,
    debut: datetime | None = None,
    fin: datetime | None = None,
) -> DashboardRead:
    """Agrégats exacts (pas d'arrondi métier) — acceptation §5.6."""
    now = datetime.now(UTC)

    pecheurs_actifs = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Pecheur)
                .where(Pecheur.statut == StatutPecheur.actif)
            )
        ).scalar_one()
    )

    capture_filters = []
    if debut is not None:
        capture_filters.append(Capture.date_capture >= debut)
    if fin is not None:
        capture_filters.append(Capture.date_capture <= fin)

    volume_total = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(
                    *capture_filters
                )
            )
        ).scalar_one()
        or 0.0
    )

    repartition_rows = (
        await db.execute(
            select(Capture.espece, func.sum(Capture.quantite_kg))
            .where(*capture_filters)
            .group_by(Capture.espece)
            .order_by(func.sum(Capture.quantite_kg).desc(), Capture.espece)
        )
    ).all()
    repartition = [
        RepartitionEspece(espece=espece, volume_kg=float(vol or 0.0))
        for espece, vol in repartition_rows
    ]

    alertes_rows = (
        await db.execute(
            select(Alerte)
            .where(Alerte.statut == StatutAlerte.nouvelle)
            .order_by(Alerte.horodatage.desc())
            .limit(50)
        )
    ).scalars().all()
    alertes = [AlerteRead.model_validate(a) for a in alertes_rows]

    zones = await _zones_forte_activite(db, debut=debut, fin=fin)

    return DashboardRead(
        pecheurs_actifs=pecheurs_actifs,
        volume_total_kg=volume_total,
        repartition_especes=repartition,
        alertes_actives=alertes,
        zones_forte_activite=zones,
        periode_debut=debut,
        periode_fin=fin,
        genere_a=now,
    )


async def _zones_forte_activite(
    db: AsyncSession,
    *,
    debut: datetime | None,
    fin: datetime | None,
) -> list[ZoneActivite]:
    """Pour chaque zone réglementée active : captures dont la position intersecte."""
    join_conds = [
        ST_Intersects(Capture.position_capture, ZoneReglementee.geometrie),
        Capture.position_capture.is_not(None),
    ]
    if debut is not None:
        join_conds.append(Capture.date_capture >= debut)
    if fin is not None:
        join_conds.append(Capture.date_capture <= fin)

    stmt = (
        select(
            ZoneReglementee.nom,
            ST_AsGeoJSON(ST_Centroid(ZoneReglementee.geometrie)).label("centro"),
            func.count(Capture.id),
            func.coalesce(func.sum(Capture.quantite_kg), 0.0),
        )
        .select_from(ZoneReglementee)
        .outerjoin(Capture, and_(*join_conds))
        .where(ZoneReglementee.actif.is_(True))
        .group_by(ZoneReglementee.id)
        .having(func.count(Capture.id) > 0)
        .order_by(func.count(Capture.id).desc(), ZoneReglementee.nom)
        .limit(20)
    )

    rows = (await db.execute(stmt)).all()
    out: list[ZoneActivite] = []
    for nom, centro_raw, nb, vol in rows:
        point = geojson_text_to_point(centro_raw)
        if point is None:
            continue
        out.append(
            ZoneActivite(
                label=nom,
                centre=point,
                nb_captures=int(nb),
                volume_kg=float(vol or 0.0),
            )
        )
    return out
