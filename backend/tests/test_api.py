"""The whole API flow on a throwaway database: analyse a real test photo, save it, list, correct."""
import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import db
from app.domain import priority_score
from app.settings import Settings
from main import create_app
from ml import config

TEST_DB = "postgresql:///rdc_test"


def _db_up():
    try:
        pool = db.open_pool(TEST_DB)
        ok = db.is_up(pool)
        pool.close()
        return ok
    except Exception:
        return False


needs_all = pytest.mark.skipif(not _db_up() or not (config.MODELS / "metrics.json").exists(),
                               reason="needs Postgres (database rdc_test) and backend/models/")


@pytest.fixture()
def client():
    app = create_app(Settings(database_url=TEST_DB))
    with TestClient(app) as c:
        with app.state.pool.connection() as conn:
            conn.execute("TRUNCATE analyses CASCADE")
        yield c


def road_photo() -> bytes:
    images = pd.read_csv(config.PROCESSED / "04_clean" / "images_clean.csv")
    return (config.RAW / images.path.iloc[0]).read_bytes()


def test_priority_matches_frontend_formula():
    assert priority_score(["none"] * 40) == 0
    assert priority_score(["D40"] + ["none"] * 39) == 5.9  # 10 x (0.55 + 1.6 / 40) = 5.9
    assert priority_score(["D40"] * 40) == 10


@needs_all
def test_analyze_save_list_delete(client):
    r = client.get("/api/health").json()
    assert r["model_loaded"] and r["database"]
    assert {m["id"] for m in client.get("/api/models").json()} == {"softmax", "svm", "mlp"}

    a = client.post("/api/analyze", files={"photo": ("road.jpg", road_photo(), "image/jpeg")}).json()
    assert set(a["results"]) == {"softmax", "svm", "mlp"}
    mlp = a["results"]["mlp"]
    assert len(mlp["labels"]) == 5 and all(len(row) == 8 for row in mlp["labels"])
    assert sum(mlp["counts"].values()) == 40
    frame = client.get(a["image_url"])
    assert frame.status_code == 200 and Image.open(io.BytesIO(frame.content)).size == (640, 400)

    rep = client.post("/api/reports", json={"analysis_id": a["id"], "location": "Test street", "lat": 11.55, "lng": 104.92})
    assert rep.status_code == 201
    rep = rep.json()
    assert rep["number"] >= 1 and rep["analysis"]["results"]["mlp"]["labels"] == mlp["labels"]
    assert (rep["lat"], rep["lng"]) == (11.55, 104.92)
    assert client.post("/api/reports", json={"analysis_id": a["id"], "location": "again", "lat": 0, "lng": 0}).status_code == 409

    page = client.get("/api/reports", params={"q": "test str"}).json()
    assert page["total"] == 1 and page["items"][0]["preview_labels"] == mlp["labels"]
    assert client.get("/api/reports", params={"q": "nowhere"}).json()["total"] == 0

    assert client.delete(f"/api/reports/{rep['id']}").status_code == 405  # records are permanent
    assert client.get(f"/api/reports/{rep['id']}").status_code == 200


@needs_all
def test_bad_uploads_are_explained(client):
    r = client.post("/api/analyze", files={"photo": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 422 and "image" in r.json()["detail"]
    r = client.post("/api/reports", json={"analysis_id": "00000000-0000-0000-0000-000000000000", "location": "x", "lat": 0, "lng": 0})
    assert r.status_code == 404


SQUARES = config.PROCESSED / "06_squares" / "boxes_640x400.csv"


@pytest.mark.skipif(not SQUARES.exists(), reason="needs data/processed")
def test_correction_rule_reproduces_training_labels():
    """labels_from_boxes on the dataset's own boxes == the labels the models were trained on (notebook 06)."""
    from app.domain import Box, labels_from_boxes
    boxes = pd.read_csv(SQUARES)
    patches = pd.read_csv(config.PROCESSED / "07_split" / "patches_split.csv")
    for iid in boxes.image_id.drop_duplicates().iloc[:300]:
        b = [Box(cls=r.cls, xmin=r.xmin, ymin=r.ymin, xmax=r.xmax, ymax=r.ymax)
             for r in boxes[boxes.image_id == iid].itertuples() if r.xmax - r.xmin >= 2 and r.ymax - r.ymin >= 2]
        want = patches[patches.image_id == iid].sort_values(["row", "col"]).label.tolist()
        assert labels_from_boxes(b) == want, iid


@needs_all
def test_correction_is_stored_with_the_report(client):
    a = client.post("/api/analyze", files={"photo": ("road.jpg", road_photo(), "image/jpeg")}).json()
    box = {"cls": "D40", "xmin": 80, "ymin": 160, "xmax": 240, "ymax": 240}  # covers squares (2,1) and (2,2) fully
    c = client.put(f"/api/analyses/{a['id']}/correction", json={"boxes": [box]})
    assert c.status_code == 200
    c = c.json()
    assert c["labels"][2][1] == c["labels"][2][2] == "D40" and c["counts"]["D40"] == 2
    assert client.put(f"/api/analyses/{a['id']}/correction", json={"boxes": [{**box, "xmax": 70}]}).status_code == 422

    rep = client.post("/api/reports", json={"analysis_id": a["id"], "location": "Corrected street", "lat": 11.55, "lng": 104.92}).json()
    assert rep["corrected"] and rep["analysis"]["correction"]["boxes"][0]["cls"] == "D40"
    assert client.get("/api/reports").json()["items"][0]["corrected"]
