# infra/docker/api.Dockerfile
# Build context is the repo root (set in compose.yaml)
FROM python:3.12-slim

WORKDIR /api

RUN pip install --no-cache-dir uv

COPY apps/backend/pyproject.toml apps/backend/uv.lock* ./
RUN uv sync --frozen --no-dev

COPY apps/backend/ .

EXPOSE 5000
