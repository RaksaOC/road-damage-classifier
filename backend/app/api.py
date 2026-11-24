"""HTTP layer: routes, status codes and error messages. All work happens in services.py.

Reports are permanent records: there is no route to delete one.

Routes are plain `def`, so FastAPI runs them in a thread pool and model inference doesn't block the server.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status

from ml.photo import PhotoError

from . import db
from .domain import Analysis, Correction, CorrectionIn, ModelInfo, Report, ReportCreate, ReportPage, Sort
from .repositories import AlreadySaved, NotFound
from .services import AnalysisService, ModelCatalog, ModelsUnavailable, ReportService, TooLarge

router = APIRouter(prefix="/api")


# dependencies: the services are built once at startup (main.py) and kept on app.state
def analyses(request: Request) -> AnalysisService:
    return request.app.state.analyses


def reports(request: Request) -> ReportService:
    return request.app.state.reports


def catalog(request: Request) -> ModelCatalog:
    return request.app.state.catalog


NO_MODELS = HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                          "The models aren't loaded on the server. Run notebook 13 to create backend/models/.")


@router.get("/health")
def health(request: Request) -> dict:
    """ok is true only when the API can do its job: models loaded and Postgres reachable (the Docker health check uses it)."""
    s = request.app.state
    database = db.is_up(s.pool)
    if database and not s.schema_ready:  # Postgres came up after startup
        try:
            db.create_schema(s.pool)
            s.schema_ready = True
        except Exception:
            database = False
    loaded = s.store is not None
    return {"ok": loaded and database, "model_loaded": loaded, "models": s.store.names if s.store else [],
            "database": database, "error": s.load_error}


@router.get("/models")
def list_models(svc: Annotated[ModelCatalog, Depends(catalog)]) -> list[ModelInfo]:
    try:
        return svc.list()
    except ModelsUnavailable:
        raise NO_MODELS


@router.post("/analyze", status_code=status.HTTP_201_CREATED)
def analyze(svc: Annotated[AnalysisService, Depends(analyses)],
            photo: Annotated[UploadFile, File(description="Road photo, JPG/PNG/WebP")],
            source: Annotated[str, Form(max_length=60)] = "upload") -> Analysis:
    """Runs every frozen model on the photo and stores the result (not yet a report)."""
    try:
        return svc.analyze(photo.file.read(), photo.filename or "photo", source)
    except ModelsUnavailable:
        raise NO_MODELS
    except TooLarge as e:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(e))
    except PhotoError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))


@router.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: UUID, svc: Annotated[AnalysisService, Depends(analyses)]) -> Analysis:
    try:
        return svc.get(analysis_id)
    except NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such analysis (unsaved ones are deleted after a day).")


@router.put("/analyses/{analysis_id}/correction")
def put_correction(analysis_id: UUID, body: CorrectionIn, svc: Annotated[AnalysisService, Depends(analyses)]) -> Correction:
    """The user's own boxes for this photo: training data for a later retrain. Replaces any earlier correction."""
    try:
        return svc.correct(analysis_id, body.boxes)
    except NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That check no longer exists.")


@router.get("/analyses/{analysis_id}/frame.jpg", response_class=Response)
def get_frame(analysis_id: UUID, svc: Annotated[AnalysisService, Depends(analyses)]) -> Response:
    try:
        jpg = svc.frame(analysis_id)
    except NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such analysis.")
    # an analysis never changes, so browsers may keep the image for good
    return Response(jpg, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(body: ReportCreate, svc: Annotated[ReportService, Depends(reports)]) -> Report:
    try:
        return svc.create(body)
    except NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That analysis no longer exists. Check the photo again.")
    except AlreadySaved:
        raise HTTPException(status.HTTP_409_CONFLICT, "This check is already saved as a report.")


@router.get("/reports")
def list_reports(svc: Annotated[ReportService, Depends(reports)],
                 q: Annotated[str, Query(max_length=200)] = "", sort: Sort = "newest",
                 limit: Annotated[int, Query(ge=1, le=50)] = 12, offset: Annotated[int, Query(ge=0)] = 0) -> ReportPage:
    return svc.list(q, sort, limit, offset)


@router.get("/reports/{report_id}")
def get_report(report_id: UUID, svc: Annotated[ReportService, Depends(reports)]) -> Report:
    try:
        return svc.get(report_id)
    except NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such report.")
