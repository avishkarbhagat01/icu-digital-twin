from __future__ import annotations

from typing import Literal

import hmac

from fastapi import APIRouter, Query, Request, Response

from .admin_auth import COOKIE_NAME, SESSION_SECONDS, configuration_error, create_session, is_configured, require_admin
from .domain import DISCLAIMER
from .errors import ApiError
from .schemas import AdminLoginIn, MeasurementIn, PatientIn, SettingsIn
from .twin import to_iso

router = APIRouter(prefix="/api")


def _svc(request: Request):
    return request.app.state


@router.get("/health")
def health(request: Request):
    s = _svc(request)
    try:
        s.settings.get()
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "model_available": s.predictor.available,
            "simulation_running": s.sim.running}


# --- patients / digital twin -------------------------------------------------
@router.get("/patients")
def list_patients(request: Request):
    return _svc(request).twin.list_states()


@router.post("/patients", status_code=201)
def create_patient(body: PatientIn, request: Request):
    require_admin(request)
    return _svc(request).twin.create_patient(body.model_dump())


@router.patch("/patients/{patient_id}")
def update_patient(patient_id: str, body: PatientIn, request: Request):
    require_admin(request)
    state = _svc(request).twin.update_patient(patient_id, body.model_dump())
    if patient_id != body.patient_id:
        _svc(request).sim.rename_patient(patient_id, body.patient_id)
    return state


@router.delete("/patients/{patient_id}")
def delete_patient(patient_id: str, request: Request):
    require_admin(request)
    _svc(request).twin.delete_patient(patient_id)
    _svc(request).sim.remove_patient(patient_id)
    return {"deleted": True, "patient_id": patient_id}


@router.get("/admin/session")
def admin_session(request: Request):
    config = _svc(request).config
    if not is_configured(config):
        return {"configured": False, "authenticated": False, "username": None,
                "configuration_error": configuration_error(config)}
    try:
        username = require_admin(request)
    except ApiError as exc:
        if exc.status == 401:
            return {"configured": True, "authenticated": False, "username": None, "configuration_error": None}
        raise
    return {"configured": True, "authenticated": True, "username": username, "configuration_error": None}


@router.post("/admin/login")
def admin_login(body: AdminLoginIn, request: Request, response: Response):
    config = _svc(request).config
    if not is_configured(config):
        create_session(config)
    username_matches = hmac.compare_digest(body.username.encode("utf-8"), config.admin_username.encode("utf-8"))
    password_matches = hmac.compare_digest(body.password.encode("utf-8"), config.admin_password.encode("utf-8"))
    if not (username_matches & password_matches):
        raise ApiError(401, "invalid_credentials", "Username or password is incorrect.")
    token = create_session(config)
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True, secure=config.admin_cookie_secure,
                        samesite="strict", path="/")
    return {"authenticated": True, "username": config.admin_username}


@router.post("/admin/logout")
def admin_logout(response: Response):
    response.delete_cookie(COOKIE_NAME, httponly=True, samesite="strict", path="/")
    return {"authenticated": False, "username": None}


@router.get("/patients/{patient_id}")
def get_patient(patient_id: str, request: Request):
    return _svc(request).twin.get_state(patient_id)


@router.get("/patients/{patient_id}/history")
def patient_history(patient_id: str, request: Request, limit: int = Query(120, ge=1, le=1000)):
    return _svc(request).twin.history(patient_id, limit)


@router.post("/patients/{patient_id}/measurements", status_code=201)
def add_measurement(patient_id: str, body: MeasurementIn, request: Request):
    require_admin(request)
    ts = to_iso(body.timestamp) if body.timestamp else None
    return _svc(request).twin.ingest(patient_id, body.model_dump(exclude={"timestamp"}), timestamp=ts, source="manual")


# --- alerts ---------------------------------------------------------------------
@router.get("/alerts")
def list_alerts(request: Request, status: Literal["all", "active", "acknowledged"] = "all",
                patient_id: str | None = None, limit: int = Query(100, ge=1, le=500)):
    return _svc(request).twin.alerts(status, patient_id, limit)


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, request: Request):
    """Records that a person has seen the alert. This is not a clinical intervention."""
    return _svc(request).twin.acknowledge(alert_id)


# --- simulation & settings ------------------------------------------------------
@router.get("/simulation")
def simulation_status(request: Request):
    return _svc(request).sim.status()


@router.post("/simulation/{action}")
def simulation_action(action: Literal["start", "pause", "reset", "step"], request: Request):
    sim = _svc(request).sim
    {"start": sim.start, "pause": sim.pause, "reset": sim.reset, "step": sim.step}[action]()
    return sim.status()


@router.get("/settings")
def get_settings(request: Request):
    return _svc(request).settings.get()


@router.put("/settings")
def put_settings(body: SettingsIn, request: Request):
    return _svc(request).settings.update(body.model_dump(exclude_none=True))


# --- model ----------------------------------------------------------------------
@router.get("/model")
def model_info(request: Request):
    p = _svc(request).predictor
    meta = p.meta
    return {"available": p.available, "error": p.load_error, "model_version": p.version if p.available else None,
            "model_type": meta.get("model_type"), "target": meta.get("target"), "data_source": meta.get("data_source"),
            "trained_at": meta.get("trained_at"), "disclaimer": DISCLAIMER}


@router.get("/model/evaluation")
def model_evaluation(request: Request):
    ev = _svc(request).predictor.evaluation()
    if ev is None:
        raise ApiError(404, "evaluation_unavailable",
                       "No valid evaluation results exist. Train the model with `python -m app.ml.train` to generate them.")
    return ev
