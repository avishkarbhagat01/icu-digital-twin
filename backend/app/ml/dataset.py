"""Builds the labelled synthetic training cohort."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..domain import HORIZON_STEPS, VITALS
from ..features import FEATURES, build_features
from ..simulator import PatientSimulator

POST_EVENT_STEPS = 8


def build_dataset(n_patients: int = 1500, n_steps: int = 48, seed: int = 42):
    """Label = 1 when a simulated deterioration event occurs within the next HORIZON_STEPS measurements,
    or is already in progress (up to POST_EVENT_STEPS after onset, then rows are dropped).

    Returns X, y, groups (patient index, used for leakage-free splits).
    """
    rng = np.random.default_rng(seed)
    frames, labels, groups = [], [], []
    for pid in range(n_patients):
        age = int(rng.integers(30, 90))
        u = rng.random()
        scenario = "deteriorating" if u < 0.4 else "transient" if u < 0.6 else "stable"
        onset = int(rng.integers(10, 35)) if scenario == "deteriorating" else None
        sim = PatientSimulator(np.random.default_rng(rng.integers(0, 2**31)), age, scenario, onset)
        df = pd.DataFrame([sim.next() for _ in range(n_steps)])[VITALS]
        feats = build_features(df, age)
        steps = np.arange(n_steps)
        if onset is None:
            y, keep = np.zeros(n_steps, dtype=int), np.ones(n_steps, dtype=bool)
        else:
            y = (steps >= onset - HORIZON_STEPS).astype(int)
            keep = steps <= onset + POST_EVENT_STEPS
        frames.append(feats[keep])
        labels.append(y[keep])
        groups.append(np.full(keep.sum(), pid))
    X = pd.concat(frames, ignore_index=True)[FEATURES]
    return X, pd.Series(np.concatenate(labels), name="label"), pd.Series(np.concatenate(groups), name="patient")
