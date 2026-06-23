# apps/backend/app/routes/knowledge.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.user import User
from ..services.knowledge_service import knowledge_service

bp = Blueprint("knowledge", __name__, url_prefix="/knowledge")


def _user():
    return db.session.get(User, int(get_jwt_identity()))


def _entry_dict(e, full_content: bool = True):
    return {
        "id": e.id,
        "title": e.title,
        "content": e.content if full_content else (e.content or "")[:800],
        "source_type": e.source_type.value,
        "visibility": e.visibility.value,
        "agency_id": e.agency_id,
        "issue_id": e.issue_id,
        "created_at": e.created_at.isoformat(),
    }


def _handle(fn):
    try:
        return fn()
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except KeyError as e:
        return jsonify({"error": f"Missing required field: {e}"}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404


@bp.get("")
@jwt_required()
def list_entries():
    args = request.args
    agency_id_filter = args.get("agency_id", type=int)
    entries = knowledge_service.list_entries(
        _user(),
        search=args.get("search"),
        visibility=args.get("visibility"),
        source_type=args.get("source_type"),
        agency_id_filter=agency_id_filter,
    )
    items = [_entry_dict(e, full_content=False) for e in entries]
    return jsonify({"total": len(items), "items": items})


@bp.post("")
@jwt_required()
def create_entry():
    return _handle(lambda: (
        jsonify(_entry_dict(
            knowledge_service.create_entry(_user(), request.get_json(silent=True) or {})
        )),
        201,
    ))


@bp.get("/<int:entry_id>")
@jwt_required()
def get_entry(entry_id):
    return _handle(lambda: jsonify(_entry_dict(knowledge_service.get_entry(_user(), entry_id))))


@bp.patch("/<int:entry_id>")
@jwt_required()
def update_entry(entry_id):
    body = request.get_json(silent=True) or {}
    return _handle(lambda: jsonify(
        _entry_dict(knowledge_service.update_entry(_user(), entry_id, body))
    ))


@bp.delete("/<int:entry_id>")
@jwt_required()
def delete_entry(entry_id):
    def go():
        knowledge_service.delete_entry(_user(), entry_id)
        return jsonify({"ok": True})
    return _handle(go)
