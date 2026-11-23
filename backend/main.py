"""Road Damage Classifier API.

run:  uv run uvicorn main:app --reload --port 8600
needs: backend/models/ (notebook 13) and Postgres (DATABASE_URL, default postgresql:///rdc)
"""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db
from app.api import router
from app.repositories import AnalysisRepository, ReportRepository
from app.services import AnalysisService, ModelCatalog, ReportService
from app.settings import Settings
from ml.predict import ModelStore

log = logging.getLogger("rdc")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        s = app.state
        s.store, s.load_error = None, None
        try:
            s.store = ModelStore(settings.models_dir)
            log.info("models loaded: %s", s.store.names)
        except Exception as e:  # the API still starts; /api/health and /api/analyze explain what's missing
            s.load_error = str(e)
            log.error("models not loaded: %s", e)

        s.pool = db.open_pool(settings.database_url)
        # Postgres may still be starting (e.g. in Docker): keep trying for a while, then let /api/health retry
        s.schema_ready = False
        deadline = time.monotonic() + settings.db_wait_seconds
        while True:
            try:
                db.create_schema(s.pool)
                s.schema_ready = True
                break
            except Exception as e:
                if time.monotonic() >= deadline:
                    log.error("database not ready: %s", e)
                    break
                time.sleep(1)

        analyses, reports = AnalysisRepository(s.pool), ReportRepository(s.pool)
        s.catalog = ModelCatalog(s.store)
        s.analyses = AnalysisService(s.store, analyses, settings.max_upload_mb, settings.keep_unsaved_hours)
        s.reports = ReportService(reports, analyses)
        yield
        s.pool.close()

    app = FastAPI(title="Road Damage Classifier API", lifespan=lifespan)
    app.include_router(router)
    return app


app = create_app()
