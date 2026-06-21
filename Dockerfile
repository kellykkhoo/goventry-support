# Stage 1: Build Vite frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend
COPY apps/frontend/package*.json ./
RUN npm ci
COPY apps/frontend/ .
RUN npm run build

# Stage 2: Flask backend + built frontend
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY apps/backend/ .
COPY --from=frontend-builder /frontend/dist ./static_frontend

RUN pip install --no-cache-dir .

EXPOSE 3000

CMD ["sh", "-c", "flask --app wsgi db upgrade && flask --app wsgi bootstrap-admin && gunicorn wsgi:app --bind 0.0.0.0:3000 --workers 2 --timeout 120"]
