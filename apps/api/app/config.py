# apps/api/app/config.py
from pydantic_settings import BaseSettings


class Config(BaseSettings):
    DATABASE_URL: str = "postgresql://goventry:goventry@localhost:5432/goventry"
    JWT_SECRET_KEY: str = "dev-secret-change-in-prod"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@goventry.gov.sg"
    BOOTSTRAP_ADMIN_PASSWORD: str = "changeme"

    model_config = {"env_file": ".env", "extra": "ignore"}
