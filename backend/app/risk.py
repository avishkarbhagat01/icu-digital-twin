"""Risk categories, reference-range flags and plain-language reasons for review."""
from __future__ import annotations

from .domain import LABELS, REFERENCE_RANGES, TREND_RULES


def classify(score: float, medium: float, high: float) -> str:
    return "High" if score >= high else "Medium" if score >= medium else "Low"


def reference_flags(vitals: dict) -> list[dict]:
    """Descriptive flags for values outside the reference ranges (not a diagnosis)."""
    flags = []
    for key, (lo, hi) in REFERENCE_RANGES.items():
        v = vitals.get(key)
        if v is None:
            continue
        if v < lo or v > hi:
            flags.append({"vital": key, "status": "low" if v < lo else "high", "value": v,
                          "message": f"{LABELS[key]} {v:g} is {'below' if v < lo else 'above'} the {lo:g}-{hi:g} reference range"})
    return flags


def trend_findings(deltas: dict) -> list[str]:
    out = []
    for key, (thr, verb) in TREND_RULES.items():
        d = deltas.get(key)
        if d is None:
            continue
        if (thr > 0 and d >= thr) or (thr < 0 and d <= thr):
            out.append(f"{LABELS[key]} {verb} by {abs(d):.3g} over the last 3 measurements")
    return out


def explain(vitals: dict, deltas: dict, score: float, category: str) -> str:
    findings = [f["message"] for f in reference_flags(vitals)] + trend_findings(deltas)
    head = f"{category} risk estimate ({score:.0%})"
    if findings:
        return f"{head}. Review: " + "; ".join(findings) + "."
    return f"{head}. No single reference-range breach; the estimate reflects the combined pattern of recent measurements."
