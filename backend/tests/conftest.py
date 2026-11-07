import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.main import create_app


@pytest.fixture()
def client(tmp_path):
    cfg = Config(db_path=str(tmp_path / "t.db"), autostart=False, n_patients=12, initial_history=6,
                 admin_username="test-admin", admin_password="test-password", admin_secret="test-secret-at-least-32-characters")
    with TestClient(create_app(cfg)) as c:
        c.post("/api/admin/login", json={"username": "test-admin", "password": "test-password"})
        yield c
