# apps/backend/app/routes/webhooks.py
import base64
import hashlib
import hmac
import os
import sys
import time

from flask import Blueprint, current_app, jsonify, request

from ..extensions import db
from ..models.agency import Agency
from ..models.issue import Issue, Priority, Source, Status
from ..services.audit_service import audit_service
from ..services.triage_service import triage_in_background

bp = Blueprint("webhooks", __name__, url_prefix="/webhooks")

_MAX_AGE_MS = 300_000  # 5 minutes


def _verify_formsg_sig(webhook_uri: str) -> bool:
    """
    FormSG signs webhooks with HMAC-SHA256.
    Header: X-FormSG-Signature: v1=t=<epoch_ms>,s=<hex>  (or t=<epoch_ms>,s=<hex>)
    Signed content: <epoch_ms>.<webhook_uri>
    Key: base64-decode(FORMSG_SECRET_KEY)
    Returns True when FORMSG_SECRET_KEY is unset (dev mode).
    """
    secret = os.getenv("FORMSG_SECRET_KEY", "")
    if not secret:
        return True  # dev: skip verification when key not configured

    header = request.headers.get("X-FormSG-Signature", "")
    if header.startswith("v1="):
        header = header[3:]

    parts = {}
    for part in header.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            parts[k.strip()] = v.strip()

    epoch = parts.get("t", "")
    sig = parts.get("s", "")
    if not epoch or not sig:
        return False

    try:
        epoch_ms = int(epoch)
        if abs(time.time() * 1000 - epoch_ms) > _MAX_AGE_MS:
            return False
    except ValueError:
        return False

    try:
        key = base64.b64decode(secret)
    except Exception:  # noqa: BLE001
        key = secret.encode()

    expected = hmac.new(key, f"{epoch_ms}.{webhook_uri}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def _map_responses(responses: list) -> dict:
    """Map FormSG field responses to Issue fields by matching question keywords."""
    qa = {}
    for r in responses:
        q = (r.get("question") or "").lower().strip()
        a = (r.get("answer") or "").strip()
        if q:
            qa[q] = a

    def find(*keywords) -> str | None:
        for kw in keywords:
            for q, a in qa.items():
                if kw in q:
                    return a or None
        return None

    return {
        "requester_name": find("name", "full name", "your name"),
        "requester_email": find("email"),
        "title": find("subject", "title", "summary", "issue title"),
        "description": find("description", "detail", "message", "feedback", "issue", "problem", "question"),
        "agency_hint": find("agency", "department", "ministry", "organisation", "organization"),
    }


def _resolve_agency(agency_hint: str | None, email: str | None) -> int | None:
    """Resolve agency_id from the submitted agency name/code, or fall back to email domain."""
    if agency_hint:
        hint = agency_hint.strip().upper()
        row = db.session.scalar(db.select(Agency).where(Agency.code == hint))
        if row:
            return row.id
        for a in db.session.scalars(db.select(Agency)).all():
            if hint in a.name.upper() or a.code in hint:
                return a.id

    if email and "@" in email:
        domain = email.split("@")[1].lower()
        # e.g. moh.gov.sg → try "MOH"
        if domain.endswith(".gov.sg"):
            code_guess = domain.replace(".gov.sg", "").split(".")[-1].upper()
            row = db.session.scalar(db.select(Agency).where(Agency.code == code_guess))
            if row:
                return row.id

    fallback = db.session.scalar(db.select(Agency).order_by(Agency.id))
    return fallback.id if fallback else None


@bp.post("/formsg")
def formsg_webhook():
    webhook_uri = os.getenv("FORMSG_WEBHOOK_URI", request.url)
    if not _verify_formsg_sig(webhook_uri):
        return jsonify({"error": "Invalid signature"}), 401

    body = request.get_json(silent=True) or {}
    data = body.get("data", {})
    submission_id = data.get("submissionId", "")
    responses = data.get("responses", [])

    if not submission_id:
        return jsonify({"error": "Missing submissionId"}), 400

    # Idempotency: FormSG may retry — ignore duplicates
    existing = db.session.scalar(db.select(Issue).where(Issue.source_ref == submission_id))
    if existing:
        return jsonify({"ok": True, "issue_id": existing.id, "duplicate": True})

    fields = _map_responses(responses)
    agency_id = _resolve_agency(fields.get("agency_hint"), fields.get("requester_email"))
    if agency_id is None:
        print(f"[formsg] cannot resolve agency for submission {submission_id}", file=sys.stderr)
        return jsonify({"error": "Cannot resolve agency — add an Agency field to the form"}), 422

    title = fields.get("title") or f"FormSG submission {submission_id[:8]}"
    description = fields.get("description") or "\n".join(
        f"{r.get('question')}: {r.get('answer')}" for r in responses
    )

    issue = Issue(
        title=title[:500],
        description=description,
        source=Source.formsg,
        source_ref=submission_id,
        status=Status.Backlog,
        priority=Priority.Medium,
        agency_id=agency_id,
        requester_name=fields.get("requester_name"),
        requester_email=fields.get("requester_email"),
    )
    db.session.add(issue)
    db.session.commit()
    audit_service.log("issue_created_from_formsg", issue=issue,
                      detail={"submission_id": submission_id})

    if os.getenv("ANTHROPIC_API_KEY"):
        triage_in_background(current_app._get_current_object(), issue.id)

    return jsonify({"ok": True, "issue_id": issue.id}), 201
