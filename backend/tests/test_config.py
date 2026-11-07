import os

import pytest

from app.admin_auth import configuration_error
from app.config import Config, _load_dotenv


def test_load_dotenv_reads_values_without_overriding_environment(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        'ICU_ADMIN_USERNAME="local-admin"\n'
        "ICU_ADMIN_PASSWORD=local-password # local development\n"
        "ICU_ADMIN_SECRET=local-secret\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("ICU_ADMIN_USERNAME", "process-admin")
    monkeypatch.delenv("ICU_ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("ICU_ADMIN_SECRET", raising=False)

    _load_dotenv(env_file)

    assert os.environ["ICU_ADMIN_USERNAME"] == "process-admin"
    assert os.environ["ICU_ADMIN_PASSWORD"] == "local-password"
    assert os.environ["ICU_ADMIN_SECRET"] == "local-secret"


def test_load_dotenv_reports_malformed_entry(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("invalid entry\n", encoding="utf-8")

    with pytest.raises(ValueError, match="line 1"):
        _load_dotenv(env_file)


def test_valid_dotenv_credentials_replace_invalid_process_credentials(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "ICU_ADMIN_USERNAME=file-admin\n"
        "ICU_ADMIN_PASSWORD=file-password-is-long\n"
        "ICU_ADMIN_SECRET=file-secret-that-is-at-least-thirty-two-characters\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("ICU_ADMIN_USERNAME", "stale-admin")
    monkeypatch.setenv("ICU_ADMIN_PASSWORD", "short")
    monkeypatch.setenv("ICU_ADMIN_SECRET", "stale-secret-that-is-long-enough")

    _load_dotenv(env_file)

    assert os.environ["ICU_ADMIN_USERNAME"] == "file-admin"
    assert os.environ["ICU_ADMIN_PASSWORD"] == "file-password-is-long"
    assert os.environ["ICU_ADMIN_SECRET"] == "file-secret-that-is-at-least-thirty-two-characters"


@pytest.mark.parametrize(
    ("username", "password", "secret", "error"),
    [
        ("", "long-enough-password", "a" * 32, "ICU_ADMIN_USERNAME"),
        ("admin", "short", "a" * 32, "ICU_ADMIN_PASSWORD"),
        ("admin", "long-enough-password", "short", "ICU_ADMIN_SECRET"),
    ],
)
def test_admin_configuration_reports_missing_or_weak_values(username, password, secret, error):
    config = Config(admin_username=username, admin_password=password, admin_secret=secret)

    assert error in configuration_error(config)
