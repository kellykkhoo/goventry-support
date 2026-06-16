# apps/backend/app/models/draft_feedback.py
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db

FEEDBACK_CATEGORIES = [
    "approved_as_is",
    "edited_for_tone",
    "edited_for_accuracy",
    "edited_for_clarity",
    "edited_for_length",
    "missing_context",
    "wrong_policy",
    "wrong_agency_context",
    "wrong_product_context",
    "too_vague",
    "too_confident",
    "too_technical",
    "rejected",
]


class DraftFeedback(db.Model):
    __tablename__ = "draft_feedback"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    proposed_action_id: Mapped[int | None] = mapped_column(
        sa.Integer, sa.ForeignKey("proposed_actions.id"), nullable=True
    )
    issue_id: Mapped[int] = mapped_column(sa.Integer, sa.ForeignKey("issues.id"), nullable=False)
    agency_id: Mapped[int | None] = mapped_column(sa.Integer, sa.ForeignKey("agencies.id"), nullable=True)
    original_draft: Mapped[str] = mapped_column(sa.Text, nullable=False)
    final_approved_version: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    feedback_category: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    reviewer_notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    ticket_category: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    product_area: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
