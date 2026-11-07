"""Synthetic patient generator, used both to train the model and to drive the live demo."""
from __future__ import annotations

import numpy as np

from .domain import VITAL_LIMITS, VITALS

SIGMA = dict(heart_rate=3.0, systolic_bp=4.0, diastolic_bp=2.8, spo2=0.45, temperature=0.08, respiratory_rate=0.9)
EFFECT = dict(heart_rate=38, systolic_bp=-34, diastolic_bp=-18, spo2=-8.5, temperature=1.3, respiratory_rate=11)
SCENARIOS = ("stable", "deteriorating", "transient")
RAMP_STEPS = 8


class PatientSimulator:
    """Generates one measurement per call().

    stable        - baseline plus autocorrelated noise
    deteriorating - physiology drifts over RAMP_STEPS and reaches the event at `onset`
    transient     - a temporary, milder disturbance that resolves (a likely false alarm)
    """

    def __init__(self, rng: np.random.Generator, age: int, scenario: str = "stable", onset: int | None = None):
        assert scenario in SCENARIOS
        self.rng, self.age, self.scenario, self.onset, self.t = rng, age, scenario, onset, 0
        sbp = 108 + 0.28 * age + rng.normal(0, 8)
        self.base = {
            "heart_rate": rng.normal(80, 8),
            "systolic_bp": sbp,
            "diastolic_bp": 0.6 * sbp + rng.normal(0, 4),
            "spo2": min(99.0, rng.normal(97.3, 1.0)),
            "temperature": rng.normal(36.9, 0.25),
            "respiratory_rate": rng.normal(16, 2),
        }
        self.noise = {v: 0.0 for v in VITALS}
        self.mag = rng.uniform(0.75, 1.3)
        self.temp_sign = 1 if rng.random() < 0.7 else -1
        self.center = int(rng.integers(8, 32))

    def severity(self, t: int) -> float:
        if self.scenario == "deteriorating" and self.onset is not None:
            return float(np.clip((t - (self.onset - RAMP_STEPS)) / RAMP_STEPS, 0, 1) ** 1.4)
        if self.scenario == "transient":
            return float(0.55 * np.exp(-(((t - self.center) / 3.5) ** 2)))
        return 0.0

    def next(self) -> dict[str, float]:
        s = self.severity(self.t) * self.mag
        eps = self.rng.normal(size=len(VITALS))
        out: dict[str, float] = {}
        for i, v in enumerate(VITALS):
            self.noise[v] = 0.6 * self.noise[v] + SIGMA[v] * eps[i]
            effect = EFFECT[v] * s * (self.temp_sign if v == "temperature" else 1)
            out[v] = self.base[v] + effect + self.noise[v]
        if self.rng.random() < 0.02:  # movement artefact on heart rate
            out["heart_rate"] += self.rng.uniform(15, 30)
        out["diastolic_bp"] = min(out["diastolic_bp"], out["systolic_bp"] - 15)
        for v in VITALS:
            lo, hi = VITAL_LIMITS[v]
            out[v] = float(np.clip(out[v], lo, hi))
            out[v] = round(out[v], 1) if v == "temperature" else float(round(out[v]))
        self.t += 1
        return out

    def fast_forward(self, steps: int) -> None:
        for _ in range(steps):
            self.next()


SCENARIO_CYCLE = ["stable", "deteriorating", "stable", "transient", "stable", "stable",
                  "deteriorating", "stable", "transient", "stable", "deteriorating", "stable"]


def build_roster(n: int, seed: int) -> list[dict]:
    """Deterministic synthetic roster; the same seed always yields the same patients."""
    rng = np.random.default_rng(seed)
    roster, det = [], 0
    for i in range(n):
        scenario = SCENARIO_CYCLE[i % len(SCENARIO_CYCLE)]
        onset = None
        if scenario == "deteriorating":
            onset = 24 + 12 * det + int(rng.integers(0, 4))
            det += 1
        roster.append(dict(
            patient_id=f"P{i + 1:03d}",
            display_name=f"Synthetic Patient {i + 1:03d}",
            age=int(rng.integers(34, 88)),
            hours_since_admission=int(rng.integers(3, 96)),
            scenario=scenario,
            onset=onset,
            sim_seed=seed * 1000 + i,
        ))
    return roster
