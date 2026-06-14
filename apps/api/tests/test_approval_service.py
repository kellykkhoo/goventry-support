def test_proposed_action_persists(app, agencies):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    from app.models.proposed_action import (
        ProposedAction, ActionType, ProposalStatus, ApprovalTier,
    )
    with app.app_context():
        issue = Issue(title="t", description="d", status=Status.Backlog,
                      priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"])
        db.session.add(issue); db.session.commit()
        p = ProposedAction(
            action_type=ActionType.reply, issue_id=issue.id, proposer="agent:triage",
            proposed_payload={"body": "hi"}, required_tier=ApprovalTier.admin,
            status=ProposalStatus.pending,
        )
        db.session.add(p); db.session.commit()
        assert p.id is not None
        assert p.status == ProposalStatus.pending
        assert p.proposed_payload["body"] == "hi"
        assert p.created_at is not None
