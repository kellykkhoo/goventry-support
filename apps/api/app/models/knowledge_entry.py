# apps/api/app/models/knowledge_entry.py
import enum
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class SourceType(enum.Enum):
    doc = "doc"
    resolved_ticket = "resolved_ticket"


class Visibility(enum.Enum):
    agency_specific = "agency_specific"
    global_sanitized = "global_sanitized"
    internal_admin_only = "internal_admin_only"


class KnowledgeEntry(db.Model):
    __tablename__ = "knowledge_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_type: Mapped[SourceType] = mapped_column(sa.Enum(SourceType), nullable=False)
    issue_id: Mapped[int | None] = mapped_column(sa.ForeignKey("issues.id", ondelete="SET NULL"))
    agency_id: Mapped[int | None] = mapped_column(sa.ForeignKey("agencies.id", ondelete="SET NULL"))
    visibility: Mapped[Visibility] = mapped_column(sa.Enum(Visibility), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), nullable=False
    )
