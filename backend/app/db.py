"""Postgres connection pool and schema."""
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

SCHEMA = Path(__file__).with_name("schema.sql")


def open_pool(url: str) -> ConnectionPool:
    """Opens without waiting, so the API still starts (and /api/health can say so) when Postgres is down."""
    pool = ConnectionPool(url, min_size=1, max_size=8, kwargs={"row_factory": dict_row}, open=False, timeout=5)
    pool.open(wait=False)
    return pool


def create_schema(pool: ConnectionPool) -> None:
    with pool.connection() as conn:
        conn.execute(SCHEMA.read_text())


def is_up(pool: ConnectionPool) -> bool:
    try:
        with pool.connection(timeout=2) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


def move_frames_to_storage(pool: ConnectionPool, store) -> int:
    """Databases from before object storage kept each frame in analyses.frame_jpeg. Copies those into the
    store, then drops the column. Safe to run again: it does nothing once the column is gone."""
    with pool.connection() as conn:
        has_column = conn.execute("""SELECT 1 FROM information_schema.columns
                                     WHERE table_name = 'analyses' AND column_name = 'frame_jpeg'""").fetchone()
        if not has_column:
            return 0
        conn.execute("ALTER TABLE analyses ALTER COLUMN frame_jpeg DROP NOT NULL")
        rows = conn.execute("SELECT id, frame_jpeg FROM analyses WHERE frame_key IS NULL AND frame_jpeg IS NOT NULL").fetchall()
    moved = 0
    for r in rows:
        key = f"frames/{r['id']}.jpg"
        store.put(key, bytes(r["frame_jpeg"]), "image/jpeg")
        with pool.connection() as conn:
            conn.execute("UPDATE analyses SET frame_key = %s, frame_jpeg = NULL WHERE id = %s", (key, r["id"]))
        moved += 1
    with pool.connection() as conn:
        left = conn.execute("SELECT count(*) AS n FROM analyses WHERE frame_jpeg IS NOT NULL").fetchone()["n"]
        if left == 0:
            conn.execute("ALTER TABLE analyses DROP COLUMN frame_jpeg")
    return moved
