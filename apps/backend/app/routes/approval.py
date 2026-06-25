# apps/backend/app/routes/approval.py
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.user import User
from ..models.hermes_job_run import HermesJobRun
from ..services.approval_service import approval_service
from ..utils import utciso

bp = Blueprint("approvals", __name__, url_prefix="/approvals")


def _user():
    return db.session.get(User, int(get_jwt_identity()))


def _dict(p):
    return {
        "id": p.id, "action_type": p.action_type.value, "issue_id": p.issue_id,
        "proposer": p.proposer, "proposed_payload": p.proposed_payload,
        "final_payload": p.final_payload, "required_tier": p.required_tier.value,
        "status": p.status.value, "reviewer_id": p.reviewer_id,
        "reject_reason": p.reject_reason,
        "created_at": utciso(p.created_at),
        "decided_at": utciso(p.decided_at),
    }


def _handle(fn):
    try:
        return fn()
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.get("")
@jwt_required()
def list_approvals():
    a = request.args
    result = approval_service.list_proposals(
        _user(), status=a.get("status"), action_type=a.get("action_type"),
        issue_id=a.get("issue_id", type=int), page=a.get("page", 1, type=int),
        per_page=a.get("per_page", 25, type=int))
    return jsonify({**result, "items": [_dict(p) for p in result["items"]]})


@bp.get("/<int:proposal_id>")
@jwt_required()
def get_approval(proposal_id):
    return _handle(lambda: jsonify(_dict(approval_service.get_proposal(_user(), proposal_id))))


@bp.post("/<int:proposal_id>/approve")
@jwt_required()
def approve(proposal_id):
    body = request.get_json(silent=True) or {}
    def go():
        proposal = approval_service.approve(_user(), proposal_id, body.get("final_payload"))
        if proposal.action_type.value == "reply":
            now = datetime.now(timezone.utc)
            job = HermesJobRun(
                job_name="reply_approved", issue_id=proposal.issue_id,
                status="success", result_summary="Reply approved and sent",
                started_at=now, finished_at=now,
            )
            db.session.add(job)
            db.session.commit()
        return jsonify(_dict(proposal))
    return _handle(go)


@bp.post("/<int:proposal_id>/reject")
@jwt_required()
def reject(proposal_id):
    body = request.get_json(silent=True) or {}
    return _handle(lambda: jsonify(_dict(
        approval_service.reject(_user(), proposal_id, body.get("reason", "")))))
