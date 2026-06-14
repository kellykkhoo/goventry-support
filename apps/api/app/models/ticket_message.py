# apps/api/app/models/ticket_message.py
import enum
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class Direction(enum.Enum):
    outbound = "outbound"
    inbound = "inbound"
    note = "note"


class TicketMessage(db.Model):
    __tablename__ = "ticket_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    issue_id: Mapped[int] = mapped_column(
        sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[Direction] = mapped_column(sa.Enum(Direction), nullable=False)
    sender_name: Mapped[str | None] = mapped_column(sa.String(255))
    body: Mapped[str] = mapped_column(sa.Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), nullable=False
    )
