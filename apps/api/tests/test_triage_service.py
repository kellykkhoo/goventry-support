import json


def test_run_triage_creates_reply_proposal(app, agencies, monkeypatch):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    from app.models.proposed_action import ProposedAction, ActionType, ProposalStatus
    import app.services.triage_service as mod

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    with app.app_context():
        issue = Issue(title="App crashes", description="500 error",
                      status=Status.Backlog, priority=Priority.Low, source=Source.web,
                      agency_id=agencies["MOH"])
        db.session.add(issue); db.session.commit()
        issue_id = issue.id

    final_json = {"issueType": "Bug", "product": "GovEntry", "priority": "High",
                  "duplicateOfIssueId": None, "similarTickets": [],
                  "draftReply": "We are investigating.", "confidence": 0.8,
                  "summary": "500s on submit."}
    import json as _json

    class FakeBlock:
        type = "text"; text = _json.dumps(final_json)
    class FakeMessage:
        stop_reason = "end_turn"; content = [FakeBlock()]
    class FakeMessages:
        def create(self, **kw): return FakeMessage()
    class FakeClient:
        messages = FakeMessages()
    monkeypatch.setattr(mod, "_build_client", lambda: FakeClient())

    with app.app_context():
        mod.run_triage(issue_id)
        refreshed = db.session.get(Issue, issue_id)
        assert refreshed.priority == Priority.High
        assert refreshed.triaged_at is not None
        proposals = db.session.scalars(db.select(ProposedAction).where(
            ProposedAction.issue_id == issue_id)).all()
        assert len(proposals) == 1
        assert proposals[0].action_type == ActionType.reply
        assert proposals[0].status == ProposalStatus.pending
        assert proposals[0].proposed_payload["body"] == "We are investigating."

        # re-triage updates existing proposal, no duplicate
        mod.run_triage(issue_id)
        proposals2 = db.session.scalars(db.select(ProposedAction).where(
            ProposedAction.issue_id == issue_id)).all()
        assert len(proposals2) == 1


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
