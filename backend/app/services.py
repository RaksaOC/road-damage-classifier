"""Services: what the app does. No HTTP and no SQL here; they use the models, domain and repositories."""
from uuid import UUID

from ml import photo
from ml.predict import ModelStore

from . import domain
from .domain import Analysis, Box, Correction, Metrics, ModelInfo, Report, ReportCreate, ReportPage, ReportSummary
from .repositories import AnalysisRepository, NewModelRun, NotFound, ReportRepository, ReportRow, frame_url

DESCRIPTIONS = {  # what each frozen model is, in one line (settings come from metrics.json)
    "softmax": "Linear baseline: logistic regression, C = 10",
    "svm": "RBF kernel, C = 10, gamma = scale",
    "mlp": "Neural network: 2 hidden layers of 256 and 128 units",
}


class ModelsUnavailable(Exception):
    pass


class TooLarge(Exception):
    pass


class ModelCatalog:
    def __init__(self, store: ModelStore | None):
        self.store = store

    def list(self) -> list[ModelInfo]:
        if self.store is None:
            raise ModelsUnavailable
        out = []
        for name, card in self.store.metrics["models"].items():
            pick = lambda s: Metrics(**{k: s[k] for k in ("macro_f1", "pothole_recall", "clean_road_flagged")}) if s else None
            out.append(ModelInfo(id=name, title=card["title"], description=DESCRIPTIONS.get(name, ""),
                                 status=card["status"], validation=pick(card["validation"]), test=pick(card["test"])))
        return out


class AnalysisService:
    def __init__(self, store: ModelStore | None, analyses: AnalysisRepository, max_upload_mb: float, keep_unsaved_hours: int):
        self.store, self.analyses = store, analyses
        self.max_bytes = int(max_upload_mb * 1024 * 1024)
        self.keep_unsaved_hours = keep_unsaved_hours

    def analyze(self, data: bytes, filename: str, source: str) -> Analysis:
        """Photo bytes -> every frozen model -> stored analysis. Raises PhotoError for unusable uploads."""
        if self.store is None:
            raise ModelsUnavailable
        if len(data) > self.max_bytes:
            raise TooLarge(f"The photo is {len(data) / 1e6:.1f} MB; the limit is {self.max_bytes / 1e6:.0f} MB.")
        img = photo.load(data)
        pred = self.store.predict(img)

        runs = []
        for name, m in pred.models.items():
            runs.append(NewModelRun(model=name, sha256=self.store.metrics["models"][name]["sha256"], labels=m.labels,
                                    confidence=m.confidence, probs=m.probs, priority=domain.priority_score(m.labels),
                                    predict_ms=m.ms))
        average = round(sum(r.priority for r in runs) / len(runs), 1)

        self.analyses.delete_unsaved(self.keep_unsaved_hours)
        aid = self.analyses.insert(filename=filename[:200] or "photo", source=source[:60], original_size=pred.original_size,
                                   frame_jpeg=photo.jpeg(pred.frame), priority=average, timings_ms=pred.timings_ms,
                                   runs=runs)
        return self.analyses.get(aid)

    def get(self, analysis_id: UUID) -> Analysis:
        a = self.analyses.get(analysis_id)
        if a is None:
            raise NotFound
        return a

    def correct(self, analysis_id: UUID, boxes: list[Box]) -> Correction:
        """Stores the user's boxes and the square labels they give (same rule as the training labels)."""
        self.analyses.save_correction(analysis_id, boxes, domain.labels_from_boxes(boxes))
        return self.analyses.correction(analysis_id)

    def frame(self, analysis_id: UUID) -> bytes:
        f = self.analyses.frame(analysis_id)
        if f is None:
            raise NotFound
        return f


class ReportService:
    def __init__(self, reports: ReportRepository, analyses: AnalysisRepository):
        self.reports, self.analyses = reports, analyses

    @staticmethod
    def _summary(r: ReportRow) -> ReportSummary:
        return ReportSummary(id=r.id, number=r.number, created_at=r.created_at, location=r.location, lat=r.lat, lng=r.lng,
                             priority=r.priority, image_url=frame_url(r.analysis_id), preview_model=domain.PREVIEW_MODEL,
                             preview_labels=[r.preview_labels[i:i + domain.COLS] for i in range(0, len(r.preview_labels), domain.COLS)],
                             main_issue=domain.main_issue(r.preview_labels), corrected=r.corrected)

    def create(self, body: ReportCreate) -> Report:
        rid = self.reports.create(body.analysis_id, body.location.strip(), body.lat, body.lng)
        return self.get(rid)

    def list(self, q: str, sort: str, limit: int, offset: int) -> ReportPage:
        rows, total = self.reports.list(q.strip(), sort, limit, offset)
        nxt = offset + len(rows)
        return ReportPage(items=[self._summary(r) for r in rows], total=total, next_offset=nxt if nxt < total else None)

    def get(self, report_id: UUID) -> Report:
        r = self.reports.get(report_id)
        if r is None:
            raise NotFound
        return Report(**self._summary(r).model_dump(), analysis=self.analyses.get(r.analysis_id))
