# apps/backend/app/models/issue.py
import enum
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


class Status(enum.Enum):
    Backlog = "Backlog"
    InProgress = "InProgress"
    Done = "Done"
    Cancelled = "Cancelled"


class Priority(enum.Enum):
    Low = "Low"
    Medium = "Medium"
    High = "High"
    Urgent = "Urgent"


class Product(enum.Enum):
    GovEntry = "GovEntry"
    GovSupply = "GovSupply"
    GovRewards = "GovRewards"


class IssueType(enum.Enum):
    FeatureRequest = "FeatureRequest"
    Bug = "Bug"
    UserGuideQuestion = "UserGuideQuestion"
    RegistrationEvent = "RegistrationEvent"


class Source(enum.Enum):
    web = "web"
    intake = "intake"
    formsg = "formsg"
    goventry = "goventry"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Issue(db.Model):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[Status] = mapped_column(sa.Enum(Status), default=Status.Backlog, nullable=False)
    priority: Mapped[Priority] = mapped_column(sa.Enum(Priority), default=Priority.Medium, nullable=False)
    product: Mapped[Product | None] = mapped_column(sa.Enum(Product))
    issue_type: Mapped[IssueType | None] = mapped_column(sa.Enum(IssueType))
    source: Mapped[Source] = mapped_column(sa.Enum(Source), default=Source.web, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(sa.String(255), unique=True)
    requester_name: Mapped[str | None] = mapped_column(sa.String(255))
    requester_email: Mapped[str | None] = mapped_column(sa.String(255))
    agency_id: Mapped[int] = mapped_column(sa.ForeignKey("agencies.id"), nullable=False, index=True)
    assignee_id: Mapped[int | None] = mapped_column(sa.ForeignKey("team_members.id", ondelete="SET NULL"))
    ai_triage_json: Mapped[dict | None] = mapped_column(sa.JSON)
    ai_draft_reply: Mapped[str | None] = mapped_column(sa.Text)
    triaged_at: Mapped[datetime | None] = mapped_column()
    submitted_at: Mapped[datetime | None] = mapped_column()
    resolution_summary: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow, nullable=False)

    agency: Mapped["Agency"] = relationship("Agency", back_populates="issues")  # noqa: F821
    assignee: Mapped["TeamMember | None"] = relationship("TeamMember")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Issue {self.id} {self.title!r}>"


class IssueAgency(db.Model):
    __tablename__ = "issue_agencies"

    issue_id: Mapped[int] = mapped_column(
        sa.ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True
    )
    agency_id: Mapped[int] = mapped_column(
        sa.ForeignKey("agencies.id", ondelete="CASCADE"), primary_key=True
    )
