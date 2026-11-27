"""Everything that changes between machines comes from environment variables, with local defaults."""
import os
from dataclasses import dataclass
from pathlib import Path

from ml import config


@dataclass(frozen=True)
class Settings:
    # local Postgres over its Unix socket; in Docker: postgresql://rdc:rdc@db:5432/rdc
    database_url: str = os.environ.get("DATABASE_URL", "postgresql:///rdc")
    models_dir: Path = Path(os.environ.get("MODELS_DIR", config.MODELS))
    max_upload_mb: float = float(os.environ.get("MAX_UPLOAD_MB", "10"))
    # analyses that never became a report are deleted after this many hours
    keep_unsaved_hours: int = int(os.environ.get("KEEP_UNSAVED_HOURS", "24"))
    # how long startup waits for Postgres before giving up (health checks keep retrying after)
    db_wait_seconds: float = float(os.environ.get("DB_WAIT_SECONDS", "20"))
    # photos: S3-compatible object storage (MinIO). S3_ENDPOINT is where the API reaches it; S3_PUBLIC_URL is
    # where browsers do (signed uploads and image links), e.g. http://minio:9000 and https://files.example.com
    s3_endpoint: str = os.environ.get("S3_ENDPOINT", "http://127.0.0.1:9000")
    s3_public_url: str = os.environ.get("S3_PUBLIC_URL", "")  # empty: same as S3_ENDPOINT
    s3_access_key: str = os.environ.get("S3_ACCESS_KEY", "minioadmin")
    s3_secret_key: str = os.environ.get("S3_SECRET_KEY", "minioadmin")
    s3_bucket: str = os.environ.get("S3_BUCKET", "road-damage")
    s3_region: str = os.environ.get("S3_REGION", "us-east-1")
