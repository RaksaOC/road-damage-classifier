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
  main.py              app factory: loads models/, opens Postgres
  app/api.py           HTTP routes
  app/services.py      analyse a photo, correct it, save/list reports (records are permanent)
  app/repositories.py  SQL (Postgres) · app/schema.sql: tables
  app/domain.py        shapes + priority rule (mirrors frontend/src/domain)
  ml/photo.py          photo → 640 × 400 → 40 squares (same as training)
  ml/predict.py        loads the frozen models, checks their SHA-256 against metrics.json
  ml/notebooks/        phases 1–13 · ml/scripts/pick_samples.py: sample photos
  models/              frozen models + metrics.json from notebook 13 (not committed)
```

Request flow: browser → `POST /api/analyze` (Next forwards `/api/*` to `API_URL`) → `services.AnalysisService` → `ml.predict` (crop, squares, `features.extract`, 3 models) → stored in Postgres → JSON with the 40 squares per model. "Save record" → `POST /api/reports`, which points at the stored analysis, so a report can only hold predictions the server really made.

## Run

```bash
# database (once): Postgres 16, e.g. brew install postgresql@16 && brew services start postgresql@16
createdb rdc                      # the API creates its tables on startup
# other setups: export DATABASE_URL=postgresql://user:pass@host:5432/rdc

# backend: the frozen models are in backend/models/ (from notebook 13); the tests also need data/
cd backend
uv sync
uv run uvicorn main:app --reload --port 8600
createdb rdc_test && uv run pytest   # API tests use the rdc_test database

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

`compose.yaml` runs Postgres, the API and the website. Only the website is published (port 3000); Postgres and the API stay on the internal network.

```bash
cp .env.example .env               # set POSTGRES_PASSWORD
docker compose up -d --build       # http://localhost:3000
docker compose ps                  # all three should say "healthy"
```

- `/api/health` says `"ok": true` only when the models are loaded and Postgres is reachable. Both images have a Docker health check built on it.
- Reports live in the `rdc-db` volume. Back it up with `docker compose exec rdc-db pg_dump -U rdc rdc > rdc.sql`.
- Memory limits are set for a small shared server (2 CPU / 4 GB): API 768 MB, website 256 MB, Postgres 256 MB.
- Pushing to `main` builds both images in GitHub Actions and deploys them to the server (`.github/workflows/images.yml`). The server needs Postgres and `DATABASE_URL` set for the `rdc-api` container.
