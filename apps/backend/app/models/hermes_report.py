# apps/backend/app/models/hermes_report.py
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class HermesReport(db.Model):
    __tablename__ = "hermes_reports"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    report_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)  # daily / weekly
    agency_id: Mapped[int | None] = mapped_column(sa.Integer, sa.ForeignKey("agencies.id"), nullable=True)
    payload: Mapped[dict] = mapped_column(sa.JSON, nullable=False, default=dict)
    slack_sent: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
