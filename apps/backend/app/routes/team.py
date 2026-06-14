# apps/backend/app/routes/team.py
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from ..extensions import db
from ..models.team_member import TeamMember

bp = Blueprint("team", __name__, url_prefix="/team")


@bp.get("")
@jwt_required()
def list_team():
    members = db.session.scalars(db.select(TeamMember).order_by(TeamMember.name)).all()
    return jsonify([{"id": m.id, "name": m.name, "role_label": m.role_label} for m in members])
