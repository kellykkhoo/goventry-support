# apps/backend/app/config.py
from pathlib import Path
from pydantic_settings import BaseSettings

# Always read THIS app's own .env (apps/backend/.env), never the legacy root .env
# (the old Next.js/Prisma app keeps a Prisma-format DATABASE_URL there).
# OS environment variables still take precedence over the file.
_API_DIR = Path(__file__).resolve().parent.parent  # -> apps/backend/


class Config(BaseSettings):
    DATABASE_URL: str = "postgresql://goventry:goventry@localhost:5432/goventry"
    JWT_SECRET_KEY: str = "dev-secret-change-in-prod"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@goventry.gov.sg"
    BOOTSTRAP_ADMIN_PASSWORD: str = "changeme"
    SLACK_WEBHOOK_URL: str = ""
    GITLAB_TOKEN: str = ""
    GITLAB_BASE_URL: str = "https://sgts.gitlab-dedicated.com"

    model_config = {"env_file": _API_DIR / ".env", "extra": "ignore"}
