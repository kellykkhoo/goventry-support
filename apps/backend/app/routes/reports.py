# apps/backend/app/routes/reports.py
from flask import Blueprint, request, jsonify
from ..middleware.auth_middleware import require_role
from ..services.report_service import generate_daily_report

bp = Blueprint("reports", __name__, url_prefix="/reports")


@bp.get("/daily")
@require_role("Admin")
def daily_report():
    agency_id = request.args.get("agency_id", type=int)
    report = generate_daily_report(agency_id=agency_id)
    return jsonify(report)
