# Stage 1: Build Vite frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend
COPY apps/frontend/package*.json ./
RUN npm ci
COPY apps/frontend/ .
RUN npm run build

# Stage 2: Flask backend + built frontend
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user required by Airbase (UID 999)
RUN groupadd -g 999 app && useradd -u 999 -g app -m app

WORKDIR /app

COPY --chown=app:app apps/backend/ .
COPY --chown=app:app --from=frontend-builder /frontend/dist ./static_frontend
COPY --chown=app:app docker-entrypoint.sh /docker-entrypoint.sh

RUN pip install --no-cache-dir . && chmod +x /docker-entrypoint.sh

USER app

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
