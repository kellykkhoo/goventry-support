# apps/backend/app/routes/issues.py
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.user import User
from ..services.issue_service import issue_service
from ..services.triage_service import triage_in_background
from ..utils import utciso

bp = Blueprint("issues", __name__, url_prefix="/issues")


def _user():
    return db.session.get(User, int(get_jwt_identity()))


def _issue_dict(i):
    return {
        "id": i.id, "title": i.title, "description": i.description,
        "status": i.status.value, "priority": i.priority.value,
        "product": i.product.value if i.product else None,
        "issue_type": i.issue_type.value if i.issue_type else None,
        "source": i.source.value, "agency_id": i.agency_id,
        "agency_name": i.agency.name if i.agency else None,
        "agency_code": i.agency.code if i.agency else None,
        "assignee_id": i.assignee_id,
        "requester_name": i.requester_name, "requester_email": i.requester_email,
        "ai_triage_json": i.ai_triage_json, "ai_draft_reply": i.ai_draft_reply,
        "triaged_at": utciso(i.triaged_at),
        "resolution_summary": i.resolution_summary,
        "created_at": utciso(i.created_at),
        "submitted_at": utciso(i.submitted_at),
    }


def _msg_dict(m):
    return {"id": m.id, "direction": m.direction.value, "sender_name": m.sender_name,
            "body": m.body, "created_at": utciso(m.created_at)}


def _handle(fn):
    try:
        return fn()
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except LookupError as e:
        return jsonify({"error": str(e)}), 404


@bp.get("")
@jwt_required()
def list_issues():
    args = request.args
    result = issue_service.list_issues(
        _user(), status=args.get("status"), product=args.get("product"),
        search=args.get("search"), page=int(args.get("page", 1)),
        per_page=int(args.get("per_page", 25)),
    )
    return jsonify({**result, "items": [_issue_dict(i) for i in result["items"]]})


@bp.post("")
@jwt_required()
def create_issue():
    return _handle(lambda: jsonify(_issue_dict(
        issue_service.create_issue(_user(), request.get_json(silent=True) or {}))))


@bp.get("/<int:issue_id>")
@jwt_required()
def get_issue(issue_id):
    return _handle(lambda: jsonify(_issue_dict(issue_service.get_issue(_user(), issue_id))))


@bp.patch("/<int:issue_id>/status")
@jwt_required()
def update_status(issue_id):
    body = request.get_json(silent=True) or {}
    return _handle(lambda: jsonify(_issue_dict(
        issue_service.update_status(_user(), issue_id, body.get("status")))))


@bp.patch("/<int:issue_id>/assignee")
@jwt_required()
def update_assignee(issue_id):
    body = request.get_json(silent=True) or {}
    return _handle(lambda: jsonify(_issue_dict(
        issue_service.update_assignee(_user(), issue_id, body.get("assignee_id")))))


@bp.post("/<int:issue_id>/internal-notes")
@jwt_required()
def add_note(issue_id):
    body = request.get_json(silent=True) or {}
    return _handle(lambda: jsonify(_msg_dict(
        issue_service.add_internal_note(_user(), issue_id, body.get("body", "")))))


@bp.get("/<int:issue_id>/messages")
@jwt_required()
def list_messages(issue_id):
    return _handle(lambda: jsonify(
        [_msg_dict(m) for m in issue_service.list_messages(_user(), issue_id)]))


@bp.post("/<int:issue_id>/triage")
@jwt_required()
def trigger_triage(issue_id):
    def go():
        issue_service.get_issue(_user(), issue_id)  # scope check
        triage_in_background(current_app._get_current_object(), issue_id)
        return jsonify({"ok": True})
    return _handle(go)


@bp.post("/<int:issue_id>/send-reply")
@jwt_required()
def send_reply(issue_id):
    body = request.get_json(silent=True) or {}
    return _handle(lambda: jsonify(_issue_dict(
        issue_service.send_reply(_user(), issue_id, body.get("body", "")))))


@bp.post("/<int:issue_id>/approve-reply")
@jwt_required()
def approve_reply(issue_id):
    body = request.get_json(silent=True) or {}
    return _handle(lambda: jsonify(_issue_dict(
        issue_service.approve_and_send(_user(), issue_id, body.get("body", "")))))


@bp.post("/<int:issue_id>/resolve")
@jwt_required()
def resolve_ticket(issue_id):
    return _handle(lambda: jsonify(_issue_dict(
        issue_service.resolve_ticket(_user(), issue_id))))
