"""SQLite access (stdlib sqlite3) plus the persisted settings store."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager

from .domain import DEFAULT_SETTINGS
from .errors import ApiError

SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
    patient_id     TEXT PRIMARY KEY,
    display_name   TEXT NOT NULL,
    age            INTEGER NOT NULL CHECK (age BETWEEN 0 AND 120),
    admission_time TEXT NOT NULL,
    demo_status    TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS vital_measurements (
    measurement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id     TEXT NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    timestamp      TEXT NOT NULL,
    heart_rate REAL, systolic_bp REAL, diastolic_bp REAL, spo2 REAL, temperature REAL, respiratory_rate REAL,
    quality        TEXT NOT NULL DEFAULT 'ok',
    quality_notes  TEXT,
    source         TEXT NOT NULL DEFAULT 'simulation'
);
CREATE INDEX IF NOT EXISTS idx_vm_patient ON vital_measurements(patient_id, measurement_id);
CREATE TABLE IF NOT EXISTS risk_predictions (
    prediction_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    measurement_id INTEGER NOT NULL UNIQUE REFERENCES vital_measurements(measurement_id) ON DELETE CASCADE,
    patient_id     TEXT NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    timestamp      TEXT NOT NULL,
    risk_score     REAL NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
    risk_category  TEXT NOT NULL CHECK (risk_category IN ('Low','Medium','High')),
    model_version  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
    alert_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      TEXT NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    timestamp       TEXT NOT NULL,
    risk_category   TEXT NOT NULL,
    risk_score      REAL NOT NULL,
    reason          TEXT NOT NULL,
    acknowledged    INTEGER NOT NULL DEFAULT 0,
    acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id, acknowledged);
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


class Database:
    def __init__(self, path: str):
        self.path = path
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init(self) -> None:
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)


class SettingsStore:
    """Interval and risk thresholds, persisted in the database."""

    def __init__(self, db: Database):
        self.db = db

    def get(self) -> dict:
        with self.db.connect() as conn:
            rows = dict(conn.execute("SELECT key, value FROM app_settings").fetchall())
        return {k: float(rows.get(k, d)) for k, d in DEFAULT_SETTINGS.items()}

    def update(self, values: dict) -> dict:
        new = {**self.get(), **{k: float(v) for k, v in values.items() if v is not None}}
        if not 0.5 <= new["interval_seconds"] <= 60:
            raise ApiError(422, "invalid_settings", "Update interval must be between 0.5 and 60 seconds.")
        if not 0 < new["medium_threshold"] < new["high_threshold"] < 1:
            raise ApiError(422, "invalid_settings", "Thresholds must satisfy 0 < medium < high < 1.")
        with self.db.connect() as conn:
            conn.executemany("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                             [(k, str(v)) for k, v in new.items()])
        return new
