"""Object storage: signing (no server needed) and moving old frames out of Postgres."""
import base64
import json
import os
import re
import uuid

import pytest

from app import db, storage
from app.settings import Settings
from app.storage import MemoryStore, MinioStore
from main import create_app

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql:///rdc_test")


def store() -> MinioStore:
    # the API talks to MinIO inside Docker; browsers get links to the public address
    return MinioStore("http://minio:9000", "https://files.example.com", "key", "secret", "road-damage", "us-east-1")


def test_upload_form_is_for_one_key_type_and_size():
    key = storage.new_upload_key("image/png")
    assert storage.INCOMING.match(key) and key.endswith(".png")
    u = store().sign_upload(key, "image/png", 10 * 1024 * 1024)
    assert u.url == "https://files.example.com/road-damage"  # the browser posts to the public address
    assert u.fields["key"] == key and u.fields["Content-Type"] == "image/png"
    assert u.fields["x-amz-algorithm"] == "AWS4-HMAC-SHA256" and u.fields["x-amz-signature"]
    policy = json.loads(base64.b64decode(u.fields["policy"]))
    conditions = [c for c in policy["conditions"] if isinstance(c, list)]
    assert ["eq", "$key", key] in conditions and ["eq", "$Content-Type", "image/png"] in conditions
    assert ["content-length-range", 1, 10 * 1024 * 1024] in conditions


def test_image_links_are_signed_for_the_browser_and_stable_within_a_day():
    s = store()
    link = s.url("frames/abc.jpg")
    assert link.startswith("https://files.example.com/road-damage/frames/abc.jpg?") and "X-Amz-Signature=" in link
    assert s.url("frames/abc.jpg") == link  # same link all day, so browsers cache the image


def test_only_incoming_keys_can_be_checked():
    files = MemoryStore()
    for key in ("frames/x.jpg", "incoming/../frames/x.jpg", "incoming/" + "0" * 32 + ".gif"):
        files.put(key, b"x", "image/jpeg")
        with pytest.raises(storage.UploadMissing):
            files.read_upload(key, 100)


def _db_up():
    try:
        pool = db.open_pool(TEST_DB)
        ok = db.is_up(pool)
        pool.close()
        return ok
    except Exception:
        return False


@pytest.mark.skipif(not _db_up(), reason="needs Postgres (database rdc_test)")
def test_old_frames_move_from_postgres_to_storage():
    files = MemoryStore()
    app = create_app(Settings(database_url=TEST_DB), files=files)
    from fastapi.testclient import TestClient
    with TestClient(app):
        pool = app.state.pool
        aid = uuid.uuid4()
        with pool.connection() as conn:  # a database from before object storage
            conn.execute("TRUNCATE analyses CASCADE")
            conn.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS frame_jpeg bytea")
            conn.execute("""INSERT INTO analyses (id, filename, source, original_w, original_h, frame_jpeg, priority, timings_ms)
                            VALUES (%s, 'old.jpg', 'upload', 600, 600, %s, 1.0, '{}')""", (aid, b"old frame"))
        assert db.move_frames_to_storage(pool, files) == 1
        assert files.get(f"frames/{aid}.jpg") == b"old frame"
        with pool.connection() as conn:
            assert conn.execute("SELECT frame_key FROM analyses WHERE id = %s", (aid,)).fetchone()["frame_key"] == f"frames/{aid}.jpg"
            cols = {r["column_name"] for r in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'analyses'").fetchall()}
        assert "frame_jpeg" not in cols
        assert db.move_frames_to_storage(pool, files) == 0  # nothing left to do
        assert re.fullmatch(r"frames/[0-9a-f-]{36}\.jpg", next(iter(files.objects)))
