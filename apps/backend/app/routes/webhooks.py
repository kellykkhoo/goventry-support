# apps/backend/app/routes/webhooks.py
import base64, json, os, sys, time
from datetime import datetime, timezone
from flask import Blueprint, current_app, jsonify, request
from ..extensions import db
from ..models.agency import Agency
from ..models.issue import Issue, Priority, Source, Status
from ..services.audit_service import audit_service
from ..services.triage_service import triage_in_background

bp = Blueprint("webhooks", __name__, url_prefix="/webhooks")
_MAX_AGE_MS = 300_000  # 5 minutes

# FormSG production signing public key (ed25519, base64).
# Source: @opengovsg/formsg-sdk resource/signing-keys.js -> production.publicKey
_FORMSG_PROD_PUBKEY = "3Tt8VduXsjjd4IrpdCd7BAkdZl/vUCstu9UvTX84FWw="


def _b64(s: str) -> bytes:
    padding = 4 - len(s) % 4
    return base64.b64decode(s if padding == 4 else s + "=" * padding)


def _verify_formsg_sig(webhook_uri: str) -> bool:
    """Verify X-FormSG-Signature using FormSG's ed25519 public key.
    Skip if FORMSG_SECRET_KEY is unset (dev / smoke-test mode).

    Header format: t={epoch},s={submissionId},f={formId},v1={ed25519_signature_base64}
    Base string:   {uri}.{submissionId}.{formId}.{epoch}
    Source: opengovsg/formsg-python-sdk formsg/util/webhook.py
    """
    if not os.getenv("FORMSG_SECRET_KEY"):
        return True

    header = request.headers.get("X-FormSG-Signature", "")
    if not header:
        return False

    parts = {}
    for p in header.split(","):
        if "=" in p:
            k, v = p.split("=", 1)
            parts[k.strip()] = v.strip()

    epoch = parts.get("t", "")
    submission_id = parts.get("s", "")
    form_id = parts.get("f", "")
    sig_b64 = parts.get("v1", "")

    if not epoch or not submission_id or not form_id or not sig_b64:
        return False

    try:
        if abs(time.time() * 1000 - float(epoch)) > _MAX_AGE_MS:
            return False
    except ValueError:
        return False

    try:
        from nacl.signing import VerifyKey
        base_string = f"{webhook_uri}.{submission_id}.{form_id}.{epoch}"
        verify_key = VerifyKey(_b64(_FORMSG_PROD_PUBKEY))
        verify_key.verify(base_string.encode("utf-8"), _b64(sig_b64))
        return True
    except Exception:
        return False


def _decrypt_formsg(encrypted_content: str, form_private_key_b64: str):
    """Decrypt FormSG storage-mode encrypted content.

    Wire format: {submissionPublicKey};{nonce}:{ciphertext}  (all base64)
    Encryption: NaCl box (X25519 + XSalsa20-Poly1305)
    Returns a list of {question, answer} dicts, or None on failure.
    """
    try:
        from nacl.public import Box, PrivateKey, PublicKey
        sub_pub_b64, nonce_cipher = encrypted_content.split(";")
        nonce_b64, cipher_b64 = nonce_cipher.split(":")
        box = Box(PrivateKey(_b64(form_private_key_b64)), PublicKey(_b64(sub_pub_b64)))
        decrypted = box.decrypt(_b64(cipher_b64), _b64(nonce_b64))
        return json.loads(decrypted.decode("utf-8"))
    except Exception as exc:
        print(f"[formsg] decryption failed: {exc}", file=sys.stderr)
        return None


def _map_responses(responses: list) -> dict:
    qa = {(r.get("question") or "").lower().strip(): (r.get("answer") or "").strip()
          for r in responses}

    def find(*kws):
        for kw in kws:
            for q, a in qa.items():
                if kw in q:
                    return a or None
        return None

    return {
        "requester_name": find("name", "full name", "your name"),
        "requester_email": find("email"),
        "title": find("subject", "title", "summary", "feature", "enquiry"),
        "description": find("describe", "description", "detail", "message", "feedback", "issue", "problem", "question"),
        "agency_hint": find("agency", "department", "ministry", "organisation", "organization"),
        "priority_hint": find("priority", "urgency", "severity"),
    }


def _resolve_agency(agency_hint: str | None, email: str | None) -> int | None:
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
    if not submission_id:
        return jsonify({"error": "Missing submissionId"}), 400

    existing = db.session.scalar(db.select(Issue).where(Issue.source_ref == submission_id))
    if existing:
        return jsonify({"ok": True, "issue_id": existing.id, "duplicate": True})

    form_key = os.getenv("FORMSG_SECRET_KEY", "")
    encrypted_content = data.get("encryptedContent")

    if encrypted_content and form_key:
        # Storage mode: decrypt with the form's private key
        decrypted = _decrypt_formsg(encrypted_content, form_key)
        responses = decrypted if isinstance(decrypted, list) else []
    else:
        # Email mode or dev smoke-test: plain-text responses
        responses = data.get("responses", [])

    fields = _map_responses(responses)
    agency_id = _resolve_agency(fields.get("agency_hint"), fields.get("requester_email"))
    if agency_id is None:
        return jsonify({"error": "Cannot resolve agency"}), 422

    title = fields.get("title") or f"FormSG submission {submission_id[:8]}"
    description = (
        fields.get("description")
        or "\n".join(f"{r.get('question')}: {r.get('answer')}" for r in responses)
        or "No description provided."
    )

    # Extract FormSG submission timestamp from the webhook payload
    submitted_at = None
    created_timestamp = data.get("created")
    if created_timestamp:
        try:
            # FormSG provides timestamps in ISO 8601 format (e.g., "2026-06-14T10:00:00.000Z")
            submitted_at = datetime.fromisoformat(created_timestamp.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            pass  # If parsing fails, submitted_at remains None

    _priority_map = {
        "low": Priority.Low, "medium": Priority.Medium,
        "high": Priority.High, "urgent": Priority.Urgent,
    }
    priority_hint = (fields.get("priority_hint") or "").lower().strip()
    initial_priority = _priority_map.get(priority_hint, Priority.Medium)

    issue = Issue(
        title=title[:500], description=description,
        source=Source.formsg, source_ref=submission_id,
        status=Status.Backlog, priority=initial_priority, agency_id=agency_id,
        requester_name=fields.get("requester_name"),
        requester_email=fields.get("requester_email"),
        submitted_at=submitted_at,
    )
    db.session.add(issue)
    db.session.commit()
    audit_service.log("issue_created_from_formsg", issue=issue, detail={"submission_id": submission_id})

    if os.getenv("ANTHROPIC_API_KEY"):
        triage_in_background(current_app._get_current_object(), issue.id)

    return jsonify({"ok": True, "issue_id": issue.id}), 201
