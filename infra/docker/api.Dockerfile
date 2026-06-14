# infra/docker/api.Dockerfile
# Build context is the repo root (set in compose.yaml)
FROM python:3.12-slim

WORKDIR /api

RUN pip install --no-cache-dir uv

COPY apps/api/pyproject.toml apps/api/uv.lock* ./
RUN uv sync --frozen --no-dev

COPY apps/api/ .

EXPOSE 5000
