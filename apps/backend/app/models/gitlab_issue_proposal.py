# apps/backend/app/models/gitlab_issue_proposal.py
import enum
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class ProposalStatus(enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    created = "created"   # approved + successfully created in GitLab


class GitLabIssueProposal(db.Model):
    __tablename__ = "gitlab_issue_proposals"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    labels: Mapped[list] = mapped_column(sa.JSON, nullable=False, default=list)
    related_ticket_ids: Mapped[list] = mapped_column(sa.JSON, nullable=False, default=list)
    confidence: Mapped[float | None] = mapped_column(sa.Float)
    status: Mapped[ProposalStatus] = mapped_column(
        sa.Enum(ProposalStatus), default=ProposalStatus.pending, nullable=False
    )
    created_by_id: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    reviewer_id: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    reject_reason: Mapped[str | None] = mapped_column(sa.Text)
    gitlab_issue_url: Mapped[str | None] = mapped_column(sa.String(500))
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), nullable=False
    )
    decided_at: Mapped[datetime | None] = mapped_column()
