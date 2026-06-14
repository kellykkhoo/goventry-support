# apps/api/app/models/role.py
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


class Role(db.Model):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(50), unique=True, nullable=False)

    users: Mapped[list["User"]] = relationship("User", back_populates="role")

    def __repr__(self) -> str:
        return f"<Role {self.name}>"
