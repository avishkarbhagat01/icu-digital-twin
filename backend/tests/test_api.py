import pytest

from app.features import FEATURES, build_features
from app.risk import classify
from app.simulator import PatientSimulator, build_roster
import numpy as np
import pandas as pd

GOOD = dict(heart_rate=88, systolic_bp=120, diastolic_bp=76, spo2=97, temperature=36.8, respiratory_rate=16)


def test_health_and_ten_plus_patients(client):
    assert client.get("/api/health").json()["model_available"] is True
    patients = client.get("/api/patients").json()
    assert len(patients) >= 10
    assert all(p["current"] and p["risk"] for p in patients)


def test_patient_details_match_selection(client):
    s = client.get("/api/patients/P003").json()
    assert s["patient"]["patient_id"] == "P003"
    assert len(client.get("/api/patients/P003/history").json()) == 6


def test_unknown_patient_uses_consistent_error(client):
    r = client.get("/api/patients/NOPE")
    assert r.status_code == 404 and r.json()["error"]["code"] == "patient_not_found"


def test_create_patient_and_add_initial_vitals(client):
    created = client.post("/api/patients", json={"patient_id": "NEW-101", "display_name": "New Patient", "age": 46})
    assert created.status_code == 201
    state = created.json()
    assert state["patient"]["patient_id"] == "NEW-101"
    assert state["patient"]["display_name"] == "New Patient"
    assert state["patient"]["age"] == 46
    assert state["current"] is None and state["measurement_count"] == 0

    incomplete = client.post("/api/patients/NEW-101/measurements", json={"heart_rate": 88})
    assert incomplete.status_code == 422 and incomplete.json()["error"]["code"] == "missing_measurement"

    measured = client.post("/api/patients/NEW-101/measurements", json=GOOD)
    assert measured.status_code == 201
    assert measured.json()["measurement_count"] == 1
    assert measured.json()["current"]["heart_rate"] == 88

    duplicate = client.post("/api/patients", json={"patient_id": "NEW-101", "display_name": "Duplicate", "age": 30})
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "patient_exists"


def test_admin_authentication_and_patient_record_management(client):
    client.post("/api/admin/logout")
    session = client.get("/api/admin/session").json()
    assert session == {"configured": True, "authenticated": False, "username": None, "configuration_error": None}
    assert client.post("/api/patients", json={"patient_id": "LOCKED", "display_name": "No access", "age": 20}).status_code == 401
    assert client.post("/api/patients/P001/measurements", json=GOOD).status_code == 401
    login = client.post("/api/admin/login", json={"username": "test-admin", "password": "wrong"})
    assert login.status_code == 401
    login = client.post("/api/admin/login", json={"username": "wrong", "password": "test-password"})
    assert login.status_code == 401
    login = client.post("/api/admin/login", json={"username": "test-admin", "password": "test-password"})
    assert login.status_code == 200
    assert "test-password" not in login.text and "test-secret-at-least-32-characters" not in login.text
    assert client.get("/api/admin/session").json() == {
        "configured": True, "authenticated": True, "username": "test-admin", "configuration_error": None,
    }

    created = client.post("/api/patients", json={"patient_id": "EDIT-101", "display_name": "Before", "age": 30})
    client.post("/api/patients/EDIT-101/measurements", json=GOOD)
    updated = client.patch("/api/patients/EDIT-101", json={"patient_id": "EDIT-102", "display_name": "After", "age": 31})
    assert updated.status_code == 200
    assert updated.json()["patient"]["patient_id"] == "EDIT-102"
    assert updated.json()["patient"]["display_name"] == "After"
    assert client.get("/api/patients/EDIT-101").status_code == 404
    assert client.get("/api/patients/EDIT-102/history").json()[-1]["heart_rate"] == GOOD["heart_rate"]

    deleted = client.delete("/api/patients/EDIT-102")
    assert deleted.status_code == 200
    assert client.get("/api/patients/EDIT-102").status_code == 404


@pytest.mark.parametrize("field,value", [("heart_rate", 400), ("spo2", 120), ("temperature", 10), ("respiratory_rate", -1)])
def test_out_of_range_values_rejected(client, field, value):
    r = client.post("/api/patients/P001/measurements", json={**GOOD, field: value})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["details"][0]["field"] == field


