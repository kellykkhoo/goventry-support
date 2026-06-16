# apps/backend/app/models/slack_delivery_log.py
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class SlackDeliveryLog(db.Model):
    __tablename__ = "slack_delivery_logs"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    report_type: Mapped[str] = mapped_column(sa.String(50), nullable=False, default="custom")
    channel_hint: Mapped[str | None] = mapped_column(sa.String(200), nullable=True)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False)  # success / failed
    error_message: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    payload_preview: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
