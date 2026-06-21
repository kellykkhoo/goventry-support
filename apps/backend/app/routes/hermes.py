# apps/backend/app/routes/hermes.py
from datetime import datetime, timezone
import sqlalchemy as sa
from flask import Blueprint, request, jsonify, current_app
from ..middleware.auth_middleware import require_role
from ..extensions import db
from ..models.issue import Issue
from ..models.hermes_report import HermesReport
from ..models.hermes_job_run import HermesJobRun
from ..services.triage_service import run_triage, regenerate_draft_reply
from ..models.proposed_action import ProposedAction
from ..services.report_service import generate_daily_report, generate_weekly_report
from ..services.approval_service import approval_service
from ..models.proposed_action import ActionType

bp = Blueprint("hermes", __name__, url_prefix="/hermes")


def _finish_job(job: HermesJobRun, status: str, summary: str | None = None, error: str | None = None) -> None:
    job.status = status
    job.result_summary = summary
    job.error_message = error
    job.finished_at = datetime.now(timezone.utc)
    db.session.commit()


@bp.post("/tickets/<int:issue_id>/triage")
@require_role("Admin", "PM", "Product Ops")
def triage_ticket(issue_id: int):
    job = HermesJobRun(job_name="triage", issue_id=issue_id, status="running")
    db.session.add(job)
    db.session.commit()
    try:
        result = run_triage(issue_id)
        if result is None:
            _finish_job(job, "failed", error="No result from triage (check ANTHROPIC_API_KEY)")
            return jsonify({"ok": False, "error": "Triage returned no result"}), 500
        summary = f"priority={result.get('priority')} type={result.get('issueType')} confidence={result.get('confidence')}"
        _finish_job(job, "success", summary=summary)
        return jsonify({"ok": True, "result": result})
    except Exception as exc:  # noqa: BLE001
        _finish_job(job, "failed", error=str(exc))
        return jsonify({"ok": False, "error": str(exc)}), 500


@bp.post("/tickets/<int:issue_id>/draft-reply")
@require_role("Admin", "PM", "Product Ops")
def draft_reply(issue_id: int):
    job = HermesJobRun(job_name="draft_reply", issue_id=issue_id, status="running")
    db.session.add(job)
    db.session.commit()
    try:
        issue = db.session.get(Issue, issue_id)
        if issue is None:
            _finish_job(job, "failed", error="Issue not found")
            return jsonify({"ok": False, "error": "Issue not found"}), 404

        if issue.ai_triage_json and issue.ai_triage_json.get("draftReply"):
            draft = issue.ai_triage_json["draftReply"]
            _finish_job(job, "success", summary="Used existing triage draft")
        else:
            result = run_triage(issue_id)
            if result is None:
                _finish_job(job, "failed", error="Triage returned no result")
                return jsonify({"ok": False, "error": "Triage returned no result"}), 500
            draft = result.get("draftReply", "")
            _finish_job(job, "success", summary="Generated new draft via triage")

        return jsonify({"ok": True, "draft": draft})
    except Exception as exc:  # noqa: BLE001
        _finish_job(job, "failed", error=str(exc))
        return jsonify({"ok": False, "error": str(exc)}), 500


@bp.post("/tickets/<int:issue_id>/internal-note")
@require_role("Admin", "PM", "Product Ops")
def create_internal_note(issue_id: int):
    job = HermesJobRun(job_name="internal_note", issue_id=issue_id, status="running")
    db.session.add(job)
    db.session.commit()
    try:
        issue = db.session.get(Issue, issue_id)
        if issue is None:
            _finish_job(job, "failed", error="Issue not found")
            return jsonify({"ok": False, "error": "Issue not found"}), 404

        triage = issue.ai_triage_json
        if not triage:
            result = run_triage(issue_id)
            triage = result or {}

        note_body = (
            f"[Hermes auto-note]\n"
            f"Priority: {triage.get('priority', 'unknown')} | "
            f"Type: {triage.get('issueType', 'unknown')} | "
            f"Confidence: {round((triage.get('confidence', 0) or 0) * 100)}%\n"
            f"Summary: {triage.get('summary', 'No summary.')}"
        )
        approval_service.propose(
            action_type=ActionType.internal_note,
            issue=issue,
            proposed_payload={"body": note_body},
            proposer="agent:hermes",
        )
        _finish_job(job, "success", summary="Internal note proposed for approval")
        return jsonify({"ok": True})
    except Exception as exc:  # noqa: BLE001
        _finish_job(job, "failed", error=str(exc))
        return jsonify({"ok": False, "error": str(exc)}), 500


