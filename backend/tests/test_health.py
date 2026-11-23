from fastapi.testclient import TestClient

from main import create_app


def test_health():
    with TestClient(create_app()) as c:  # "with" runs startup: models + database
        r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True
