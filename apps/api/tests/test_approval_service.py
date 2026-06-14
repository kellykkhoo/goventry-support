def test_add_agency_tag_creates_row(app, agencies):
    from app.extensions import db
    from app.models.issue import Issue, IssueAgency, Status, Priority, Source
    from app.models.user import User
    from app.models.role import Role
    from app.services.issue_service import issue_service
    with app.app_context():
        admin = User(email="a3@test.com", name="A3",
                     role=db.session.scalar(db.select(Role).where(Role.name == "Admin")))
        issue = Issue(title="t", description="d", status=Status.Backlog,
                      priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"])
        db.session.add_all([admin, issue]); db.session.commit()
        issue_service.add_agency_tag(admin, issue.id, agencies["NEA"])
        row = db.session.scalar(db.select(IssueAgency).where(
            IssueAgency.issue_id == issue.id, IssueAgency.agency_id == agencies["NEA"]))
        assert row is not None
        # idempotent: second call does not raise or duplicate
        issue_service.add_agency_tag(admin, issue.id, agencies["NEA"])
        count = db.session.scalar(db.select(db.func.count()).select_from(IssueAgency).where(
            IssueAgency.issue_id == issue.id, IssueAgency.agency_id == agencies["NEA"]))
        assert count == 1


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
