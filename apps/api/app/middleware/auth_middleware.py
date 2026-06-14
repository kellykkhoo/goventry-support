# apps/api/app/middleware/auth_middleware.py
from functools import wraps
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt


def require_role(*roles: str):
    """Decorator: require JWT + one of the named roles.

    Usage:
        @bp.post("/admin/users")
        @require_role("Admin")
        def create_user(): ...
    """
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get("role")
            if user_role not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
