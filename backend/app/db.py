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
