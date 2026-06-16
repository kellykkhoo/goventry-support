# apps/backend/app/models/hermes_job_run.py
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class HermesJobRun(db.Model):
    __tablename__ = "hermes_job_runs"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    job_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    issue_id: Mapped[int | None] = mapped_column(sa.Integer, sa.ForeignKey("issues.id"), nullable=True)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="running")
    result_summary: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
