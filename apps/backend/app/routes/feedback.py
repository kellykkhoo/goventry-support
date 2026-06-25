# apps/backend/app/routes/feedback.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..middleware.auth_middleware import require_role
from ..models.draft_feedback import FEEDBACK_CATEGORIES
from ..services.feedback_service import feedback_service
from ..utils import utciso

bp = Blueprint("feedback", __name__, url_prefix="/feedback")


@bp.post("")
@jwt_required()
def record():
    body = request.get_json(silent=True) or {}
    issue_id = body.get("issue_id")
    original_draft = body.get("original_draft", "")
    feedback_category = body.get("feedback_category", "")

    if not issue_id:
        return jsonify({"error": "issue_id is required"}), 400
    if feedback_category not in FEEDBACK_CATEGORIES:
        return jsonify({"error": f"feedback_category must be one of: {', '.join(FEEDBACK_CATEGORIES)}"}), 400

    record = feedback_service.record_feedback(
        issue_id=issue_id,
        proposed_action_id=body.get("proposed_action_id"),
        original_draft=original_draft,
        feedback_category=feedback_category,
        final_approved_version=body.get("final_approved_version"),
        reviewer_notes=body.get("reviewer_notes"),
    )
    return jsonify({
        "id": record.id,
        "issue_id": record.issue_id,
        "feedback_category": record.feedback_category,
        "reviewer_notes": record.reviewer_notes,
        "created_at": utciso(record.created_at),
    }), 201


@bp.get("")
@require_role("Admin")
def list_all():
    agency_id = request.args.get("agency_id", type=int)
    limit = request.args.get("limit", 50, type=int)
    rows = feedback_service.list_feedback(agency_id=agency_id, limit=limit)
    return jsonify([
        {
            "id": r.id,
            "issue_id": r.issue_id,
            "proposed_action_id": r.proposed_action_id,
            "feedback_category": r.feedback_category,
            "reviewer_notes": r.reviewer_notes,
            "ticket_category": r.ticket_category,
            "product_area": r.product_area,
            "agency_id": r.agency_id,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ])


@bp.get("/examples")
@require_role("Admin", "PM")
def examples():
    agency_id = request.args.get("agency_id", type=int)
    rows = feedback_service.get_approved_examples(agency_id=agency_id)
    return jsonify(rows)
