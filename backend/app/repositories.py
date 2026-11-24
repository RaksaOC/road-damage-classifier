"""Repositories: the only code that writes SQL. They take and return domain objects."""
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from psycopg import errors
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from . import domain
from .domain import COLS, Analysis, Box, Correction, ModelResult, Size


def frame_url(analysis_id: UUID) -> str:
    """The API's stable address for a frame; it redirects to a signed link in object storage."""
    return f"/api/analyses/{analysis_id}/frame.jpg"


Link = Callable[[str], str]  # object key -> URL a browser can load (storage.ObjectStore.url)


def _grid(values: list) -> list[list]:
    return [values[r * COLS:(r + 1) * COLS] for r in range(len(values) // COLS)]


class NotFound(Exception):
    pass


class AlreadySaved(Exception):
    pass


@dataclass(frozen=True)
class NewModelRun:
    model: str
    sha256: str
    labels: list[str]  # 40, in square order
    confidence: list[float]
    probs: list[list[float]]
    priority: float
    predict_ms: float


class AnalysisRepository:
    def __init__(self, pool: ConnectionPool, link: Link):
        self.pool, self.link = pool, link

    def image_url(self, analysis_id: UUID, frame_key: str | None) -> str:
        return self.link(frame_key) if frame_key else frame_url(analysis_id)

    def insert(self, *, analysis_id: UUID, filename: str, source: str, original_size: tuple[int, int], frame_key: str,
               original_key: str, priority: float, timings_ms: dict, runs: list[NewModelRun]) -> UUID:
        with self.pool.connection() as conn, conn.transaction():
            row = conn.execute(
                """INSERT INTO analyses (id, filename, source, original_w, original_h, frame_key, original_key, priority, timings_ms)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (analysis_id, filename, source, *original_size, frame_key, original_key, priority, Jsonb(timings_ms))).fetchone()
            aid = row["id"]
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO model_runs (analysis_id, model, model_sha256, priority, predict_ms) VALUES (%s, %s, %s, %s, %s)",
                    [(aid, r.model, r.sha256, r.priority, r.predict_ms) for r in runs])
                cur.executemany(
                    """INSERT INTO predictions (analysis_id, model, sq_row, sq_col, label, confidence, probs)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    [(aid, r.model, i // COLS, i % COLS, r.labels[i], r.confidence[i], r.probs[i])
                     for r in runs for i in range(len(r.labels))])
        return aid

    def get(self, analysis_id: UUID) -> Analysis | None:
        with self.pool.connection() as conn:
            a = conn.execute(
                """SELECT id, created_at, filename, source, original_w, original_h, priority, timings_ms, frame_key
                   FROM analyses WHERE id = %s""", (analysis_id,)).fetchone()
            if not a:
                return None
            runs = conn.execute("SELECT model, priority, predict_ms FROM model_runs WHERE analysis_id = %s",
                                (analysis_id,)).fetchall()
            preds = conn.execute(
                """SELECT model, label, confidence, probs FROM predictions
                   WHERE analysis_id = %s ORDER BY model, sq_row, sq_col""", (analysis_id,)).fetchall()
        results = {}
        for run in runs:
            p = [x for x in preds if x["model"] == run["model"]]
            labels = [x["label"] for x in p]
            results[run["model"]] = ModelResult(
                model=run["model"], labels=_grid(labels), confidence=_grid([round(x["confidence"], 4) for x in p]),
                probs=_grid([[round(v, 4) for v in x["probs"]] for x in p]), counts=domain.counts(labels),
                priority=round(run["priority"], 1), predict_ms=run["predict_ms"])
        return Analysis(id=a["id"], created_at=a["created_at"], filename=a["filename"], source=a["source"],
                        original_size=Size(w=a["original_w"], h=a["original_h"]), image_url=self.image_url(a["id"], a["frame_key"]),
                        results=results, priority=round(a["priority"], 1), timings_ms=a["timings_ms"],
                        correction=self.correction(analysis_id))

    def correction(self, analysis_id: UUID) -> Correction | None:
        with self.pool.connection() as conn:
            c = conn.execute("SELECT boxes, labels, updated_at FROM corrections WHERE analysis_id = %s", (analysis_id,)).fetchone()
        if not c:
            return None
        return Correction(boxes=[Box(**b) for b in c["boxes"]], labels=_grid(c["labels"]), counts=domain.counts(c["labels"]),
                          updated_at=c["updated_at"])

    def save_correction(self, analysis_id: UUID, boxes: list[Box], labels: list[str]) -> None:
        try:
            with self.pool.connection() as conn:
                conn.execute(
                    """INSERT INTO corrections (analysis_id, boxes, labels) VALUES (%s, %s, %s)
                       ON CONFLICT (analysis_id) DO UPDATE SET boxes = EXCLUDED.boxes, labels = EXCLUDED.labels, updated_at = now()""",
                    (analysis_id, Jsonb([b.model_dump() for b in boxes]), labels))
        except errors.ForeignKeyViolation as e:
            raise NotFound from e

    def frame_key(self, analysis_id: UUID) -> str | None:
        """None when there's no such analysis (or, briefly, an old frame not yet moved to storage)."""
        with self.pool.connection() as conn:
            row = conn.execute("SELECT frame_key FROM analyses WHERE id = %s", (analysis_id,)).fetchone()
        return row["frame_key"] if row else None

    def delete_unsaved(self, older_than_hours: int) -> list[str]:
        """Deletes analyses nobody saved as a report or corrected, older than the given age.
        Returns their object keys, so the caller can delete the photos too."""
        with self.pool.connection() as conn:
            rows = conn.execute(
                """DELETE FROM analyses a WHERE a.created_at < now() - make_interval(hours => %s)
                   AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.analysis_id = a.id)
                   AND NOT EXISTS (SELECT 1 FROM corrections c WHERE c.analysis_id = a.id)
                   RETURNING a.frame_key, a.original_key""", (older_than_hours,)).fetchall()
        return [k for r in rows for k in (r["frame_key"], r["original_key"]) if k]


ORDER = {  # whitelisted: user input never reaches the SQL text
    "newest": "r.created_at DESC, r.number DESC",
    "oldest": "r.created_at ASC, r.number ASC",
    "priority": "a.priority DESC, r.created_at DESC",
}


@dataclass(frozen=True)
class ReportRow:
    id: UUID
    number: int
    created_at: datetime
    location: str
    lat: float | None
    lng: float | None
    priority: float
    analysis_id: UUID
    frame_key: str | None
    preview_labels: list[str]
    corrected: bool


class ReportRepository:
    def __init__(self, pool: ConnectionPool):
        self.pool = pool

    _SELECT = """
        SELECT r.id, r.number, r.created_at, r.location, r.lat, r.lng, a.priority, r.analysis_id, a.frame_key,
               (SELECT array_agg(p.label ORDER BY p.sq_row, p.sq_col) FROM predictions p
                 WHERE p.analysis_id = r.analysis_id AND p.model = %(preview)s) AS preview_labels,
               EXISTS (SELECT 1 FROM corrections c WHERE c.analysis_id = r.analysis_id) AS corrected
        FROM reports r JOIN analyses a ON a.id = r.analysis_id"""

    @staticmethod
    def _row(r: dict) -> ReportRow:
        return ReportRow(id=r["id"], number=r["number"], created_at=r["created_at"], location=r["location"],
                         lat=r["lat"], lng=r["lng"], priority=round(r["priority"], 1), analysis_id=r["analysis_id"],
                         frame_key=r["frame_key"],
                         preview_labels=r["preview_labels"] or [], corrected=r["corrected"])

    def create(self, analysis_id: UUID, location: str, lat: float, lng: float) -> UUID:
        try:
            with self.pool.connection() as conn:
                row = conn.execute("INSERT INTO reports (analysis_id, location, lat, lng) VALUES (%s, %s, %s, %s) RETURNING id",
                                   (analysis_id, location, lat, lng)).fetchone()
        except errors.UniqueViolation as e:
            raise AlreadySaved from e
        except errors.ForeignKeyViolation as e:
            raise NotFound from e
        return row["id"]

    def list(self, q: str, sort: str, limit: int, offset: int) -> tuple[list[ReportRow], int]:
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        params = {"preview": domain.PREVIEW_MODEL, "q": q, "like": like, "limit": limit, "offset": offset}
        where = "WHERE (%(q)s = '' OR r.location ILIKE %(like)s OR ('RD-' || lpad(r.number::text, 4, '0')) ILIKE %(like)s)"
        with self.pool.connection() as conn:
            total = conn.execute(f"SELECT count(*) AS n FROM reports r {where}", params).fetchone()["n"]
            rows = conn.execute(f"{self._SELECT} {where} ORDER BY {ORDER[sort]} LIMIT %(limit)s OFFSET %(offset)s",
                                params).fetchall()
        return [self._row(r) for r in rows], total

    def get(self, report_id: UUID) -> ReportRow | None:
        with self.pool.connection() as conn:
            r = conn.execute(f"{self._SELECT} WHERE r.id = %(id)s", {"preview": domain.PREVIEW_MODEL, "id": report_id}).fetchone()
        return self._row(r) if r else None
