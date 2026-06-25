# apps/backend/app/routes/feature_requests.py
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func
from ..extensions import db
from ..models.feature_request import FeatureRequest, FeatureRequestAgency, FeatureRequestTicket, FRStatus, FRPriority
from ..models.agency import Agency
from ..models.issue import Issue
from ..utils import utciso

bp = Blueprint("feature_requests", __name__, url_prefix="/feature-requests")

_PRIORITY_PTS = {"High": 15, "Medium": 10, "Low": 5}
_STATUS_PTS = {"UnderReview": 5, "Planned": 10, "InProgress": 15, "Released": 20}


def _score(agency_count: int, ticket_count: int, priority_val: str, status_val: str) -> float:
    return (
        min(agency_count * 3, 30)
        + min(ticket_count * 2, 20)
        + _PRIORITY_PTS.get(priority_val, 5)
        + _STATUS_PTS.get(status_val, 0)
    )


def _fr_dict(fr: FeatureRequest, include_tickets: bool = False) -> dict:
    agency_count = len(fr.agencies)
    ticket_count = len(fr.linked_tickets)
    priority_pts = _PRIORITY_PTS.get(fr.priority.value, 5)
    status_pts = _STATUS_PTS.get(fr.status.value, 0)
    score = min(agency_count * 3, 30) + min(ticket_count * 2, 20) + priority_pts + status_pts

    agencies_list = [
        {"id": fra.agency.id, "code": fra.agency.code, "name": fra.agency.name}
        for fra in fr.agencies
    ]

    result = {
        "id": fr.id,
        "title": fr.title,
        "description": fr.description,
        "status": fr.status.value,
        "priority": fr.priority.value,
        "product": fr.product,
        "pm_notes": fr.pm_notes,
        "target_release": fr.target_release,
        "created_at": utciso(fr.created_at),
        "updated_at": utciso(fr.updated_at),
        "agency_count": agency_count,
        "ticket_count": ticket_count,
        "score": score,
        "agencies": agencies_list,
    }

    if include_tickets:
        result["linked_tickets"] = [
            {"id": frt.issue.id, "title": frt.issue.title}
            for frt in fr.linked_tickets
        ]

    return result


@bp.get("")
@jwt_required()
def list_feature_requests():
    status_filter = request.args.get("status")
    priority_filter = request.args.get("priority")
    product_filter = request.args.get("product")
    search = request.args.get("search", "").strip()

    q = db.select(FeatureRequest)

    if status_filter:
        try:
            q = q.where(FeatureRequest.status == FRStatus(status_filter))
        except ValueError:
            return jsonify({"error": f"Invalid status: {status_filter}"}), 400

    if priority_filter:
        try:
            q = q.where(FeatureRequest.priority == FRPriority(priority_filter))
        except ValueError:
            return jsonify({"error": f"Invalid priority: {priority_filter}"}), 400

    if product_filter:
        q = q.where(FeatureRequest.product == product_filter)

    if search:
        pattern = f"%{search}%"
        q = q.where(
            FeatureRequest.title.ilike(pattern) | FeatureRequest.description.ilike(pattern)
        )

    frs = db.session.scalars(q.order_by(FeatureRequest.created_at.desc())).all()
    items = [_fr_dict(fr) for fr in frs]
    return jsonify({"items": items, "total": len(items)})


