"""Road Damage Classifier API.

run:  uv run uvicorn main:app --reload --port 8600
"""

from fastapi import FastAPI

app = FastAPI(title="Road Damage Classifier API")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "model_loaded": False}
