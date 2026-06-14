# apps/api/app/routes/admin.py
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.role import Role
from ..models.user import User
from ..services.auth_service import auth_service
from ..middleware.auth_middleware import require_role

bp = Blueprint("admin", __name__, url_prefix="/admin")


@bp.post("/users")
@require_role("Admin")
def create_user():
    data = request.get_json(silent=True) or {}
    if not data.get("email") or not data.get("name"):
        return jsonify({"error": "email and name are required"}), 400

    role = db.session.scalar(db.select(Role).where(Role.name == data.get("role")))
    password_hash = auth_service.hash_password(data["password"]) if data.get("password") else None

    user = User(
        email=data["email"],
        name=data["name"],
        role=role,
        password_hash=password_hash,
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "email": user.email, "name": user.name}), 201


@bp.patch("/users/<int:user_id>")
@require_role("Admin")
def update_user(user_id: int):
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        user.name = data["name"]
    if "role" in data:
        role = db.session.scalar(db.select(Role).where(Role.name == data["role"]))
        user.role = role
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    if "password" in data and data["password"]:
        user.password_hash = auth_service.hash_password(data["password"])

    db.session.commit()
    return jsonify({"id": user.id, "email": user.email, "name": user.name})
