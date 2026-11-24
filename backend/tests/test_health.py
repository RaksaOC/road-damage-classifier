import os

from fastapi.testclient import TestClient

from app.settings import Settings
from app.storage import MemoryStore
from main import create_app

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql:///rdc_test")  # never the dev database: startup migrates it


def test_health():
    # "with" runs startup: models + database (photos: an in-memory store; tests/test_storage.py covers MinIO)
    with TestClient(create_app(Settings(database_url=TEST_DB), files=MemoryStore())) as c:
        r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True