@bp.post("")
@jwt_required()
def create_feature_request():
    body = request.get_json(silent=True) or {}

    title = body.get("title", "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    try:
        status = FRStatus(body["status"]) if "status" in body else FRStatus.New
    except ValueError:
        return jsonify({"error": f"Invalid status"}), 400

    try:
        priority = FRPriority(body["priority"]) if "priority" in body else FRPriority.Medium
    except ValueError:
        return jsonify({"error": f"Invalid priority"}), 400

    fr = FeatureRequest(
        title=title,
        description=body.get("description", ""),
        status=status,
        priority=priority,
        product=body.get("product"),
        pm_notes=body.get("pm_notes"),
        target_release=body.get("target_release"),
    )
    db.session.add(fr)
    db.session.flush()

    for agency_id in body.get("agency_ids", []):
        agency = db.session.get(Agency, agency_id)
        if agency:
            db.session.add(FeatureRequestAgency(
                feature_request_id=fr.id,
                agency_id=agency_id,
            ))

    for issue_id in body.get("linked_ticket_ids", []):
        issue = db.session.get(Issue, issue_id)
        if issue:
            db.session.add(FeatureRequestTicket(
                feature_request_id=fr.id,
                issue_id=issue_id,
            ))

    db.session.commit()
    db.session.refresh(fr)
    return jsonify(_fr_dict(fr, include_tickets=True)), 201


@bp.get("/analytics")
@jwt_required()
def get_analytics():
    # All FRs with score, ordered desc, limit 10
    all_frs = db.session.scalars(db.select(FeatureRequest)).all()
    scored = []
    for fr in all_frs:
        agency_count = len(fr.agencies)
        ticket_count = len(fr.linked_tickets)
        s = _score(agency_count, ticket_count, fr.priority.value, fr.status.value)
        scored.append({
            "id": fr.id,
            "title": fr.title,
            "agency_count": agency_count,
            "ticket_count": ticket_count,
            "score": s,
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    top_features = scored[:10]

    # Top agencies by FR count
    rows = db.session.execute(
        db.select(
            Agency.code,
            Agency.name,
            func.count(FeatureRequestAgency.feature_request_id).label("count"),
        )
        .join(FeatureRequestAgency, Agency.id == FeatureRequestAgency.agency_id)
        .group_by(Agency.id, Agency.code, Agency.name)
        .order_by(func.count(FeatureRequestAgency.feature_request_id).desc())
        .limit(10)
    ).all()
    top_agencies = [{"code": r.code, "name": r.name, "count": r.count} for r in rows]

    # Monthly trend: last 12 months (PostgreSQL to_char)
    twelve_months_ago = datetime.now(timezone.utc) - timedelta(days=365)
    month_expr = func.to_char(FeatureRequest.created_at, "YYYY-MM")
    trend_rows = db.session.execute(
        db.select(
            month_expr.label("month"),
            func.count(FeatureRequest.id).label("count"),
        )
        .where(FeatureRequest.created_at >= twelve_months_ago)
        .group_by(month_expr)
        .order_by(month_expr)
    ).all()
    monthly_trend = [{"month": r.month, "count": r.count} for r in trend_rows]

    return jsonify({
        "top_features": top_features,
        "top_agencies": top_agencies,
        "monthly_trend": monthly_trend,
    })


@bp.get("/<int:fr_id>")
@jwt_required()
def get_feature_request(fr_id: int):
    fr = db.session.get(FeatureRequest, fr_id)
    if not fr:
        return jsonify({"error": "Feature request not found"}), 404
    return jsonify(_fr_dict(fr, include_tickets=True))


@bp.patch("/<int:fr_id>")
@jwt_required()
def patch_feature_request(fr_id: int):
    fr = db.session.get(FeatureRequest, fr_id)
    if not fr:
        return jsonify({"error": "Feature request not found"}), 404

    body = request.get_json(silent=True) or {}

    if "title" in body:
        fr.title = body["title"]
    if "description" in body:
        fr.description = body["description"]
    if "pm_notes" in body:
        fr.pm_notes = body["pm_notes"]
    if "target_release" in body:
        fr.target_release = body["target_release"]
    if "status" in body:
        try:
            fr.status = FRStatus(body["status"])
        except ValueError:
            return jsonify({"error": f"Invalid status: {body['status']}"}), 400
    if "priority" in body:
        try:
            fr.priority = FRPriority(body["priority"])
        except ValueError:
            return jsonify({"error": f"Invalid priority: {body['priority']}"}), 400

    fr.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    db.session.refresh(fr)
    return jsonify(_fr_dict(fr, include_tickets=True))
