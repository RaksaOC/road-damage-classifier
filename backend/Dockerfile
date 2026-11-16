# FastAPI + scikit-learn backend.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /bin/

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_CACHE=1 UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 MPLBACKEND=Agg
WORKDIR /app
# Dependencies first so code changes don't reinstall them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN useradd --create-home --uid 1001 app && mkdir -p models data && chown -R app models data
USER app

EXPOSE 8600
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8600", "--workers", "1"]
