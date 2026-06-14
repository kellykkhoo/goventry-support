# apps/backend/app/models/user.py
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(sa.String(255))
    role_id: Mapped[int | None] = mapped_column(sa.ForeignKey("roles.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), nullable=False
    )

    role: Mapped["Role | None"] = relationship("Role", back_populates="users")
    agency_access: Mapped[list["UserAgencyAccess"]] = relationship(
        "UserAgencyAccess", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"
