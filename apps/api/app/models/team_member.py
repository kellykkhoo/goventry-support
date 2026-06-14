# apps/api/app/models/team_member.py
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from ..extensions import db


class TeamMember(db.Model):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    role_label: Mapped[str] = mapped_column(sa.String(50), nullable=False)

    def __repr__(self) -> str:
        return f"<TeamMember {self.name}>"
