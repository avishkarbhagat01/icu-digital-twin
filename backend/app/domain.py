"""Shared clinical-prototype constants (no heavy imports)."""

VITALS = ["heart_rate", "systolic_bp", "diastolic_bp", "spo2", "temperature", "respiratory_rate"]

LABELS = {
    "heart_rate": "Heart rate",
    "systolic_bp": "Systolic BP",
    "diastolic_bp": "Diastolic BP",
    "spo2": "SpO2",
    "temperature": "Temperature",
    "respiratory_rate": "Respiratory rate",
}

# Hard physiological limits: values outside are treated as invalid input and rejected.
VITAL_LIMITS = {
    "heart_rate": (20, 250),
    "systolic_bp": (40, 260),
    "diastolic_bp": (20, 160),
    "spo2": (50, 100),
    "temperature": (30, 43),
    "respiratory_rate": (4, 60),
}

# Descriptive reference ranges used only to flag values for review (not diagnostic).
REFERENCE_RANGES = {
    "heart_rate": (50, 110),
    "systolic_bp": (90, 180),
    "diastolic_bp": (50, 110),
    "spo2": (92, 100),
    "temperature": (36.0, 38.0),
    "respiratory_rate": (10, 24),
}

# Change over the last 3 measurements that is worth mentioning: (threshold, wording).
TREND_RULES = {
    "heart_rate": (15.0, "rose"),
    "systolic_bp": (-15.0, "fell"),
    "spo2": (-3.0, "fell"),
    "respiratory_rate": (5.0, "rose"),
    "temperature": (0.8, "rose"),
}

RISK_ORDER = {"Low": 0, "Medium": 1, "High": 2}
HORIZON_STEPS = 6

DEFAULT_SETTINGS = {"interval_seconds": 3.0, "medium_threshold": 0.25, "high_threshold": 0.5}

DISCLAIMER = (
    "Prototype for academic research and demonstration only. Scores come from a model trained on "
    "synthetic data and do not establish clinical performance. Not for treatment decisions."
)
