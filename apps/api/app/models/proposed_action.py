# apps/api/app/models/proposed_action.py
import enum
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class ActionType(enum.Enum):
    reply = "reply"
    status_change = "status_change"
    assignment = "assignment"
    tag_change = "tag_change"
    internal_note = "internal_note"


class ProposalStatus(enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    executed = "executed"
    failed = "failed"


class ApprovalTier(enum.Enum):
    auto = "auto"
    human = "human"
    admin = "admin"


class ProposedAction(db.Model):
    __tablename__ = "proposed_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    action_type: Mapped[ActionType] = mapped_column(sa.Enum(ActionType), nullable=False)
    issue_id: Mapped[int] = mapped_column(
        sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    proposer: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    proposed_payload: Mapped[dict] = mapped_column(sa.JSON, nullable=False)
    final_payload: Mapped[dict | None] = mapped_column(sa.JSON)
    required_tier: Mapped[ApprovalTier] = mapped_column(sa.Enum(ApprovalTier), nullable=False)
    status: Mapped[ProposalStatus] = mapped_column(
        sa.Enum(ProposalStatus), default=ProposalStatus.pending, nullable=False
    )
    reviewer_id: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    reject_reason: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), nullable=False
    )
    decided_at: Mapped[datetime | None] = mapped_column()

    def __repr__(self) -> str:
        return f"<ProposedAction {self.id} {self.action_type} {self.status}>"
