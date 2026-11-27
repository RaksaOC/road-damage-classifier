"""Services: what the app does. No HTTP and no SQL here; they use the models, domain and repositories."""
import logging
from uuid import UUID, uuid4

from ml import photo
from ml.predict import ModelStore

from . import domain, storage
from .domain import Analysis, Box, Correction, Metrics, ModelInfo, Report, ReportCreate, ReportPage, ReportSummary
from .repositories import AnalysisRepository, NewModelRun, NotFound, ReportRepository, ReportRow
from .storage import ObjectStore, SignedUpload, UploadMissing

log = logging.getLogger("rdc")

DESCRIPTIONS = {  # what each frozen model is, in one line (settings come from metrics.json)
    "softmax": "Linear baseline: logistic regression, C = 10",
    "svm": "RBF kernel, C = 10, gamma = scale",
    "mlp": "Neural network: 2 hidden layers of 256 and 128 units",
}


class ModelsUnavailable(Exception):
    pass


class TooLarge(Exception):
    pass


class NotAnImage(Exception):
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
    def __init__(self, store: ModelStore | None, analyses: AnalysisRepository, files: ObjectStore, max_upload_mb: float,
                 keep_unsaved_hours: int):
        self.store, self.analyses, self.files = store, analyses, files
        self.max_bytes = int(max_upload_mb * 1024 * 1024)
        self.keep_unsaved_hours = keep_unsaved_hours

    def _too_large(self, size: int) -> TooLarge:
        return TooLarge(f"The photo is {size / 1e6:.1f} MB; the limit is {self.max_bytes / 1e6:.0f} MB.")

    def sign_upload(self, content_type: str, size: int) -> SignedUpload:
        """Step 1: a signed form that lets the browser send one photo straight to object storage."""
        if content_type not in storage.IMAGE_TYPES:
            raise NotAnImage("Please choose a JPG, PNG or WebP photo.")
        if size > self.max_bytes:
            raise self._too_large(size)
        return self.files.sign_upload(storage.new_upload_key(content_type), content_type, self.max_bytes)

    def analyze(self, upload_key: str, filename: str, source: str) -> Analysis:
        """Step 2: the uploaded photo -> every frozen model -> stored analysis. Raises UploadMissing when nothing
        was uploaded under that key, PhotoError for photos that can't be used."""
        if self.store is None:
            raise ModelsUnavailable
        data = self.files.read_upload(upload_key, self.max_bytes)
        img = photo.load(data)
        pred = self.store.predict(img)

        runs = []
        for name, m in pred.models.items():
            runs.append(NewModelRun(model=name, sha256=self.store.metrics["models"][name]["sha256"], labels=m.labels,
                                    confidence=m.confidence, probs=m.probs, priority=domain.priority_score(m.labels),
                                    predict_ms=m.ms))
        average = round(sum(r.priority for r in runs) / len(runs), 1)

        self._clean_up()
        aid = uuid4()
        frame, original = storage.frame_key(aid), storage.original_key(aid, upload_key)
        self.files.put(frame, photo.jpeg(pred.frame), "image/jpeg")
        self.files.keep_upload(upload_key, original)
        try:
            self.analyses.insert(analysis_id=aid, filename=filename[:200] or "photo", source=source[:60],
                                 original_size=pred.original_size, frame_key=frame, original_key=original,
                                 priority=average, timings_ms=pred.timings_ms, runs=runs)
        except Exception:
            self.files.delete([frame, original])
            raise
        return self.analyses.get(aid)

    def _clean_up(self) -> None:
        """Old unsaved analyses go, with their photos. A storage hiccup here must not fail the user's check."""
        keys = self.analyses.delete_unsaved(self.keep_unsaved_hours)
        try:
            self.files.delete(keys)
        except Exception as e:
            log.warning("couldn't delete %d old photo(s): %s", len(keys), e)

    def get(self, analysis_id: UUID) -> Analysis:
        a = self.analyses.get(analysis_id)
        if a is None:
            raise NotFound
        return a

    def correct(self, analysis_id: UUID, boxes: list[Box]) -> Correction:
        """Stores the user's boxes and the square labels they give (same rule as the training labels)."""
        self.analyses.save_correction(analysis_id, boxes, domain.labels_from_boxes(boxes))
        return self.analyses.correction(analysis_id)

    def frame_link(self, analysis_id: UUID) -> str:
        key = self.analyses.frame_key(analysis_id)
        if key is None:
            raise NotFound
        return self.files.url(key)


class ReportService:
    def __init__(self, reports: ReportRepository, analyses: AnalysisRepository):
        self.reports, self.analyses = reports, analyses

    def _summary(self, r: ReportRow) -> ReportSummary:
        return ReportSummary(id=r.id, number=r.number, created_at=r.created_at, location=r.location, lat=r.lat, lng=r.lng,
                             priority=r.priority, image_url=self.analyses.image_url(r.analysis_id, r.frame_key),
                             preview_model=domain.PREVIEW_MODEL,
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
