"""Photos live in S3-compatible object storage (MinIO), not in Postgres. Postgres keeps only their keys.

Keys in the bucket:
    incoming/<uuid>.<ext>   a browser upload that hasn't been checked yet (a lifecycle rule deletes these after a day)
    originals/<id>.<ext>    the photo as taken, for an analysis
    frames/<id>.jpg         the 640 x 400 frame the models saw

Uploads are signed POST policies: the browser sends the photo straight to MinIO, and MinIO itself
enforces the key, the image type and the size limit. Reads are signed GET links.

Two clients: one for the API's own reads and writes (the internal address, e.g. http://minio:9000) and
one only for signing links the browser uses (the public address). Signing needs no network call.
"""
import io
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol
from urllib.parse import urlsplit

import urllib3
from minio import Minio
from minio.commonconfig import ENABLED, CopySource, Filter
from minio.datatypes import PostPolicy
from minio.deleteobjects import DeleteObject
from minio.error import S3Error
from minio.lifecycleconfig import Expiration, LifecycleConfig, Rule

IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
INCOMING = re.compile(r"^incoming/[0-9a-f]{32}\.(jpg|png|webp)$")
IMMUTABLE = "public, max-age=31536000, immutable"  # an object under a key never changes


class StorageError(Exception):
    pass


class UploadMissing(Exception):
    """The upload key is malformed, or nothing was uploaded under it (or it expired)."""


@dataclass(frozen=True)
class SignedUpload:
    key: str
    url: str  # POST the form here
    fields: dict[str, str]  # form fields to send before the file (the file field is "file")
    expires_at: datetime
    max_bytes: int


def new_upload_key(content_type: str) -> str:
    return f"incoming/{uuid.uuid4().hex}.{IMAGE_TYPES[content_type]}"


def original_key(analysis_id: uuid.UUID, upload_key: str) -> str:
    return f"originals/{analysis_id}.{upload_key.rsplit('.', 1)[1]}"


def frame_key(analysis_id: uuid.UUID) -> str:
    return f"frames/{analysis_id}.jpg"


class ObjectStore(Protocol):
    def sign_upload(self, key: str, content_type: str, max_bytes: int) -> SignedUpload: ...
    def read_upload(self, key: str, max_bytes: int) -> bytes: ...
    def keep_upload(self, key: str, dest: str) -> None: ...
    def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, keys: list[str]) -> None: ...
    def url(self, key: str) -> str: ...
    def is_up(self) -> bool: ...


def _client(url: str, access_key: str, secret_key: str, region: str) -> Minio:
    u = urlsplit(url)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise ValueError(f"not an http(s) URL: {url!r}")
    # short timeouts and few retries: a health check must answer quickly when storage is down
    http = urllib3.PoolManager(timeout=urllib3.Timeout(connect=3, read=30), maxsize=8,
                               retries=urllib3.Retry(total=2, backoff_factor=0.2, status_forcelist=[500, 502, 503, 504]))
    # region given, so the client never asks the server for it (signing stays offline)
    return Minio(u.netloc, access_key=access_key, secret_key=secret_key, secure=u.scheme == "https", region=region,
                 http_client=http)


class MinioStore:
    UPLOAD_TTL = timedelta(minutes=10)
    LINK_TTL = timedelta(days=2)

    def __init__(self, endpoint: str, public_url: str, access_key: str, secret_key: str, bucket: str, region: str):
        self.bucket = bucket
        self.io = _client(endpoint, access_key, secret_key, region)
        self.signer = _client(public_url or endpoint, access_key, secret_key, region)

    def setup(self) -> None:
        """Creates the bucket and its clean-up rule if they're missing. Best effort: on the server an admin did
        this already and the app's key may not be allowed to."""
        if not self.io.bucket_exists(self.bucket):
            self.io.make_bucket(self.bucket)
        rule = Rule(ENABLED, rule_filter=Filter(prefix="incoming/"), rule_id="drop-unchecked-uploads",
                    expiration=Expiration(days=1))
        self.io.set_bucket_lifecycle(self.bucket, LifecycleConfig([rule]))

    def sign_upload(self, key: str, content_type: str, max_bytes: int) -> SignedUpload:
        expires = datetime.now(UTC) + self.UPLOAD_TTL
        policy = PostPolicy(self.bucket, expires)
        policy.add_equals_condition("key", key)
        policy.add_equals_condition("Content-Type", content_type)
        policy.add_content_length_range_condition(1, max_bytes)
        fields = self.signer.presigned_post_policy(policy)
        fields = {"key": key, "Content-Type": content_type, **fields}
        base = self.signer._base_url  # the public address the policy was signed for
        url = f"{'https' if base.is_https else 'http'}://{base.host}/{self.bucket}"
        return SignedUpload(key=key, url=url, fields=fields, expires_at=expires, max_bytes=max_bytes)

    def read_upload(self, key: str, max_bytes: int) -> bytes:
        if not INCOMING.match(key):
            raise UploadMissing
        try:
            if self.io.stat_object(self.bucket, key).size > max_bytes:  # the policy already stops this; belt and braces
                raise UploadMissing
            return self.get(key)
        except S3Error as e:
            if e.code in ("NoSuchKey", "NoSuchObject"):
                raise UploadMissing from e
            raise StorageError(str(e)) from e

    def keep_upload(self, key: str, dest: str) -> None:
        """Moves a checked upload out of incoming/ (where it would expire) to its permanent key."""
        self.io.copy_object(self.bucket, dest, CopySource(self.bucket, key), metadata={"Cache-Control": IMMUTABLE},
                            metadata_directive="REPLACE")
        self.io.remove_object(self.bucket, key)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.io.put_object(self.bucket, key, io.BytesIO(data), len(data), content_type=content_type,
                           metadata={"Cache-Control": IMMUTABLE})

    def get(self, key: str) -> bytes:
        r = self.io.get_object(self.bucket, key)
        try:
            return r.read()
        finally:
            r.close()
            r.release_conn()

    def delete(self, keys: list[str]) -> None:
        if keys:
            errors = list(self.io.remove_objects(self.bucket, [DeleteObject(k) for k in keys]))
            if errors:
                raise StorageError(f"{len(errors)} object(s) not deleted, first: {errors[0]}")

    def url(self, key: str) -> str:
        # signed as of midnight UTC, so the link stays the same all day and browsers can cache the image
        day = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        return self.signer.presigned_get_object(self.bucket, key, expires=self.LINK_TTL, request_date=day)

    def is_up(self) -> bool:
        try:
            return self.io.bucket_exists(self.bucket)
        except Exception:
            return False


class MemoryStore:
    """In-memory stand-in for tests. Uploads go to `uploads`, as if the browser had posted them."""

    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}

    def sign_upload(self, key: str, content_type: str, max_bytes: int) -> SignedUpload:
        return SignedUpload(key=key, url="memory://bucket", fields={"key": key, "Content-Type": content_type},
                            expires_at=datetime.now(UTC) + timedelta(minutes=10), max_bytes=max_bytes)

    def read_upload(self, key: str, max_bytes: int) -> bytes:
        if not INCOMING.match(key) or key not in self.objects or len(self.objects[key][0]) > max_bytes:
            raise UploadMissing
        return self.objects[key][0]

    def keep_upload(self, key: str, dest: str) -> None:
        self.objects[dest] = self.objects.pop(key)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    def get(self, key: str) -> bytes:
        return self.objects[key][0]

    def delete(self, keys: list[str]) -> None:
        for k in keys:
            self.objects.pop(k, None)

    def url(self, key: str) -> str:
        return f"memory://bucket/{key}"

    def is_up(self) -> bool:
        return True
