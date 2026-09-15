"""sklearn léger — Ridge / Poisson sur agrégats hebdomadaires (ADR-006)."""

from __future__ import annotations

from datetime import date, timedelta
from math import exp
from typing import Any

import numpy as np
from sklearn.linear_model import PoissonRegressor, Ridge

from app.modules.dashboard.saisons import SAISON_SECHE, saison_calendaire

FEATURE_NAMES = ("mois", "saison_seche", "lag_1", "lag_4", "lag_annee")
MIN_WEEKS = 8
SEUIL_PENURIE = 0.5


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _is_seche(day: date) -> float:
    return 1.0 if saison_calendaire(day) == SAISON_SECHE else 0.0


def weekly_volumes(
    daily: list[tuple[date, str, float]],
) -> dict[str, list[tuple[date, float]]]:
    """Agrège (jour, espèce, kg) → espèce → [(lundi, kg)]."""
    acc: dict[str, dict[date, float]] = {}
    for day, espece, kg in daily:
        week = monday_of(day)
        acc.setdefault(espece, {})
        acc[espece][week] = acc[espece].get(week, 0.0) + float(kg)
    out: dict[str, list[tuple[date, float]]] = {}
    for espece, weeks in acc.items():
        out[espece] = sorted(weeks.items())
    return out


def _lookup(series: list[tuple[date, float]], week: date) -> float:
    for w, val in series:
        if w == week:
            return val
    return 0.0


def feature_row(series: list[tuple[date, float]], week: date) -> list[float]:
    lag1 = _lookup(series, week - timedelta(days=7))
    lag4 = _lookup(series, week - timedelta(days=28))
    try:
        lag_year = _lookup(series, date(week.year - 1, week.month, week.day))
    except ValueError:
        lag_year = 0.0
    return [
        float(week.month),
        _is_seche(week),
        lag1,
        lag4,
        lag_year,
    ]


def _design_matrix(
    series: list[tuple[date, float]],
) -> tuple[np.ndarray, np.ndarray, list[date]]:
    xs: list[list[float]] = []
    ys: list[float] = []
    weeks: list[date] = []
    by_week = {w: v for w, v in series}
    ordered = sorted(by_week)
    for week in ordered:
        xs.append(feature_row(series, week))
        ys.append(by_week[week])
        weeks.append(week)
    if not xs:
        return np.zeros((0, len(FEATURE_NAMES))), np.zeros(0), []
    return np.asarray(xs, dtype=float), np.asarray(ys, dtype=float), weeks


def fit_ridge(series: list[tuple[date, float]]) -> tuple[Ridge | None, float]:
    X, y, _ = _design_matrix(series)
    if len(y) < MIN_WEEKS:
        return None, 0.0
    model = Ridge(alpha=1.0)
    model.fit(X, y)
    pred = model.predict(X)
    resid = float(np.std(y - pred)) if len(y) > 1 else 0.0
    return model, resid


def fit_count_model(
    series: list[tuple[date, float]],
) -> tuple[Any, str, float]:
    X, y, _ = _design_matrix(series)
    if len(y) < MIN_WEEKS:
        return None, "insuffisant", 0.0
    y_clip = np.clip(y, 0.0, None)
    if float(np.sum(y_clip)) > 0:
        try:
            poisson = PoissonRegressor(alpha=1.0, max_iter=400)
            poisson.fit(X, y_clip)
            pred = poisson.predict(X)
            resid = float(np.std(y_clip - pred)) if len(y_clip) > 1 else 0.0
            return poisson, "poisson", resid
        except Exception:
            pass
    ridge = Ridge(alpha=1.0)
    model_y = np.log1p(y_clip)
    ridge.fit(X, model_y)
    pred = np.expm1(np.clip(ridge.predict(X), 0.0, None))
    resid = float(np.std(y_clip - pred)) if len(y_clip) > 1 else 0.0
    return ("ridge_log1p", ridge), "ridge_log1p", resid


def _predict_raw(model: Any, x: np.ndarray) -> float:
    if model is None:
        return 0.0
    if isinstance(model, tuple) and model[0] == "ridge_log1p":
        val = float(np.expm1(np.clip(model[1].predict(x)[0], -10.0, 20.0)))
        return max(0.0, val)
    val = float(model.predict(x)[0])
    return max(0.0, val)


def coef_contributions(model: Any, x_row: list[float]) -> dict[str, float]:
    inner = model[1] if isinstance(model, tuple) else model
    coef = getattr(inner, "coef_", None)
    if coef is None:
        return {}
    return {
        name: round(float(coef[i] * x_row[i]), 4)
        for i, name in enumerate(FEATURE_NAMES)
        if i < len(coef)
    }


def forecast_weeks(
    series: list[tuple[date, float]],
    n_weeks: int,
    model: Any,
) -> tuple[float, list[float]]:
    """Prévision itérative de n semaines ; retourne somme + pas."""
    working = list(series)
    steps: list[float] = []
    if not working:
        return 0.0, []
    last = working[-1][0]
    for _ in range(n_weeks):
        nxt = last + timedelta(days=7)
        x = np.asarray([feature_row(working, nxt)], dtype=float)
        pred = _predict_raw(model, x)
        steps.append(pred)
        working.append((nxt, pred))
        last = nxt
    return float(sum(steps)), steps


def naive_horizon(series: list[tuple[date, float]], horizon_jours: int) -> float:
    if not series:
        return 0.0
    last4 = series[-4:] if len(series) >= 4 else series
    mean_w = sum(v for _, v in last4) / len(last4)
    return mean_w * (horizon_jours / 7.0)


def intervalle(pred: float, resid: float) -> tuple[float, float]:
    delta = 1.96 * resid if resid > 0 else pred * 0.15
    lo = max(0.0, pred - delta)
    hi = pred + delta
    return round(lo, 2), round(hi, 2)


def score_count(predicted: float) -> float:
    return round(max(0.0, min(1.0, 1.0 - exp(-max(0.0, predicted) / 2.0))), 4)


def seasonal_4week_baseline(series: list[tuple[date, float]]) -> tuple[float, float]:
    """(observation 4 sem., moyenne des fenêtres 4 sem. historiques même saison)."""
    if not series:
        return 0.0, 0.0
    obs = sum(v for _, v in series[-4:])
    if len(series) <= 4:
        return obs, obs
    saison = saison_calendaire(series[-1][0])
    hist = series[:-4]
    windows: list[float] = []
    for i in range(len(hist) - 3):
        chunk = hist[i : i + 4]
        if saison_calendaire(chunk[-1][0]) != saison:
            continue
        windows.append(sum(v for _, v in chunk))
    if not windows:
        mean_w = sum(v for _, v in hist) / max(1, len(hist))
        return obs, mean_w * 4.0
    return obs, sum(windows) / len(windows)


def risque_penurie(
    *,
    obs_4sem: float,
    baseline_4sem: float,
    forecast_30j: float,
    baseline_30j: float,
) -> str:
    cond_obs = baseline_4sem > 0 and obs_4sem < SEUIL_PENURIE * baseline_4sem
    cond_fc = baseline_30j > 0 and forecast_30j < SEUIL_PENURIE * baseline_30j
    if cond_obs and cond_fc:
        return "eleve"
    if cond_obs or cond_fc:
        return "moyen"
    return "faible"
