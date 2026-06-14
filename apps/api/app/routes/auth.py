# apps/api/app/routes/auth.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..services.auth_service import auth_service
from ..models.user import User
from ..extensions import db

bp = Blueprint("auth", __name__, url_prefix="/auth")


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name if user.role else None,
    }


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    user = auth_service.authenticate(
        data.get("email", ""), data.get("password", "")
    )
    if user is None:
        return jsonify({"error": "Invalid credentials"}), 401
    token = auth_service.create_token(user)
    return jsonify({"token": token, "user": _user_dict(user)})


@bp.post("/logout")
def logout():
    # Stateless JWT: client discards the token. Future: add a denylist here.
    return jsonify({"ok": True})


@bp.get("/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        return jsonify({"error": "User not found"}), 404
    return jsonify(_user_dict(user))
