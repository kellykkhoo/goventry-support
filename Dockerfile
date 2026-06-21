FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY apps/backend/ .

RUN pip install --no-cache-dir .

EXPOSE 3000

CMD ["sh", "-c", "flask --app wsgi db upgrade && gunicorn wsgi:app --bind 0.0.0.0:3000 --workers 2 --timeout 120"]
