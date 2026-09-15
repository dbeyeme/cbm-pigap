"""Agrégats SQL + sklearn consultatif (hors hot path GPS / M7)."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, date, datetime
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON, ST_Centroid, ST_Intersects
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import TypeAlerte
from app.db.models import Alerte, Capture, Quota, ZoneReglementee
from app.modules.geolocalisation.geo import geojson_text_to_point
from app.modules.predictions import engine as eng
from app.modules.predictions.schemas import (
    IntrusionPrediction,
    PechePrediction,
    PenuriePrediction,
    PredictionsRead,
    ZoneIncidentPrediction,
)

_CACHE: dict[str, tuple[float, PredictionsRead]] = {}
_TTL_S = 900.0


def reset_cache() -> None:
    _CACHE.clear()


def _cache_get(key: str) -> PredictionsRead | None:
    hit = _CACHE.get(key)
    if hit is None:
        return None
    ts, payload = hit
    if time.monotonic() - ts > _TTL_S:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_put(key: str, payload: PredictionsRead) -> None:
    _CACHE[key] = (time.monotonic(), payload)


def _as_date(ts: datetime) -> date:
    if isinstance(ts, datetime):
        return ts.date()
    return ts


async def _fingerprint(db: AsyncSession, horizon: int) -> str:
    cap = (await db.execute(select(func.count(Capture.id), func.max(Capture.date_capture)))).one()
    al = (await db.execute(select(func.count(Alerte.id), func.max(Alerte.horodatage)))).one()
    return f"{horizon}:{cap[0]}:{cap[1]}:{al[0]}:{al[1]}"


async def _daily_captures(db: AsyncSession) -> list[tuple[date, str, float]]:
    stmt = select(Capture.date_capture, Capture.espece, Capture.quantite_kg).order_by(
        Capture.date_capture
    )
    rows = (await db.execute(stmt)).all()
    return [
        (_as_date(ts), str(espece), float(kg or 0.0)) for ts, espece, kg in rows if ts is not None
    ]


async def _intrusion_series(
    db: AsyncSession,
) -> tuple[dict[str, list[tuple[date, float]]], dict[str, str]]:
    stmt = select(Alerte.horodatage, Alerte.declencheur).where(
        Alerte.type == TypeAlerte.zone_interdite
    )
    rows = (await db.execute(stmt)).all()
    acc: dict[str, dict[date, float]] = {}
    names: dict[str, str] = {}
    for ts, decl in rows:
        if ts is None:
            continue
        payload = decl or {}
        zid = str(payload.get("zone_id") or "inconnu")
        names[zid] = str(payload.get("zone_nom") or zid)
        week = eng.monday_of(_as_date(ts))
        acc.setdefault(zid, {})
        acc[zid][week] = acc[zid].get(week, 0.0) + 1.0
    series = {zid: sorted(weeks.items()) for zid, weeks in acc.items()}
    return series, names


async def _zone_capture_volumes(db: AsyncSession) -> dict[str, float]:
    stmt = (
        select(
            ZoneReglementee.id,
            func.coalesce(func.sum(Capture.quantite_kg), 0.0),
        )
        .select_from(ZoneReglementee)
        .outerjoin(
            Capture,
            ST_Intersects(Capture.position_capture, ZoneReglementee.geometrie)
            & Capture.position_capture.is_not(None),
        )
        .where(ZoneReglementee.actif.is_(True))
        .group_by(ZoneReglementee.id)
    )
    rows = (await db.execute(stmt)).all()
    return {str(zid): float(vol or 0.0) for zid, vol in rows}


async def _zone_centres(db: AsyncSession) -> dict[str, tuple[str, object]]:
    stmt = select(
        ZoneReglementee.id,
        ZoneReglementee.nom,
        ST_AsGeoJSON(ST_Centroid(ZoneReglementee.geometrie)),
    ).where(ZoneReglementee.actif.is_(True))
    rows = (await db.execute(stmt)).all()
    out: dict[str, tuple[str, object]] = {}
    for zid, nom, geo in rows:
        out[str(zid)] = (nom, geojson_text_to_point(geo))
    return out


async def _quota_taux_by_zone(db: AsyncSession) -> dict[str, float]:
    rows = (await db.execute(select(Quota))).scalars().all()
    out: dict[str, float] = {}
    global_max = 0.0
    for q in rows:
        if q.volume_autorise_kg <= 0:
            continue
        taux = float(q.volume_consomme_kg) / float(q.volume_autorise_kg)
        if q.zone_id is None:
            global_max = max(global_max, taux)
            continue
        key = str(q.zone_id)
        out[key] = max(out.get(key, 0.0), taux)
    if global_max:
        for key in list(out.keys()):
            out[key] = max(out[key], global_max)
        out["__global__"] = global_max
    return out


def _compute(
    *,
    horizon: int,
    daily: list[tuple[date, str, float]],
    intrusion_series: dict[str, list[tuple[date, float]]],
    intrusion_names: dict[str, str],
    zone_volumes: dict[str, float],
    zone_centres: dict[str, tuple[str, object]],
    quota_taux: dict[str, float],
) -> PredictionsRead:
    now = datetime.now(UTC)
    weekly = eng.weekly_volumes(daily)
    max_weeks = max((len(s) for s in weekly.values()), default=0)
    mode = "ok" if max_weeks >= eng.MIN_WEEKS else "insuffisant"
    n_weeks = 1 if horizon <= 7 else 4

    peches: list[PechePrediction] = []
    penuries: list[PenuriePrediction] = []

    for espece, series in sorted(weekly.items()):
        ridge, resid = eng.fit_ridge(series)
        if ridge is None:
            pred_h = eng.naive_horizon(series, horizon)
            lo, hi = eng.intervalle(pred_h, 0.0)
            model_name = "naive"
            contrib: dict[str, float] = {}
        else:
            pred_h, _ = eng.forecast_weeks(series, n_weeks, ridge)
            lo, hi = eng.intervalle(pred_h, resid)
            model_name = "ridge"
            last_week = series[-1][0]
            last_x = eng.feature_row(series, last_week)
            contrib = eng.coef_contributions(ridge, last_x)

        peches.append(
            PechePrediction(
                espece=espece,
                volume_prevu_kg=round(pred_h, 2),
                intervalle_bas_kg=lo,
                intervalle_haut_kg=hi,
                justification={
                    "modele": model_name,
                    "features": contrib,
                    "horizon_jours": horizon,
                    "nb_semaines": len(series),
                },
            )
        )

        obs_4, baseline_4 = eng.seasonal_4week_baseline(series)
        if ridge is None:
            fc30 = eng.naive_horizon(series, 30)
        else:
            fc30, _ = eng.forecast_weeks(series, 4, ridge)
        baseline_30 = baseline_4 if baseline_4 > 0 else obs_4
        risque = eng.risque_penurie(
            obs_4sem=obs_4,
            baseline_4sem=baseline_4,
            forecast_30j=fc30,
            baseline_30j=baseline_30,
        )
        penuries.append(
            PenuriePrediction(
                espece=espece,
                risque=risque,  # type: ignore[arg-type]
                volume_4sem_kg=round(obs_4, 2),
                baseline_saison_kg=round(baseline_4, 2),
                volume_prevu_30j_kg=round(fc30, 2),
                justification={
                    "modele": model_name,
                    "features": contrib,
                    "seuil_penurie": eng.SEUIL_PENURIE,
                    "baseline_kg": round(baseline_4, 2),
                    "observation_kg": round(obs_4, 2),
                    "forecast_30j_kg": round(fc30, 2),
                },
            )
        )

    intrusions: list[IntrusionPrediction] = []
    for zid, series in intrusion_series.items():
        model, model_name, resid = eng.fit_count_model(series)
        hist = int(sum(v for _, v in series))
        if model is None:
            pred_c = eng.naive_horizon(series, horizon)
            last_x = []
            contrib = {}
        else:
            pred_c, _ = eng.forecast_weeks(series, n_weeks, model)
            last_x = eng.feature_row(series, series[-1][0]) if series else []
            contrib = eng.coef_contributions(model, last_x)
        nom = intrusion_names.get(zid, zid)
        try:
            zone_uuid: UUID | None = UUID(zid)
        except ValueError:
            zone_uuid = None
        score = eng.score_count(pred_c)
        intrusions.append(
            IntrusionPrediction(
                zone_id=UUID(zid) if zone_uuid else None,
                zone_nom=nom,
                count_prevu=round(pred_c, 2),
                score=score,
                justification={
                    "modele": model_name if model is not None else "naive",
                    "features": contrib,
                    "count_hist": hist,
                    "residu": round(resid, 3),
                },
            )
        )
    intrusions.sort(
        key=lambda r: (int((r.justification or {}).get("count_hist") or 0), r.score),
        reverse=True,
    )

    intrusion_score = {str(i.zone_id): i.score for i in intrusions if i.zone_id}
    max_vol = max(zone_volumes.values(), default=0.0) or 1.0
    zones: list[ZoneIncidentPrediction] = []
    zone_ids = (
        set(zone_centres) | set(zone_volumes) | {str(i.zone_id) for i in intrusions if i.zone_id}
    )
    for zid in zone_ids:
        nom, centre = zone_centres.get(zid, (intrusion_names.get(zid, zid), None))
        vol = zone_volumes.get(zid, 0.0)
        i_score = intrusion_score.get(zid, 0.0)
        dens = vol / max_vol
        q_taux = quota_taux.get(zid, quota_taux.get("__global__", 0.0))
        hist = int(sum(v for _, v in intrusion_series.get(zid, [])))
        # Poisson peut coller à 0 ; l’historique d’intrusions reste le signal de foyer.
        hist_score = eng.score_count(float(hist) / 4.0)
        combined = max(i_score, hist_score)
        score = 0.55 * combined + 0.3 * dens + 0.15 * min(1.0, q_taux)
        if score <= 0 and vol <= 0 and hist <= 0:
            continue
        try:
            zone_uuid = UUID(zid)
        except ValueError:
            zone_uuid = None
        zones.append(
            ZoneIncidentPrediction(
                zone_id=zone_uuid,
                zone_nom=str(nom),
                centre=centre,  # type: ignore[arg-type]
                score=round(score, 4),
                count_intrusions_hist=hist,
                volume_captures_kg=round(vol, 2),
                quota_taux_max=round(q_taux, 4) if q_taux else None,
                justification={
                    "modele": "score_compose",
                    "features": {
                        "intrusion": round(combined, 4),
                        "densite_captures": round(dens, 4),
                        "quota_taux": round(q_taux, 4),
                        "count_hist": hist,
                    },
                    "seuil_penurie": None,
                    "baseline_kg": None,
                    "observation_kg": vol,
                },
            )
        )
    hot = [z for z in zones if z.count_intrusions_hist > 0]
    cold = [z for z in zones if z.count_intrusions_hist <= 0]
    hot.sort(key=lambda z: (z.count_intrusions_hist, z.score), reverse=True)
    cold.sort(key=lambda z: z.score, reverse=True)

    return PredictionsRead(
        horizon_jours=horizon,
        mode=mode,  # type: ignore[arg-type]
        peches=peches,
        penuries=penuries,
        intrusions=intrusions,
        zones_incidents=(hot + cold)[:20],
        genere_a=now,
    )


async def get_predictions(db: AsyncSession, *, horizon_jours: int = 30) -> PredictionsRead:
    horizon = 7 if horizon_jours <= 7 else 30
    key = await _fingerprint(db, horizon)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    daily = await _daily_captures(db)
    intrusion_series, names = await _intrusion_series(db)
    zone_volumes = await _zone_capture_volumes(db)
    zone_centres = await _zone_centres(db)
    quota_taux = await _quota_taux_by_zone(db)

    payload = await asyncio.to_thread(
        _compute,
        horizon=horizon,
        daily=daily,
        intrusion_series=intrusion_series,
        intrusion_names=names,
        zone_volumes=zone_volumes,
        zone_centres=zone_centres,
        quota_taux=quota_taux,
    )
    _cache_put(key, payload)
    return payload
