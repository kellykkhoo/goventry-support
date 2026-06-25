#!/bin/sh
set -e

echo "[startup] Running database migrations..."
# Fail fast (30s) rather than hanging if the DB is unreachable
if ! timeout 30 flask --app wsgi db upgrade; then
  echo "[startup] ERROR: db upgrade failed or timed out — check DATABASE_URL and DB connectivity"
  exit 1
fi
echo "[startup] Migrations done."

echo "[startup] Bootstrapping admin user..."
flask --app wsgi bootstrap-admin || echo "[startup] bootstrap-admin skipped (already exists or env not set)."

echo "[startup] Starting gunicorn on port 3000..."
exec gunicorn wsgi:app \
  --bind 0.0.0.0:3000 \
  --workers 2 \
  --timeout 120 \
  --worker-tmp-dir /tmp \
  --access-logfile - \
  --error-logfile -
