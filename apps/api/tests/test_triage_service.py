import json


def test_run_triage_writes_fields_back(app, agencies, monkeypatch):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    import app.services.triage_service as mod

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    with app.app_context():
        issue = Issue(title="App crashes on submit", description="500 error",
                      status=Status.Backlog, priority=Priority.Low, source=Source.web,
                      agency_id=agencies["MOH"])
        db.session.add(issue); db.session.commit()
        issue_id = issue.id

    final_json = {
        "issueType": "Bug", "product": "GovEntry", "priority": "High",
        "duplicateOfIssueId": None, "similarTickets": [],
        "draftReply": "Thanks, we are investigating.", "confidence": 0.8,
        "summary": "Submit endpoint 500s.",
    }

    class FakeBlock:
        type = "text"
        text = json.dumps(final_json)

    class FakeMessage:
        stop_reason = "end_turn"
        content = [FakeBlock()]

    class FakeMessages:
        def create(self, **kwargs):
            return FakeMessage()

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(mod, "_build_client", lambda: FakeClient())

    with app.app_context():
        mod.run_triage(issue_id)
        refreshed = db.session.get(Issue, issue_id)
        assert refreshed.ai_draft_reply == "Thanks, we are investigating."
        assert refreshed.priority == Priority.High
        assert refreshed.triaged_at is not None
        assert refreshed.ai_triage_json["summary"] == "Submit endpoint 500s."


def test_run_triage_no_api_key_is_graceful(app, agencies, monkeypatch):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    import app.services.triage_service as mod

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with app.app_context():
        issue = Issue(title="t", description="d", status=Status.Backlog,
                      priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"])
        db.session.add(issue); db.session.commit()
        issue_id = issue.id
        mod.run_triage(issue_id)  # must not raise
        assert db.session.get(Issue, issue_id).ai_draft_reply is None
