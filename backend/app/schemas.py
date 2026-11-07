from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .domain import VITAL_LIMITS


def _f(name: str):
    lo, hi = VITAL_LIMITS[name]
    return Field(None, ge=lo, le=hi, description=f"{lo}-{hi}")


class MeasurementIn(BaseModel):
    """A single set of vital signs. Missing values are allowed (flagged and carried forward);
    values outside physiological limits are rejected."""
    heart_rate: Optional[float] = _f("heart_rate")
    systolic_bp: Optional[float] = _f("systolic_bp")
    diastolic_bp: Optional[float] = _f("diastolic_bp")
    spo2: Optional[float] = _f("spo2")
    temperature: Optional[float] = _f("temperature")
    respiratory_rate: Optional[float] = _f("respiratory_rate")
    timestamp: Optional[datetime] = None

    @model_validator(mode="after")
    def _check(self):
        vals = [self.heart_rate, self.systolic_bp, self.diastolic_bp, self.spo2, self.temperature, self.respiratory_rate]
        if all(v is None for v in vals):
            raise ValueError("Provide at least one vital sign.")
        if self.systolic_bp is not None and self.diastolic_bp is not None and self.systolic_bp <= self.diastolic_bp:
            raise ValueError("Systolic BP must be higher than diastolic BP.")
        return self


class PatientIn(BaseModel):
    patient_id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    display_name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=0, le=120)

    @field_validator("patient_id", "display_name")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class AdminLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class SettingsIn(BaseModel):
    interval_seconds: Optional[float] = Field(None, ge=0.5, le=60)
    medium_threshold: Optional[float] = Field(None, gt=0, lt=1)
    high_threshold: Optional[float] = Field(None, gt=0, lt=1)
