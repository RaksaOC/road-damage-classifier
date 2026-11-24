# Road Damage Classifier

Upload a road photo. The model checks it square by square, names the damage in each square (longitudinal crack, transverse crack, alligator crack, pothole or none), and gives the road a repair priority.

ML course project (Fundamentals of Machine Learning). Data: [RDD2022](https://github.com/sekilab/RoadDamageDetector).

## Layout

```
frontend/src/
  domain/              types + rules only (classes, frame, priority, Analysis, Report, Model)
  services/            ports.ts: the interfaces the UI uses · index.ts: picks mock or api
  data/api/            adapter for FastAPI (DTOs → domain)
  data/mock/           adapter with the stand-in classifier + localStorage reports
  data/shared/         sample photos (public/samples/, both modes)
  hooks/               useReports, useAsync, useSamples, useModels, useHealth
  components/          UI; talks only to hooks and services, never to fetch or localStorage
  lib/photo.ts         browser photo prep (crop preview, thumbnails)
backend/
  main.py              app factory: loads models/, opens Postgres and the photo store
  app/api.py           HTTP routes
  app/services.py      analyse a photo, correct it, save/list reports (records are permanent)
  app/repositories.py  SQL (Postgres) · app/schema.sql: tables
  app/storage.py       photos in MinIO (S3): signed uploads, signed image links
  app/domain.py        shapes + priority rule (mirrors frontend/src/domain)
  ml/photo.py          photo → 640 × 400 → 40 squares (same as training)
  ml/predict.py        loads the frozen models, checks their SHA-256 against metrics.json
  ml/notebooks/        phases 1–13 · ml/scripts/pick_samples.py: sample photos
  models/              frozen models + metrics.json from notebook 13 (not committed)
```

Request flow (Next forwards `/api/*` to `API_URL`):

1. `POST /api/uploads` → a signed form for one new key `incoming/<uuid>`, good for 10 minutes. MinIO itself enforces the image type and the size limit.
2. The browser posts the photo straight to MinIO; the API never handles the upload. Sample roads take the same path, so every check has its own copy.
3. `POST /api/analyze` with that key → `services.AnalysisService` reads it from MinIO → `ml.predict` (crop, squares, `features.extract`, 3 models).
4. The photo is kept as `originals/<id>` and the frame as `frames/<id>.jpg` in MinIO. Postgres stores the predictions and the keys, not the images.
5. The answer is JSON with the 40 squares per model, and `image_url` is a signed link to the frame that stays the same all day, so browsers cache it.

Unchecked uploads expire after a day (a lifecycle rule on `incoming/`). "Save record" → `POST /api/reports`, which points at the stored analysis, so a report can only hold predictions the server really made.

## Run

```bash
# database (once): Postgres 16, e.g. brew install postgresql@16 && brew services start postgresql@16
createdb rdc                      # the API creates its tables on startup
# other setups: export DATABASE_URL=postgresql://user:pass@host:5432/rdc

# photos (once): MinIO, e.g. docker run -d --name rdc-minio -p 9000:9000 pgsty/minio server /data
#   defaults: http://127.0.0.1:9000, key minioadmin / minioadmin, bucket road-damage (made at startup)
#   other setups: S3_ENDPOINT, S3_PUBLIC_URL (what browsers use), S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET

# backend: the frozen models are in backend/models/ (from notebook 13); the tests also need data/
cd backend
uv sync
uv run uvicorn main:app --reload --port 8600
createdb rdc_test && uv run pytest   # API tests use the rdc_test database and an in-memory photo store

# frontend (another terminal)
cd frontend
npm install
npm run dev                        # http://localhost:3600
```

### Mock or API

`NEXT_PUBLIC_DATA_SOURCE` in `frontend/.env.local` (see `.env.example`) picks the data source at build time:

- `api` (default): the real models and Postgres.
- `mock`: no backend needed. A stand-in classifier, with reports kept in the browser. The header shows "Mock data".

Restart `npm run dev` after changing it. Both modes implement the same interfaces in `src/services/ports.ts`.

## Docker

`compose.yaml` runs Postgres, MinIO, the API and the website. The website (port 3000) and MinIO's S3 port (9000, for photo uploads and image links) are published; Postgres and the API stay on the internal network.

```bash
cp .env.example .env               # set POSTGRES_PASSWORD and MINIO_ROOT_PASSWORD
docker compose up -d --build       # http://localhost:3000
docker compose ps                  # all four should say "healthy"
```

- `/api/health` says `"ok": true` only when the models are loaded and Postgres and MinIO are reachable. Both images have a Docker health check built on it.
- Reports live in the `rdc-db` volume and photos in `rdc-files`. Back up both: `docker compose exec rdc-db pg_dump -U rdc rdc > rdc.sql`, and the `road-damage` bucket with `mc mirror`.
- Databases from before MinIO kept frames in Postgres (`analyses.frame_jpeg`). The API moves them to MinIO at startup, then drops that column.
- Memory limits are set for a small shared server (2 CPU / 4 GB): API 768 MB, website 256 MB, Postgres 256 MB.
- Pushing to `main` builds both images in GitHub Actions and deploys them to the server (`.github/workflows/images.yml`). The server needs Postgres (`DATABASE_URL`) and MinIO (the `S3_*` settings) for the `rdc-api` container.
