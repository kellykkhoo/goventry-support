# apps/backend/app/models/agency.py
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


class Agency(db.Model):
    __tablename__ = "agencies"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(sa.String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)

    user_access: Mapped[list["UserAgencyAccess"]] = relationship(
        "UserAgencyAccess", back_populates="agency", cascade="all, delete-orphan"
    )
    issues: Mapped[list["Issue"]] = relationship(  # noqa: F821
        "Issue", back_populates="agency"
    )

    def __repr__(self) -> str:
        return f"<Agency {self.code}>"


class UserAgencyAccess(db.Model):
    __tablename__ = "user_agency_access"

    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    agency_id: Mapped[int] = mapped_column(
        sa.ForeignKey("agencies.id", ondelete="CASCADE"), primary_key=True
    )

    user: Mapped["User"] = relationship("User", back_populates="agency_access")
    agency: Mapped["Agency"] = relationship("Agency", back_populates="user_access")
