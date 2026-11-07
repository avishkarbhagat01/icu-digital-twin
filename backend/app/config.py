"""Runtime configuration. Everything is read from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    loaded: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, separator, value = line.partition("=")
        name = name.strip()
        if not separator or not name:
            raise ValueError(f"Invalid environment entry in {path.name} on line {line_number}.")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        loaded[name] = value
        os.environ.setdefault(name, value)

    admin_keys = ("ICU_ADMIN_USERNAME", "ICU_ADMIN_PASSWORD", "ICU_ADMIN_SECRET")
    file_admin = [loaded.get(key, "") for key in admin_keys]
    env_admin = [os.environ.get(key, "") for key in admin_keys]
    file_admin_valid = bool(file_admin[0].strip()) and len(file_admin[1]) >= 12 and len(file_admin[2]) >= 32
    env_admin_valid = bool(env_admin[0].strip()) and len(env_admin[1]) >= 12 and len(env_admin[2]) >= 32
    if file_admin_valid and not env_admin_valid:
        for key, value in zip(admin_keys, file_admin):
            os.environ[key] = value


_load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Config:
    db_path: str = field(default_factory=lambda: os.environ.get("ICU_DB_PATH", str(BASE_DIR / "data" / "icu_twin.db")))
    model_dir: str = field(default_factory=lambda: os.environ.get("ICU_MODEL_DIR", str(BASE_DIR / "models")))
    n_patients: int = field(default_factory=lambda: int(os.environ.get("ICU_N_PATIENTS", "12")))
    seed: int = field(default_factory=lambda: int(os.environ.get("ICU_SIM_SEED", "7")))
    autostart: bool = field(default_factory=lambda: _env_bool("ICU_SIM_AUTOSTART", True))
    admin_username: str = field(default_factory=lambda: os.environ.get("ICU_ADMIN_USERNAME", ""))
    admin_password: str = field(default_factory=lambda: os.environ.get("ICU_ADMIN_PASSWORD", ""))
    admin_secret: str = field(default_factory=lambda: os.environ.get("ICU_ADMIN_SECRET", ""))
    admin_cookie_secure: bool = field(default_factory=lambda: _env_bool("ICU_ADMIN_COOKIE_SECURE", False))
    initial_history: int = field(default_factory=lambda: int(os.environ.get("ICU_INITIAL_HISTORY", "15")))
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.environ.get("ICU_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if o.strip()
        ]
    )
