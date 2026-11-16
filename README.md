# Road Damage Classifier

Upload a road photo. The model checks it square by square, names the damage in each square (longitudinal crack, transverse crack, alligator crack, pothole or none), and gives the road a repair priority.

ML course project (Fundamentals of Machine Learning). Data: [RDD2022](https://github.com/sekilab/RoadDamageDetector).

## Layout

```
frontend/            Next.js web app: landing page and onboarding tour (port 3600)
  src/app/           layout, page, global styles
  src/components/    Home, tour (Tour.tsx + engine.ts), theme toggle, API status
  src/lib/roadKit.ts sample road drawing and damage classes for the tour
  src/theme/         deep-lab theme and fonts
backend/             FastAPI + ML (port 8600)
  main.py            API (GET /api/health)
  ml/                ML code, notebooks/, scripts/
  data/              raw/ and processed/ (not committed)
  models/            trained models (not committed)
  tests/
```

The browser only calls `/api/*` on the frontend. Next.js forwards it to the backend (`API_URL`, default `http://127.0.0.1:8600`).

## Run

```bash
# backend
cd backend
uv sync
uv run uvicorn main:app --reload --port 8600
uv run pytest

# frontend (another terminal)
cd frontend
npm install
npm run dev          # http://localhost:3600
```