def test_systolic_must_exceed_diastolic(client):
    r = client.post("/api/patients/P001/measurements", json={**GOOD, "systolic_bp": 70, "diastolic_bp": 80})
    assert r.status_code == 422


def test_missing_value_is_flagged_and_carried_forward(client):
    before = client.get("/api/patients/P001").json()["current"]["spo2"]
    body = {k: v for k, v in GOOD.items() if k != "spo2"}
    r = client.post("/api/patients/P001/measurements", json=body)
    assert r.status_code == 201
    cur = r.json()["current"]
    assert cur["quality"] == "imputed" and cur["spo2"] == before and "SpO2" in cur["quality_notes"]


def test_new_measurement_updates_twin_and_history(client):
    n = client.get("/api/patients/P002").json()["measurement_count"]
    r = client.post("/api/patients/P002/measurements", json=GOOD).json()
    assert r["measurement_count"] == n + 1 and r["current"]["heart_rate"] == 88
    assert r["previous"] is not None and 0 <= r["risk"]["risk_score"] <= 1
    assert client.get("/api/patients/P002/history").json()[-1]["heart_rate"] == 88


def test_threshold_crossing_creates_alert_and_ack_flow(client):
    bad = dict(heart_rate=150, systolic_bp=75, diastolic_bp=40, spo2=84, temperature=39.4, respiratory_rate=34)
    client.post("/api/patients/P001/measurements", json=GOOD)
    r = client.post("/api/patients/P001/measurements", json=bad).json()
    assert r["risk"]["risk_category"] == "High" and r["new_alert"]["risk_category"] == "High"
    again = client.post("/api/patients/P001/measurements", json=bad).json()
    assert again["new_alert"] is None  # no duplicate while one is unacknowledged
    alerts = client.get("/api/alerts?status=active&patient_id=P001").json()["items"]
    assert alerts and "SpO2" in alerts[0]["reason"]
    ack = client.post(f"/api/alerts/{alerts[0]['alert_id']}/acknowledge").json()
    assert ack["acknowledged"] is True and ack["acknowledged_at"]
    assert client.get("/api/alerts?status=acknowledged&patient_id=P001").json()["items"]
    assert client.post("/api/alerts/99999/acknowledge").status_code == 404


def test_acknowledged_alert_can_be_raised_again_after_crossing_below_threshold(client):
    bad = dict(heart_rate=150, systolic_bp=75, diastolic_bp=40, spo2=84, temperature=39.4, respiratory_rate=34)
    client.post("/api/patients/P001/measurements", json=GOOD)
    first = client.post("/api/patients/P001/measurements", json=bad).json()["new_alert"]
    assert first is not None
    assert client.post(f"/api/alerts/{first['alert_id']}/acknowledge").json()["acknowledged"] is True

    state = None
    for _ in range(10):
        state = client.post("/api/patients/P001/measurements", json=GOOD).json()
        if state["risk"]["risk_category"] == "Low":
            break
    assert state["risk"]["risk_category"] == "Low"

    second = client.post("/api/patients/P001/measurements", json=bad).json()["new_alert"]
    assert second is not None and second["alert_id"] != first["alert_id"]
    alerts = client.get("/api/alerts?patient_id=P001").json()["items"]
    assert len(alerts) == 2 and alerts[0]["alert_id"] == second["alert_id"]


def test_simulation_step_pause_reset(client):
    assert client.get("/api/simulation").json()["running"] is False
    assert client.post("/api/simulation/start").json()["running"] is True
    assert client.post("/api/simulation/pause").json()["running"] is False
    before = client.get("/api/patients/P004").json()["measurement_count"]
    client.post("/api/simulation/step")
    assert client.get("/api/patients/P004").json()["measurement_count"] == before + 1
    client.post("/api/patients/P001/measurements", json=GOOD)
    st = client.post("/api/simulation/reset").json()
    assert st["tick_count"] == 0 and client.get("/api/patients/P004").json()["measurement_count"] == 6


