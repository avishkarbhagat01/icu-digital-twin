"""Feature engineering shared by training and live inference (single source of truth)."""
from __future__ import annotations

import pandas as pd

from .domain import VITALS

TREND_VITALS = ["heart_rate", "systolic_bp", "spo2", "temperature", "respiratory_rate"]
LOOKBACK = 3
FEATURES = VITALS + ["age", "map", "shock_index"] + [f"{v}_delta{LOOKBACK}" for v in TREND_VITALS]


def build_features(df: pd.DataFrame, age: float) -> pd.DataFrame:
    """One patient's time-ordered measurements -> one feature row per measurement.

    Trend features compare each value with the value LOOKBACK steps earlier
    (or the first available value when fewer steps exist).
    """
    out = df[VITALS].astype(float).reset_index(drop=True).copy()
    out["age"] = float(age)
    out["map"] = (out["systolic_bp"] + 2 * out["diastolic_bp"]) / 3
    out["shock_index"] = out["heart_rate"] / out["systolic_bp"]
    for v in TREND_VITALS:
        lagged = out[v].shift(LOOKBACK).fillna(out[v].iloc[0])
        out[f"{v}_delta{LOOKBACK}"] = out[v] - lagged
    return out[FEATURES]
