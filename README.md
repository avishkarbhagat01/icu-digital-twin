# ICU Deterioration Digital Twin

AI-based patient monitoring and early risk prediction: a web research prototype that keeps a
virtual state ("digital twin") for each simulated ICU patient, estimates deterioration risk with a
trained ML model, and shows trends, risk levels and alerts on a clinician-style dashboard.

> **Prototype for academic research and demonstration only.** All patients and data are synthetic.
> The model is trained and evaluated on simulated data, so its scores say nothing about real-world
> clinical accuracy. It must not be used for treatment decisions.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, React Router |
| Backend | Python, FastAPI, Pydantic v2 |
| Data and AI | Pandas, NumPy, scikit-learn, Joblib |
| Storage | SQLite (stdlib `sqlite3`, WAL mode) |
| Tests | Pytest, Vitest, React Testing Library |

## Quick start

**Backend** (Python 3.10+; tested with Python 3.13.5)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.ml.train          # trains the model, writes models/model.joblib + metrics.json
uvicorn app.main:app --reload --port 8000
```

For local development, create `backend/.env` from the blank template and put a username, a
password with at least 12 characters, and a random secret of at least 32 characters in it. For
example, from the project root, copy the template and generate strong password and secret values
in PowerShell with:

```powershell
Copy-Item backend\.env.example backend\.env
python -c "import secrets; print(secrets.token_urlsafe(24))"
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Save the first generated value as `ICU_ADMIN_PASSWORD` and the second as `ICU_ADMIN_SECRET` in
`backend/.env`; set `ICU_ADMIN_USERNAME` to your chosen username. The backend loads this file at
startup. Complete, valid process-level admin credentials take precedence; if those are missing or
too weak, a complete valid `backend/.env` configuration is used instead. Restart the backend after
changing credentials. The session cookie is HTTP-only; set `ICU_ADMIN_COOKIE_SECURE=true` when serving the app over HTTPS.
Docker Compose also reads `backend/.env` through the backend service `env_file` configuration.

A trained model is already included in `backend/models/`. If loading it fails (for example because of a
different scikit-learn version) the app shows a clear message; just run the train command again.
API docs: http://localhost:8000/docs