@bp.post("/tickets/<int:issue_id>/regenerate-reply")
@require_role("Admin", "PM", "Product Ops")
def regenerate_reply(issue_id: int):
    body = request.get_json(silent=True) or {}
    feedback = (body.get("feedback") or "").strip()
    existing_draft = (body.get("existing_draft") or "").strip()
    proposal_id = body.get("proposal_id")
    if not feedback:
        return jsonify({"error": "feedback is required"}), 400
    job = HermesJobRun(job_name="regenerate_reply", issue_id=issue_id, status="running")
    db.session.add(job)
    db.session.commit()
    try:
        new_draft = regenerate_draft_reply(issue_id, feedback, existing_draft)
        if not new_draft:
            _finish_job(job, "failed", error="No draft generated (check ANTHROPIC_API_KEY)")
            return jsonify({"ok": False, "error": "No draft generated"}), 500
        if proposal_id:
            proposal = db.session.get(ProposedAction, proposal_id)
            if proposal and proposal.status == "pending":
                proposal.proposed_payload = {**(proposal.proposed_payload or {}), "body": new_draft}
                db.session.commit()
        _finish_job(job, "success", summary=f"Draft regenerated with feedback")
        return jsonify({"ok": True, "draft": new_draft})
    except Exception as exc:
        _finish_job(job, "failed", error=str(exc))
        return jsonify({"ok": False, "error": str(exc)}), 500


@bp.post("/reports/daily")
@require_role("Admin")
def generate_daily():
    agency_id = request.json.get("agency_id") if request.is_json else None
    job = HermesJobRun(job_name="daily_report", status="running")
    db.session.add(job)
    db.session.commit()
    try:
        payload = generate_daily_report(agency_id=agency_id)
        report = HermesReport(report_type="daily", agency_id=agency_id, payload=payload)
        db.session.add(report)
        _finish_job(job, "success", summary=f"Daily report generated — {payload.get('new_today')} new tickets")
        return jsonify(payload)
    except Exception as exc:  # noqa: BLE001
        _finish_job(job, "failed", error=str(exc))
        return jsonify({"ok": False, "error": str(exc)}), 500


@bp.post("/reports/weekly")
@require_role("Admin")
def generate_weekly():
    agency_id = request.json.get("agency_id") if request.is_json else None
    job = HermesJobRun(job_name="weekly_report", status="running")
    db.session.add(job)
    db.session.commit()
    try:
        payload = generate_weekly_report(agency_id=agency_id)
        report = HermesReport(report_type="weekly", agency_id=agency_id, payload=payload)
        db.session.add(report)
        _finish_job(job, "success", summary=f"Weekly report generated — {payload.get('new_this_week')} new this week")
        return jsonify(payload)
    except Exception as exc:  # noqa: BLE001
        _finish_job(job, "failed", error=str(exc))
        return jsonify({"ok": False, "error": str(exc)}), 500


@bp.get("/activity")
@require_role("Admin")
def activity():
    rows = db.session.scalars(
        db.select(HermesJobRun).order_by(HermesJobRun.started_at.desc()).limit(50)
    ).all()
    return jsonify([
        {
            "id": r.id,
            "job_name": r.job_name,
            "issue_id": r.issue_id,
            "status": r.status,
            "result_summary": r.result_summary,
            "error_message": r.error_message,
            "started_at": r.started_at.isoformat(),
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        }
        for r in rows
    ])


@bp.get("/reports")
@require_role("Admin")
def list_reports():
    report_type = request.args.get("report_type")
    q = db.select(HermesReport).order_by(HermesReport.created_at.desc()).limit(20)
    if report_type:
        q = q.where(HermesReport.report_type == report_type)
    rows = db.session.scalars(q).all()
    return jsonify([
        {
            "id": r.id,
            "report_type": r.report_type,
            "agency_id": r.agency_id,
            "slack_sent": r.slack_sent,
            "payload": r.payload,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ])
