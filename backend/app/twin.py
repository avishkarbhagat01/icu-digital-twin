"""Digital Twin service: validate -> update twin -> predict -> classify -> alert."""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from .db import Database, SettingsStore
from .domain import LABELS, RISK_ORDER, VITALS
from .errors import ApiError
from .features import LOOKBACK, build_features
from .ml.predictor import PredictionError, Predictor
from .risk import classify, explain, reference_flags

import pandas as pd


def now_iso(offset_seconds: float = 0.0) -> str:
    t = datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)
    return t.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class DigitalTwin:
    def __init__(self, db: Database, predictor: Predictor, settings: SettingsStore):
        self.db, self.predictor, self.settings = db, predictor, settings
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ writes
    def reset_data(self) -> None:
        with self._lock, self.db.connect() as conn:
            for table in ("alerts", "risk_predictions", "vital_measurements", "patients"):
                conn.execute(f"DELETE FROM {table}")

    def add_patient(self, p: dict) -> None:
        with self.db.connect() as conn:
            conn.execute("INSERT INTO patients(patient_id, display_name, age, admission_time) VALUES(?,?,?,?)",
                         (p["patient_id"], p["display_name"], p["age"], now_iso(-3600 * p["hours_since_admission"])))

    def create_patient(self, patient: dict) -> dict:
        with self._lock:
            try:
                with self.db.connect() as conn:
                    conn.execute(
                        "INSERT INTO patients(patient_id, display_name, age, admission_time) VALUES(?,?,?,?)",
                        (patient["patient_id"], patient["display_name"], patient["age"], now_iso()),
                    )
            except sqlite3.IntegrityError as exc:
                if "patients.patient_id" in str(exc):
                    raise ApiError(409, "patient_exists", f"Patient {patient['patient_id']} already exists.") from exc
                raise
        return self.get_state(patient["patient_id"])

    def update_patient(self, patient_id: str, patient: dict) -> dict:
        with self._lock:
            try:
                with self.db.connect() as conn:
                    self._patient(conn, patient_id)
                    conn.execute("PRAGMA defer_foreign_keys = ON")
                    conn.execute(
                        "UPDATE patients SET patient_id=?, display_name=?, age=? WHERE patient_id=?",
                        (patient["patient_id"], patient["display_name"], patient["age"], patient_id),
                    )
                    if patient["patient_id"] != patient_id:
                        for table in ("vital_measurements", "risk_predictions", "alerts"):
                            conn.execute(f"UPDATE {table} SET patient_id=? WHERE patient_id=?",
                                         (patient["patient_id"], patient_id))
            except sqlite3.IntegrityError as exc:
                if "patients.patient_id" in str(exc):
                    raise ApiError(409, "patient_exists", f"Patient {patient['patient_id']} already exists.") from exc
                raise
        return self.get_state(patient["patient_id"])

    def delete_patient(self, patient_id: str) -> None:
        with self._lock, self.db.connect() as conn:
            self._patient(conn, patient_id)
            remaining = conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
            if remaining <= 1:
                raise ApiError(409, "last_patient", "At least one patient record must remain.")
            conn.execute("DELETE FROM patients WHERE patient_id=?", (patient_id,))

    def ingest(self, patient_id: str, raw: dict, timestamp: str | None = None, source: str = "simulation") -> dict:
        with self._lock:
            with self.db.connect() as conn:
                patient = self._patient(conn, patient_id)
                recent = self._recent(conn, patient_id, LOOKBACK + 1)
                values, quality, notes = self._complete(raw, recent[-1] if recent else None)
                ts = timestamp or now_iso()
                cur = conn.execute(
                    f"INSERT INTO vital_measurements(patient_id, timestamp, {', '.join(VITALS)}, quality, quality_notes, source) "
                    f"VALUES(?,?,{','.join('?' * len(VITALS))},?,?,?)",
                    (patient_id, ts, *[values[v] for v in VITALS], quality, notes, source))
                mid = cur.lastrowid
                risk_error, alert = None, None
                try:
                    df = pd.DataFrame([{v: r[v] for v in VITALS} for r in recent] + [values])
                    feats = build_features(df, patient["age"])
                    score = self.predictor.predict(feats.iloc[[-1]])
                    cfg = self.settings.get()
                    category = classify(score, cfg["medium_threshold"], cfg["high_threshold"])
                    conn.execute("INSERT INTO risk_predictions(measurement_id, patient_id, timestamp, risk_score, risk_category, model_version) "
                                 "VALUES(?,?,?,?,?,?)", (mid, patient_id, ts, score, category, self.predictor.version))
                    prev_score = recent[-1]["risk_score"] if recent else None
                    prev_order = -1 if prev_score is None else RISK_ORDER[classify(prev_score, cfg["medium_threshold"], cfg["high_threshold"])]
                    alert = self._maybe_alert(conn, patient_id, ts, score, category, prev_order, values,
                                              self._deltas(feats.iloc[-1]))
                except PredictionError as exc:
                    risk_error = str(exc)
        state = self.get_state(patient_id)
        state["risk_error"] = risk_error
        state["new_alert"] = alert
        return state

    def _maybe_alert(self, conn, pid, ts, score, category, prev_order, values, deltas):
        order = RISK_ORDER[category]
        if order == 0 or prev_order >= order:
            return None  # only upward crossings into Medium/High raise an alert
        open_orders = [RISK_ORDER[r["risk_category"]] for r in conn.execute(
            "SELECT risk_category FROM alerts WHERE patient_id=? AND acknowledged=0", (pid,))]
        if any(o >= order for o in open_orders):
            return None  # already an unacknowledged alert at this level or higher
        reason = explain(values, deltas, score, category)
        cur = conn.execute("INSERT INTO alerts(patient_id, timestamp, risk_category, risk_score, reason) VALUES(?,?,?,?,?)",
                           (pid, ts, category, score, reason))
        return {"alert_id": cur.lastrowid, "patient_id": pid, "risk_category": category, "risk_score": score, "reason": reason}

    def acknowledge(self, alert_id: int) -> dict:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
            if row is None:
                raise ApiError(404, "alert_not_found", f"Alert {alert_id} does not exist.")
            if not row["acknowledged"]:
                conn.execute("UPDATE alerts SET acknowledged=1, acknowledged_at=? WHERE alert_id=?", (now_iso(), alert_id))
            return self._alert(conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone())

    # ------------------------------------------------------------------- reads
    def list_states(self) -> list[dict]:
        cfg = self.settings.get()
        with self.db.connect() as conn:
            out = []
            for p in conn.execute("SELECT * FROM patients ORDER BY patient_id"):
                s = self._state(conn, p, cfg)
                s["risk_spark"] = [r["risk_score"] for r in conn.execute(
                    "SELECT risk_score FROM risk_predictions WHERE patient_id=? ORDER BY measurement_id DESC LIMIT 24", (p["patient_id"],))][::-1]
                out.append(s)
            return out

    def get_state(self, patient_id: str) -> dict:
        with self.db.connect() as conn:
            return self._state(conn, self._patient(conn, patient_id), self.settings.get())

    def history(self, patient_id: str, limit: int = 120) -> list[dict]:
        cfg = self.settings.get()
        with self.db.connect() as conn:
            self._patient(conn, patient_id)
            rows = self._recent(conn, patient_id, limit)
        for r in rows:
            r["risk_category"] = None if r["risk_score"] is None else classify(r["risk_score"], cfg["medium_threshold"], cfg["high_threshold"])
        return rows

    def alerts(self, status: str = "all", patient_id: str | None = None, limit: int = 100) -> dict:
        where, args = [], []
        if status == "active":
            where.append("acknowledged=0")
        elif status == "acknowledged":
            where.append("acknowledged=1")
        if patient_id:
            where.append("patient_id=?")
            args.append(patient_id)
        sql = "SELECT * FROM alerts" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY alert_id DESC LIMIT ?"
        with self.db.connect() as conn:
            items = [self._alert(r) for r in conn.execute(sql, (*args, limit))]
            counts = {"active": conn.execute("SELECT COUNT(*) FROM alerts WHERE acknowledged=0").fetchone()[0],
                      "acknowledged": conn.execute("SELECT COUNT(*) FROM alerts WHERE acknowledged=1").fetchone()[0]}
        return {"items": items, "counts": counts}

    # ----------------------------------------------------------------- helpers
    @staticmethod
    def _alert(r) -> dict:
        d = dict(r)
        d["acknowledged"] = bool(d["acknowledged"])
        return d

    @staticmethod
    def _patient(conn, pid):
        row = conn.execute("SELECT * FROM patients WHERE patient_id=?", (pid,)).fetchone()
        if row is None:
            raise ApiError(404, "patient_not_found", f"Patient {pid} does not exist.")
        return row

    @staticmethod
    def _recent(conn, pid, n) -> list[dict]:
        rows = conn.execute(
            "SELECT m.*, p.risk_score, p.risk_category, p.model_version FROM vital_measurements m "
            "LEFT JOIN risk_predictions p ON p.measurement_id = m.measurement_id "
            "WHERE m.patient_id=? ORDER BY m.measurement_id DESC LIMIT ?", (pid, n)).fetchall()
        return [dict(r) for r in rows][::-1]

    @staticmethod
    def _complete(raw: dict, last: dict | None):
        values, carried = {}, []
        for v in VITALS:
            x = raw.get(v)
            if x is None:
                if last is None or last.get(v) is None:
                    raise ApiError(422, "missing_measurement",
                                   f"{LABELS[v]} is missing and there is no earlier value to carry forward.", [{"field": v}])
                x = last[v]
                carried.append(LABELS[v])
            values[v] = float(x)
        if values["systolic_bp"] <= values["diastolic_bp"]:
            raise ApiError(422, "invalid_measurement", "Systolic BP must be higher than diastolic BP.")
        notes = "Carried forward from the previous measurement: " + ", ".join(carried) if carried else None
        return values, ("imputed" if carried else "ok"), notes

    @staticmethod
    def _deltas(feature_row) -> dict:
        return {k.removesuffix(f"_delta{LOOKBACK}"): float(v) for k, v in feature_row.items() if k.endswith(f"_delta{LOOKBACK}")}

    def _state(self, conn, p, cfg) -> dict:
        recent = self._recent(conn, p["patient_id"], LOOKBACK + 1)
        cur = recent[-1] if recent else None
        prev = recent[-2] if len(recent) > 1 else None
        state = {
            "patient": dict(p), "current": None, "previous": None, "deltas": {}, "flags": [],
            "risk": None, "risk_error": None, "measurement_count": 0, "last_update": None,
            "active_alerts": conn.execute("SELECT COUNT(*) FROM alerts WHERE patient_id=? AND acknowledged=0", (p["patient_id"],)).fetchone()[0],
        }
        state["measurement_count"] = conn.execute("SELECT COUNT(*) FROM vital_measurements WHERE patient_id=?", (p["patient_id"],)).fetchone()[0]
        if cur is None:
            return state
        strip = lambda r: None if r is None else {k: r[k] for k in ("measurement_id", "timestamp", *VITALS, "quality", "quality_notes")}
        state.update(current=strip(cur), previous=strip(prev), last_update=cur["timestamp"], flags=reference_flags(cur))
        if prev:
            state["deltas"] = {v: round(cur[v] - prev[v], 2) for v in VITALS}
        if cur["risk_score"] is not None:
            feats = build_features(pd.DataFrame([{v: r[v] for v in VITALS} for r in recent]), p["age"])
            category = classify(cur["risk_score"], cfg["medium_threshold"], cfg["high_threshold"])
            state["risk"] = {"risk_score": cur["risk_score"], "risk_category": category, "model_version": cur["model_version"],
                             "timestamp": cur["timestamp"], "reason": explain(cur, self._deltas(feats.iloc[-1]), cur["risk_score"], category)}
        else:
            state["risk_error"] = self.predictor.load_error or "No risk estimate is available for the latest measurement."
        return state
