# apps/backend/app/routes/slack.py
from flask import Blueprint, request, jsonify
from ..middleware.auth_middleware import require_role
from ..extensions import db
from ..models.slack_delivery_log import SlackDeliveryLog
from ..services.slack_service import slack_service

bp = Blueprint("slack", __name__, url_prefix="/slack")


@bp.post("/reports/send")
@require_role("Admin")
def send_report():
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    report_type = body.get("report_type", "custom")
    channel_hint = body.get("channel_hint")
    if not text:
        return jsonify({"error": "text is required"}), 400
    result = slack_service.send_message(text=text, report_type=report_type, channel_hint=channel_hint)
    return jsonify(result)


@bp.get("/delivery-logs")
@require_role("Admin")
def delivery_logs():
    rows = db.session.scalars(
        db.select(SlackDeliveryLog).order_by(SlackDeliveryLog.created_at.desc()).limit(20)
    ).all()
    return jsonify([
        {
            "id": r.id,
            "report_type": r.report_type,
            "channel_hint": r.channel_hint,
            "status": r.status,
            "error_message": r.error_message,
            "payload_preview": r.payload_preview,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ])
