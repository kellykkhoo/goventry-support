# apps/backend/tests/test_webhooks.py
import json

_RESPONSES = [
    {"question": "Name", "answer": "Jane Tan"},
    {"question": "Email", "answer": "jane@moh.gov.sg"},
    {"question": "Subject", "answer": "Cannot log in to GovEntry"},
    {"question": "Description of issue", "answer": "500 error on form submit."},
    {"question": "Agency", "answer": "MOH"},
]


def _payload(submission_id="sub-test-001", responses=None):
    return json.dumps({
        "data": {
            "submissionId": submission_id,
            "created": "2026-06-14T10:00:00.000Z",
            "responses": responses or _RESPONSES,
        }
    })


def _post(client, payload, headers=None):
    return client.post(
        "/webhooks/formsg",
        data=payload,
        content_type="application/json",
        headers=headers or {},
    )


def test_no_secret_key_accepts_submission(client, app, agencies, monkeypatch):
    monkeypatch.delenv("FORMSG_SECRET_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    rv = _post(client, _payload())
    assert rv.status_code == 201
    assert rv.get_json()["ok"] is True


def test_creates_issue_with_correct_fields(client, app, agencies, monkeypatch):
    from app.extensions import db
    from app.models.issue import Issue, Source, Status

    monkeypatch.delenv("FORMSG_SECRET_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    rv = _post(client, _payload())
    assert rv.status_code == 201
    issue_id = rv.get_json()["issue_id"]

    with app.app_context():
        issue = db.session.get(Issue, issue_id)
        assert issue.source == Source.formsg
        assert issue.source_ref == "sub-test-001"
        assert issue.requester_name == "Jane Tan"
        assert issue.requester_email == "jane@moh.gov.sg"
        assert "Cannot log in" in issue.title
        assert issue.status == Status.Backlog
        assert issue.agency_id == agencies["MOH"]


def test_idempotent_on_duplicate_submission_id(client, app, agencies, monkeypatch):
    monkeypatch.delenv("FORMSG_SECRET_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    p = _payload("sub-dup-001")
    rv1 = _post(client, p)
    rv2 = _post(client, p)

    assert rv1.status_code == 201
    assert rv2.status_code == 200
    assert rv2.get_json()["duplicate"] is True
    assert rv1.get_json()["issue_id"] == rv2.get_json()["issue_id"]


def test_invalid_signature_rejected(client, app, agencies, monkeypatch):
    monkeypatch.setenv("FORMSG_SECRET_KEY", "dGVzdHNlY3JldA==")  # base64("testsecret")
    monkeypatch.setenv("FORMSG_WEBHOOK_URI", "https://example.com/webhooks/formsg")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    rv = _post(client, _payload("sub-bad-sig"),
               headers={"X-FormSG-Signature": "t=12345,s=badsignature"})
    assert rv.status_code == 401


def test_email_domain_resolves_agency(client, app, agencies, monkeypatch):
    from app.extensions import db
    from app.models.issue import Issue

    monkeypatch.delenv("FORMSG_SECRET_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    # No "Agency" field — rely on email domain nea.gov.sg → NEA
    responses = [
        {"question": "Email", "answer": "officer@nea.gov.sg"},
        {"question": "Subject", "answer": "Bin collection missed"},
        {"question": "Description", "answer": "No bin collected this week."},
    ]
    rv = _post(client, _payload("sub-nea-001", responses))
    assert rv.status_code == 201

    with app.app_context():
        issue = db.session.get(Issue, rv.get_json()["issue_id"])
        assert issue.agency_id == agencies["NEA"]


def test_missing_submission_id_returns_400(client, app, agencies, monkeypatch):
    monkeypatch.delenv("FORMSG_SECRET_KEY", raising=False)
    bad = json.dumps({"data": {"responses": _RESPONSES}})
    rv = _post(client, bad)
    assert rv.status_code == 400
