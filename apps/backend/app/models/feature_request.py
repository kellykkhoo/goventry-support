import enum
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


def _utcnow():
    return datetime.now(timezone.utc)


class FRStatus(enum.Enum):
    New = "New"
    UnderReview = "UnderReview"
    Planned = "Planned"
    InProgress = "InProgress"
    Released = "Released"
    Rejected = "Rejected"


class FRPriority(enum.Enum):
    High = "High"
    Medium = "Medium"
    Low = "Low"


class FeatureRequest(db.Model):
    __tablename__ = "feature_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False, default="")
    status: Mapped[FRStatus] = mapped_column(sa.Enum(FRStatus), default=FRStatus.New, nullable=False)
    priority: Mapped[FRPriority] = mapped_column(sa.Enum(FRPriority), default=FRPriority.Medium, nullable=False)
    product: Mapped[str | None] = mapped_column(sa.String(50))
    pm_notes: Mapped[str | None] = mapped_column(sa.Text)
    target_release: Mapped[str | None] = mapped_column(sa.String(50))  # e.g. "Q3 2026"
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow, nullable=False)

    agencies: Mapped[list["FeatureRequestAgency"]] = relationship(
        "FeatureRequestAgency", back_populates="feature_request", cascade="all, delete-orphan"
    )
    linked_tickets: Mapped[list["FeatureRequestTicket"]] = relationship(
        "FeatureRequestTicket", back_populates="feature_request", cascade="all, delete-orphan"
    )


class FeatureRequestAgency(db.Model):
    __tablename__ = "feature_request_agencies"
    feature_request_id: Mapped[int] = mapped_column(
        sa.ForeignKey("feature_requests.id", ondelete="CASCADE"), primary_key=True
    )
    agency_id: Mapped[int] = mapped_column(
        sa.ForeignKey("agencies.id", ondelete="CASCADE"), primary_key=True
    )
    feature_request: Mapped["FeatureRequest"] = relationship("FeatureRequest", back_populates="agencies")
    agency: Mapped["Agency"] = relationship("Agency")  # noqa: F821


class FeatureRequestTicket(db.Model):
    __tablename__ = "feature_request_tickets"
    feature_request_id: Mapped[int] = mapped_column(
        sa.ForeignKey("feature_requests.id", ondelete="CASCADE"), primary_key=True
    )
    issue_id: Mapped[int] = mapped_column(
        sa.ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True
    )
    feature_request: Mapped["FeatureRequest"] = relationship("FeatureRequest", back_populates="linked_tickets")
    issue: Mapped["Issue"] = relationship("Issue")  # noqa: F821
