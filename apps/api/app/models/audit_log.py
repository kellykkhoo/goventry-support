# apps/api/app/models/audit_log.py
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    user_id: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    issue_id: Mapped[int | None] = mapped_column(sa.ForeignKey("issues.id", ondelete="SET NULL"))
    agency_id: Mapped[int | None] = mapped_column(sa.ForeignKey("agencies.id", ondelete="SET NULL"))
    detail: Mapped[dict | None] = mapped_column(sa.JSON)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), nullable=False
    )