def test_settings_validation_and_reclassification(client):
    assert client.put("/api/settings", json={"medium_threshold": 0.8, "high_threshold": 0.4}).status_code == 422
    assert client.put("/api/settings", json={"interval_seconds": 0.1}).status_code == 422
    new = client.put("/api/settings", json={"medium_threshold": 0.7, "high_threshold": 0.9}).json()
    assert new["high_threshold"] == 0.9
    for p in client.get("/api/patients").json():  # categories follow the configured thresholds
        assert p["risk"]["risk_category"] == classify(p["risk"]["risk_score"], 0.7, 0.9)


def test_model_endpoints(client):
    ev = client.get("/api/model/evaluation").json()
    assert {"auroc", "precision", "recall", "f1"} <= set(ev["metrics"]) and set(ev["confusion_matrix"]) == {"tn", "fp", "fn", "tp"}
    assert client.get("/api/model").json()["available"] is True


def test_missing_model_degrades_gracefully(tmp_path):
    from fastapi.testclient import TestClient
    from app.config import Config
    from app.main import create_app
    cfg = Config(db_path=str(tmp_path / "x.db"), model_dir=str(tmp_path / "none"), autostart=False, initial_history=3)
    with TestClient(create_app(cfg)) as c:
        health = c.get("/api/health")
        assert health.status_code == 200 and health.json()["model_available"] is False
        assert c.get("/api/model").json()["available"] is False
        assert c.get("/api/model/evaluation").status_code == 404
        p = c.get("/api/patients/P001").json()
        assert p["risk"] is None and "model" in p["risk_error"].lower()


def test_simulation_resumes_with_existing_patients_and_measurements(tmp_path):
    from fastapi.testclient import TestClient
    from app.config import Config
    from app.main import create_app

    cfg = Config(db_path=str(tmp_path / "restart.db"), autostart=False, n_patients=12, initial_history=3)
    with TestClient(create_app(cfg)) as first:
        initial = first.get("/api/patients").json()
        assert len(initial) == 12
        initial_count = first.get("/api/patients/P001").json()["measurement_count"]
        first.post("/api/simulation/step")
        after_step = first.get("/api/patients/P001").json()["measurement_count"]
        assert after_step == initial_count + 1

    with TestClient(create_app(cfg)) as restarted:
        patients = restarted.get("/api/patients").json()
        assert len(patients) == 12
        assert len({p["patient"]["patient_id"] for p in patients}) == 12
        assert restarted.get("/api/patients/P001").json()["measurement_count"] == after_step
        restarted.post("/api/simulation/step")
        assert restarted.get("/api/patients/P001").json()["measurement_count"] == after_step + 1


def test_created_patient_survives_application_restart(tmp_path):
    from fastapi.testclient import TestClient
    from app.config import Config
    from app.main import create_app

    cfg = Config(db_path=str(tmp_path / "created-patient.db"), autostart=False, n_patients=12, initial_history=3,
                 admin_username="admin", admin_password="test-password-long-enough", admin_secret="test-secret-at-least-32-characters")
    with TestClient(create_app(cfg)) as first:
        first.post("/api/admin/login", json={"username": "admin", "password": "test-password-long-enough"})
        created = first.post("/api/patients", json={"patient_id": "NEW-101", "display_name": "New Patient", "age": 46})
        assert created.status_code == 201

    with TestClient(create_app(cfg)) as restarted:
        patient = restarted.get("/api/patients/NEW-101")
        assert patient.status_code == 200
        assert patient.json()["patient"]["display_name"] == "New Patient"
        assert restarted.get("/api/patients/P001").status_code == 200


def test_classify_boundaries():
    assert [classify(s, 0.25, 0.5) for s in (0.0, 0.249, 0.25, 0.499, 0.5, 1)] == ["Low", "Low", "Medium", "Medium", "High", "High"]


def test_features_consistent_for_short_history():
    df = pd.DataFrame([GOOD, {**GOOD, "heart_rate": 100}])
    f = build_features(df, 60)
    assert list(f.columns) == FEATURES and f["heart_rate_delta3"].iloc[1] == 12


def test_roster_and_simulator_are_deterministic():
    assert build_roster(12, 7) == build_roster(12, 7)
    a = PatientSimulator(np.random.default_rng(1), 60, "deteriorating", 20)
    b = PatientSimulator(np.random.default_rng(1), 60, "deteriorating", 20)
    assert [a.next() for _ in range(25)] == [b.next() for _ in range(25)]
    assert a.next()["spo2"] < 94  # well past onset
