"""Loads the trained model and serves risk scores."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ..features import FEATURES

log = logging.getLogger(__name__)


class PredictionError(Exception):
    """Raised when a risk score cannot be produced."""


class Predictor:
    def __init__(self, model_dir: str):
        self.dir = Path(model_dir)
        self.model = None
        self.meta: dict = {}
        self.load_error: str | None = None
        self.load()

    def load(self) -> None:
        try:
            self.model = joblib.load(self.dir / "model.joblib")
            self.meta = json.loads((self.dir / "metrics.json").read_text())
            self.load_error = None
        except FileNotFoundError:
            self.model, self.load_error = None, "No trained model found. Run `python -m app.ml.train` in the backend folder."
        except Exception as exc:  # corrupt file, scikit-learn version mismatch, ...
            log.exception("model load failed")
            self.model, self.load_error = None, f"Model could not be loaded ({exc.__class__.__name__}). Retrain with `python -m app.ml.train`."

    @property
    def available(self) -> bool:
        return self.model is not None

    @property
    def version(self) -> str:
        return self.meta.get("model_version", "unknown")

    def predict(self, features: pd.DataFrame) -> float:
        if not self.available:
            raise PredictionError(self.load_error or "Model unavailable.")
        try:
            row = features[FEATURES].astype(float)
            if row.isna().any().any():
                raise PredictionError("Missing feature values; risk cannot be estimated.")
            score = float(self.model.predict_proba(row)[0, 1])
        except PredictionError:
            raise
        except Exception as exc:
            raise PredictionError(f"Model failure: {exc}") from exc
        if not np.isfinite(score):
            raise PredictionError("Model returned an invalid score.")
        return min(max(score, 0.0), 1.0)

    def evaluation(self) -> dict | None:
        return self.meta if self.meta.get("metrics") else None
