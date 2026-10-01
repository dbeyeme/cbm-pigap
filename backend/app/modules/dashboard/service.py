"""Services M6 — indicateurs exacts du tableau de bord (§5.6)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from geoalchemy2.functions import ST_AsGeoJSON, ST_Centroid, ST_Intersects
from sqlalchemy import Integer, and_, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import StatutAlerte, StatutPecheur, TypeZone
from app.db.models import Alerte, Capture, Controle, Pecheur, ZoneReglementee
from app.modules.alertes.schemas import AlerteRead
from app.modules.dashboard.saisons import saison_calendaire
from app.modules.dashboard.schemas import (
    AlertePeriode,
    DashboardRead,
    DashboardSeriesRead,
    EspecePeriode,
    GrainSerie,
    RepartitionEspece,
    SaisonPeriode,
    VolumePeriode,
    ZoneActivite,
)
from app.modules.geolocalisation.geo import geojson_text_to_point

_PG_GRAIN = {"jour": "day", "semaine": "week", "mois": "month"}


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
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(*capture_filters)
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
        (
            await db.execute(
                select(Alerte)
                .where(Alerte.statut == StatutAlerte.nouvelle)
                .order_by(Alerte.horodatage.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    alertes = [AlerteRead.model_validate(a) for a in alertes_rows]

    zones = await _zones_forte_activite(db, debut=debut, fin=fin)
    effort = await _indicateurs_effort(db, capture_filters, repartition_rows, now=now)

    return DashboardRead(
        pecheurs_actifs=pecheurs_actifs,
        volume_total_kg=volume_total,
        repartition_especes=repartition,
        alertes_actives=alertes,
        zones_forte_activite=zones,
        periode_debut=debut,
        periode_fin=fin,
        genere_a=now,
        **effort,
    )


async def _indicateurs_effort(
    db: AsyncSession, capture_filters: list, repartition_rows: list, *, now: datetime
) -> dict:
    """Débarquements, jours de pêche, valeur, taxes, licences, contrôles."""
    from app.core.config import settings
    from app.db.enums import TaxeStatut
    from app.modules.dashboard.schemas import RepartitionLibelle
    from app.modules.referentiels import service as ref

    nb_debarquements = int(
        (await db.execute(select(func.count(Capture.id)).where(*capture_filters))).scalar_one() or 0
    )
    jours_sub = (
        select(Capture.embarcation_id, func.date(Capture.date_capture).label("jour"))
        .where(*capture_filters)
        .group_by(Capture.embarcation_id, func.date(Capture.date_capture))
        .subquery()
    )
    jours = int((await db.execute(select(func.count()).select_from(jours_sub))).scalar_one() or 0)
    volume = sum(float(v or 0) for _, v in repartition_rows)
    valeur = 0.0
    couvert = 0.0
    for espece, vol in repartition_rows:
        prix = ref.prix_moyen_fcfa_kg(espece)
        if prix is not None:
            valeur += float(vol or 0) * prix
            couvert += float(vol or 0)
    taxes = (
        await db.execute(
            select(Capture.taxe_statut, func.coalesce(func.sum(Capture.taxe_fcfa), 0.0))
            .where(*capture_filters)
            .group_by(Capture.taxe_statut)
        )
    ).all()
    taxe_due = sum(float(m or 0) for st, m in taxes if st == TaxeStatut.due)
    taxe_payee = sum(float(m or 0) for st, m in taxes if st == TaxeStatut.payee)
    limite = now.date() - timedelta(days=int(settings.licence_validite_jours))
    expirees = int(
        (
            await db.execute(
                select(func.count(Pecheur.id)).where(
                    Pecheur.statut == StatutPecheur.actif,
                    Pecheur.date_delivrance_licence.is_not(None),
                    Pecheur.date_delivrance_licence < limite,
                )
            )
        ).scalar_one()
        or 0
    )
    valides = int(
        (
            await db.execute(
                select(func.count(Pecheur.id)).where(
                    Pecheur.statut == StatutPecheur.actif,
                    (Pecheur.date_delivrance_licence.is_(None))
                    | (Pecheur.date_delivrance_licence >= limite),
                )
            )
        ).scalar_one()
        or 0
    )
    ctrl_filters = []
    for f in capture_filters:
        # mêmes bornes de période appliquées aux contrôles
        ctrl_filters.append(f)
    ctrl_stmt = select(
        func.count(Controle.id),
        func.coalesce(func.sum(cast(Controle.infraction, Integer)), 0),
    )
    debut = next((f.right.value for f in capture_filters if f.operator.__name__ == "ge"), None)
    fin = next((f.right.value for f in capture_filters if f.operator.__name__ == "le"), None)
    if debut is not None:
        ctrl_stmt = ctrl_stmt.where(Controle.date_controle >= debut)
    if fin is not None:
        ctrl_stmt = ctrl_stmt.where(Controle.date_controle <= fin)
    ctrl = (await db.execute(ctrl_stmt)).one()

    groupes: dict[str, tuple[float, int]] = {}
    for espece, vol in repartition_rows:
        g = ref.groupe_espece(espece) or "autre"
        a, n = groupes.get(g, (0.0, 0))
        groupes[g] = (a + float(vol or 0), n)
    libelles_groupes = {
        g["code"]: g["libelle"] for g in ref.load_referentiels().get("groupes_especes", [])
    }
    rep_groupes = [
        RepartitionLibelle(code=g, libelle=libelles_groupes.get(g, g), volume_kg=round(v, 3))
        for g, (v, _) in sorted(groupes.items(), key=lambda kv: -kv[1][0])
    ]
    engins_rows = (
        await db.execute(
            select(
                Capture.methode,
                func.coalesce(func.sum(Capture.quantite_kg), 0.0),
                func.count(Capture.id),
            )
            .where(*capture_filters)
            .group_by(Capture.methode)
            .order_by(func.sum(Capture.quantite_kg).desc())
            .limit(12)
        )
    ).all()
    noms_engins = {e["code"]: e["nom"] for e in ref.engins()}
    rep_engins = [
        RepartitionLibelle(
            code=str(m or "inconnu"),
            libelle=noms_engins.get(str(m), str(m or "Non renseigné")),
            volume_kg=float(v or 0),
            nb_captures=int(n or 0),
        )
        for m, v, n in engins_rows
    ]
    sites_rows = (
        await db.execute(
            select(
                Capture.point_debarquement,
                func.coalesce(func.sum(Capture.quantite_kg), 0.0),
                func.count(Capture.id),
            )
            .where(*capture_filters)
            .group_by(Capture.point_debarquement)
            .order_by(func.sum(Capture.quantite_kg).desc())
            .limit(12)
        )
    ).all()
    rep_sites = [
        RepartitionLibelle(
            code=str(s or "inconnu"),
            libelle=str(s or "Non renseigné"),
            volume_kg=float(v or 0),
            nb_captures=int(n or 0),
        )
        for s, v, n in sites_rows
    ]
    return {
        "nb_debarquements": nb_debarquements,
        "jours_de_peche": jours,
        "kg_par_jour_de_peche": round(volume / jours, 2) if jours else 0.0,
        "valeur_estimee_fcfa": round(valeur, 0),
        "valeur_estimee_couverture_pct": round(100.0 * couvert / volume, 1) if volume else 0.0,
        "taxe_due_fcfa": round(taxe_due, 2),
        "taxe_payee_fcfa": round(taxe_payee, 2),
        "licences_expirees": expirees,
        "licences_valides": valides,
        "controles_periode": int(ctrl[0] or 0),
        "infractions_periode": int(ctrl[1] or 0),
        "repartition_groupes": rep_groupes,
        "repartition_engins": rep_engins,
        "repartition_sites": rep_sites,
    }


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
        .where(ZoneReglementee.type != TypeZone.autorisee)
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


def _as_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=UTC)
    return ts.astimezone(UTC)


def _periode_key(ts: datetime) -> str:
    return _as_utc(ts).date().isoformat()


def _truncate_utc(dt: datetime, grain: GrainSerie) -> datetime:
    dt = dt.astimezone(UTC).replace(minute=0, second=0, microsecond=0, hour=0)
    if grain == "jour":
        return dt
    if grain == "mois":
        return dt.replace(day=1)
    monday = dt - timedelta(days=dt.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _advance(dt: datetime, grain: GrainSerie) -> datetime:
    if grain == "jour":
        return dt + timedelta(days=1)
    if grain == "semaine":
        return dt + timedelta(days=7)
    if dt.month == 12:
        return dt.replace(year=dt.year + 1, month=1, day=1)
    return dt.replace(month=dt.month + 1, day=1)


async def get_dashboard_series(
    db: AsyncSession,
    *,
    debut: datetime | None = None,
    fin: datetime | None = None,
    grain: GrainSerie = "semaine",
) -> DashboardSeriesRead:
    """Séries exactes (somme des buckets = volume dashboard, même fenêtre)."""
    now = datetime.now(UTC)
    pg_grain = _PG_GRAIN[grain]
    bucket = func.date_trunc(pg_grain, func.timezone("UTC", Capture.date_capture))
    alert_bucket = func.date_trunc(pg_grain, func.timezone("UTC", Alerte.horodatage))

    capture_filters = []
    alert_filters = []
    if debut is not None:
        capture_filters.append(Capture.date_capture >= debut)
        alert_filters.append(Alerte.horodatage >= debut)
    if fin is not None:
        capture_filters.append(Capture.date_capture <= fin)
        alert_filters.append(Alerte.horodatage <= fin)

    volume_stmt = select(bucket, func.coalesce(func.sum(Capture.quantite_kg), 0.0))
    if capture_filters:
        volume_stmt = volume_stmt.where(*capture_filters)
    volume_stmt = volume_stmt.group_by(bucket).order_by(bucket)
    volume_rows = (await db.execute(volume_stmt)).all()
    volume_map = {_periode_key(ts): float(vol or 0.0) for ts, vol in volume_rows if ts is not None}

    espece_stmt = select(bucket, Capture.espece, func.coalesce(func.sum(Capture.quantite_kg), 0.0))
    if capture_filters:
        espece_stmt = espece_stmt.where(*capture_filters)
    espece_stmt = espece_stmt.group_by(bucket, Capture.espece).order_by(bucket, Capture.espece)
    espece_rows = (await db.execute(espece_stmt)).all()

    alert_stmt = select(alert_bucket, Alerte.type, func.count(Alerte.id))
    if alert_filters:
        alert_stmt = alert_stmt.where(*alert_filters)
    alert_stmt = alert_stmt.group_by(alert_bucket, Alerte.type).order_by(alert_bucket, Alerte.type)
    alert_rows = (await db.execute(alert_stmt)).all()

    cursor_start = debut
    cursor_end = fin
    if cursor_start is None or cursor_end is None:
        keys = list(volume_map.keys())
        if keys:
            cursor_start = cursor_start or datetime.fromisoformat(keys[0]).replace(tzinfo=UTC)
            cursor_end = cursor_end or datetime.fromisoformat(keys[-1]).replace(tzinfo=UTC)

    volume_par_periode: list[VolumePeriode] = []
    saisons: list[SaisonPeriode] = []
    if cursor_start is not None and cursor_end is not None:
        cur = _truncate_utc(cursor_start, grain)
        last = _truncate_utc(cursor_end, grain)
        while cur <= last:
            key = _periode_key(cur)
            volume_par_periode.append(
                VolumePeriode(periode=key, volume_kg=volume_map.get(key, 0.0))
            )
            saisons.append(SaisonPeriode(periode=key, saison=saison_calendaire(cur.date())))
            cur = _advance(cur, grain)
    else:
        for key, vol in volume_map.items():
            volume_par_periode.append(VolumePeriode(periode=key, volume_kg=vol))
            saisons.append(
                SaisonPeriode(
                    periode=key,
                    saison=saison_calendaire(datetime.fromisoformat(key).date()),
                )
            )

    especes_par_periode = [
        EspecePeriode(
            periode=_periode_key(ts),
            espece=espece,
            volume_kg=float(vol or 0.0),
        )
        for ts, espece, vol in espece_rows
        if ts is not None
    ]
    alertes_par_periode = [
        AlertePeriode(
            periode=_periode_key(ts),
            type=str(typ.value if hasattr(typ, "value") else typ),
            count=int(cnt),
        )
        for ts, typ, cnt in alert_rows
        if ts is not None
    ]

    return DashboardSeriesRead(
        grain=grain,
        volume_par_periode=volume_par_periode,
        especes_par_periode=especes_par_periode,
        alertes_par_periode=alertes_par_periode,
        saisons=saisons,
        periode_debut=debut,
        periode_fin=fin,
        genere_a=now,
    )
