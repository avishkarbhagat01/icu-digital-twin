"""Train the baseline deterioration-risk model on the synthetic cohort.

    python -m app.ml.train [--patients 1500] [--seed 42]
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..config import BASE_DIR
from ..domain import DEFAULT_SETTINGS, DISCLAIMER, HORIZON_STEPS
from .dataset import build_dataset


def candidates(seed: int):
    return {
        "Logistic regression": Pipeline([("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=2000))]),
        "Gradient boosting": HistGradientBoostingClassifier(max_iter=200, learning_rate=0.08, max_depth=4, random_state=seed),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--patients", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(BASE_DIR / "models"))
    args = ap.parse_args()

    X, y, groups = build_dataset(args.patients, seed=args.seed)
    tv, te = next(GroupShuffleSplit(1, test_size=0.2, random_state=args.seed).split(X, y, groups))
    tr_i, va_i = next(GroupShuffleSplit(1, test_size=0.25, random_state=args.seed).split(X.iloc[tv], y.iloc[tv], groups.iloc[tv]))
    tr, va = tv[tr_i], tv[va_i]

    scores = {}
    for name, model in candidates(args.seed).items():
        model.fit(X.iloc[tr], y.iloc[tr])
        scores[name] = roc_auc_score(y.iloc[va], model.predict_proba(X.iloc[va])[:, 1])
        print(f"validation AUROC  {name}: {scores[name]:.3f}")
    best = max(scores, key=scores.get)
    model = candidates(args.seed)[best].fit(X.iloc[tv], y.iloc[tv])  # refit on train + validation

    prob = model.predict_proba(X.iloc[te])[:, 1]
    yt = y.iloc[te].to_numpy()
    thr = DEFAULT_SETTINGS["high_threshold"]
    pred = (prob >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(yt, pred, labels=[0, 1]).ravel()
    fpr, tpr, _ = roc_curve(yt, prob)
    pick = np.unique(np.linspace(0, len(fpr) - 1, 60).astype(int))

    sample = np.random.default_rng(args.seed).choice(len(te), size=min(6000, len(te)), replace=False)
    imp = permutation_importance(model, X.iloc[te].iloc[sample], yt[sample], scoring="roc_auc",
                                 n_repeats=3, random_state=args.seed)
    importance = sorted(({"feature": f, "importance": round(float(v), 4)} for f, v in zip(X.columns, imp.importances_mean)),
                        key=lambda d: -d["importance"])

    now = datetime.now(timezone.utc)
    meta = {
        "model_version": f"{best.lower().replace(' ', '-')}-{now:%Y%m%d}",
        "model_type": best,
        "trained_at": now.isoformat(timespec="seconds"),
        "data_source": "Synthetic (simulated) cohort",
        "target": f"Simulated deterioration event within the next {HORIZON_STEPS} measurements, or already in progress",
        "horizon_steps": HORIZON_STEPS,
        "evaluation_method": "Held-out test set split by patient (no patient appears in both train and test).",
        "dataset": {
            "patients": args.patients,
            "rows_total": int(len(X)),
            "rows_train": int(len(tr)), "rows_validation": int(len(va)), "rows_test": int(len(te)),
            "positive_rate_test": round(float(yt.mean()), 4),
        },
        "candidates": [{"name": k, "validation_auroc": round(float(v), 4)} for k, v in scores.items()],
        "threshold": thr,
        "metrics": {
            "auroc": round(float(roc_auc_score(yt, prob)), 4),
            "auprc": round(float(average_precision_score(yt, prob)), 4),
            "precision": round(float(precision_score(yt, pred, zero_division=0)), 4),
            "recall": round(float(recall_score(yt, pred, zero_division=0)), 4),
            "f1": round(float(f1_score(yt, pred, zero_division=0)), 4),
            "accuracy": round(float((pred == yt).mean()), 4),
        },
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "roc_curve": [{"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)} for i in pick],
        "feature_importance": importance,
        "disclaimer": DISCLAIMER,
    }
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out / "model.joblib")
    (out / "metrics.json").write_text(json.dumps(meta, indent=2))
    print(f"\nSaved {best} ({meta['model_version']}) to {out}")
    print(json.dumps(meta["metrics"], indent=2), meta["confusion_matrix"])


if __name__ == "__main__":
    main()