**Frontend** (Node 18+)

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173 (proxies /api to :8000)
```

**Docker (optional):** `docker compose up --build`, then open http://localhost:8080.

## Using the demo

1. The simulation starts automatically. Use **Pause / Start / Step / Reset** in the top bar.
2. **Overview** shows 12 synthetic patients ranked by risk; open one for its digital twin, charts and alerts.
3. A few patients are scripted to deteriorate over time, a few have a temporary disturbance (a likely false
   alarm) and the rest stay stable, so alerts appear within a minute.
4. Sign in through **Admin panel** to create, edit, or delete patients and add vital measurements. New patient
   records require all six vital signs on the first measurement; later missing values are carried forward and flagged.
   The patient's trend charts refresh and scroll into view after recording a measurement.
5. **Settings** changes the update interval and the Medium / High thresholds (stored in the database).
6. Data persists in `backend/data/icu_twin.db`. **Reset** wipes it and restarts the same synthetic cohort.

## How it works

```
Patient data -> validation -> digital twin update -> ML prediction -> risk category -> alert -> dashboard
```

* `app/simulator.py` - synthetic patient generator (stable, deteriorating, transient scenarios).
* `app/twin.py` - the digital twin service: validates input, stores the measurement, builds features from the
  patient's recent history, runs the model, classifies risk, raises alerts. Also serves twin state and history.
* `app/features.py` - feature engineering shared by training and live inference (vitals, MAP, shock index,
  3-step trends, age).
* `app/ml/` - dataset builder, trainer, predictor.
* `app/simulation.py` - background loop and Start / Pause / Step / Reset.
* `app/api.py` - REST API. Errors always look like `{"error": {"code", "message", "details"}}`.

### The model

* **Target:** a simulated deterioration event within the next 6 measurements, or already in progress.
* **Data:** 1,500 simulated patients (about 61k rows). Each simulated update represents one measurement step.
* **Evaluation:** candidates (logistic regression, gradient boosting) are compared on a validation split; the winner is refit
  and scored once on a held-out test set. Splits are by patient, so no patient appears in both train and test.
* **Metrics shown on the Model evaluation page:** AUROC, AUPRC, precision, recall, F1, confusion matrix, ROC curve,
  permutation feature importance. The page shows an empty state when no valid `metrics.json` exists.
* **Risk levels:** Low < 25% <= Medium < 50% <= High (configurable). Alerts are raised when risk crosses *upward*
  into Medium or High, and are not repeated while an unacknowledged alert at that level or higher exists.
* The very high scores come from the data being simulated and easy to separate. To use real data, replace
  `app/ml/dataset.py` with a loader for an approved, de-identified dataset that has a defensible outcome label.

## API summary

| Method and path | Purpose |
|---|---|
| `GET /api/patients`, `GET /api/patients/{id}` | Twin state (latest and previous values, deltas, risk, flags) |
| `GET /api/patients/{id}/history?limit=` | Measurements with risk scores |
| `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/session` | Admin login session |
| `POST /api/patients`, `PATCH /api/patients/{id}`, `DELETE /api/patients/{id}` | Admin patient record management (authenticated) |
| `POST /api/patients/{id}/measurements` | Add a validated measurement (authenticated) |
| `GET /api/alerts?status=&patient_id=`, `POST /api/alerts/{id}/acknowledge` | Alert list and acknowledgement |
| `GET /api/simulation`, `POST /api/simulation/{start,pause,step,reset}` | Simulation control |
| `GET/PUT /api/settings` | Interval and thresholds |
| `GET /api/model`, `GET /api/model/evaluation` | Model info and evaluation (404 if none) |
| `GET /api/health` | Database, model and simulation status |

## Tests

```bash
cd backend  && pytest          # 23 tests: validation, patient management, auth, twin updates, alerts, simulation, model endpoints
cd frontend && npm test        # 9 tests: components, formatting, evaluation empty / error states
cd frontend && npm run build   # type-check and production build
```

## PRD traceability

| Requirement | Where |
|---|---|
| FR-01 Dashboard | `pages/Dashboard.tsx`, `components/PatientCard.tsx` |
| FR-02 Patient details | `pages/PatientDetail.tsx`, `GET /api/patients/{id}` |
| FR-03 Data management | `schemas.py` (ranges, SBP > DBP), `twin._complete` (missing values flagged), `MeasurementForm.tsx` |
| FR-04 Digital twin | `twin.py` (current, previous, deltas, history in SQLite) |
| FR-05 Simulation | `simulation.py`, `SimControls` in `Layout.tsx`, Settings page |
| FR-06 Trends | `components/Charts.tsx`, `pages/Trends.tsx` |
| FR-07 Risk prediction | `ml/train.py`, `ml/predictor.py`, `features.py` |
| FR-08 Classification | `risk.classify` with thresholds in `app_settings`; "Prototype estimate" label in UI |
| FR-09 Alerts | `twin._maybe_alert` (patient, timestamp, level, reason) |
| FR-10 Alert management | `POST /alerts/{id}/acknowledge`, `pages/Alerts.tsx` (acknowledgement is not an intervention) |
| FR-11 Model evaluation | `pages/ModelEvaluation.tsx`, `models/metrics.json` |
| FR-12 Error handling | `errors.py`, `Notice` banners, graceful no-model mode |
| NFR | Separate frontend / backend / model code; env-based config (`.env.example`); no patient-identifying data; tests |

## Limitations

Synthetic-data results do not establish clinical performance. Risk estimates may be wrong, and missing or delayed
measurements can affect predictions. No hospital integration or audit trail is included. Configure a strong admin
password and secret; use HTTPS with secure cookies when deploying beyond local development.
