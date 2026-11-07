from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import Request

from .config import Config
from .errors import ApiError

COOKIE_NAME = "icu_admin_session"
SESSION_SECONDS = 8 * 60 * 60


def configuration_error(config: Config) -> str | None:
    if not config.admin_username.strip():
        return "Set ICU_ADMIN_USERNAME in backend/.env."
    if len(config.admin_password) < 12:
        return "Set ICU_ADMIN_PASSWORD to a password with at least 12 characters in backend/.env."
    if len(config.admin_secret) < 32:
        return "Set ICU_ADMIN_SECRET to a random value of at least 32 characters in backend/.env."
    return None


def is_configured(config: Config) -> bool:
    return configuration_error(config) is None


def create_session(config: Config) -> str:
    error = configuration_error(config)
    if error:
        raise ApiError(503, "admin_auth_not_configured", error)
    expires = int(time.time()) + SESSION_SECONDS
    payload = f"{config.admin_username}:{expires}"
    signature = hmac.new(config.admin_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def require_admin(request: Request) -> str:
    config: Config = request.app.state.config
    error = configuration_error(config)
    if error:
        raise ApiError(503, "admin_auth_not_configured", error)
    token = request.cookies.get(COOKIE_NAME, "")
    try:
        username, expires_text, signature = token.rsplit(":", 2)
        expires = int(expires_text)
    except (ValueError, AttributeError):
        raise ApiError(401, "admin_auth_required", "Sign in to manage patient records.")
    payload = f"{username}:{expires}"
    expected = hmac.new(config.admin_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if (expires <= int(time.time()) or username != config.admin_username
            or not hmac.compare_digest(signature, expected)):
        raise ApiError(401, "admin_auth_required", "Sign in to manage patient records.")
    return username
