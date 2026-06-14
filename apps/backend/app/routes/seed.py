# apps/backend/app/routes/seed.py
from flask import Blueprint, request, jsonify
from ..middleware.auth_middleware import require_role
from ..commands.seed import seed_demo

bp = Blueprint("seed", __name__, url_prefix="/seed")


@bp.post("/demo")
@require_role("Admin")
def run_seed():
    body = request.get_json(silent=True) or {}
    seed_demo(if_empty=body.get("if_empty", False))
    return jsonify({"ok": True})
