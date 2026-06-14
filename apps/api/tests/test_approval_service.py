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


def _mk_issue(db, agency_id, **kw):
    from app.models.issue import Issue, Status, Priority, Source
    issue = Issue(title=kw.get("title", "t"), description="d", status=Status.Backlog,
                  priority=Priority.Low, source=Source.web, agency_id=agency_id,
                  requester_email=kw.get("email"))
    db.session.add(issue); db.session.commit()
    return issue


def test_required_tier_policy(app, agencies):
    from app.extensions import db
    from app.models.proposed_action import ActionType, ApprovalTier
    from app.services.approval_service import approval_service
    with app.app_context():
        issue = _mk_issue(db, agencies["MOH"])
        rt = approval_service.required_tier
        assert rt(ActionType.reply, {"body": "x"}, issue) == ApprovalTier.admin
        assert rt(ActionType.status_change, {"status": "Done"}, issue) == ApprovalTier.human
        assert rt(ActionType.assignment, {"assignee_id": 1}, issue) == ApprovalTier.human
        # same-agency tag -> auto; different-agency tag -> admin
        assert rt(ActionType.tag_change, {"agency_id": agencies["MOH"]}, issue) == ApprovalTier.auto
        assert rt(ActionType.tag_change, {"agency_id": agencies["NEA"]}, issue) == ApprovalTier.admin
        assert rt(ActionType.internal_note, {"body": "n"}, issue) == ApprovalTier.auto


def test_propose_admin_tier_stays_pending(app, agencies):
    from app.extensions import db
    from app.models.proposed_action import ActionType, ProposalStatus
    from app.services.approval_service import approval_service
    with app.app_context():
        issue = _mk_issue(db, agencies["MOH"])
        p = approval_service.propose(ActionType.reply, issue, {"body": "draft"}, "agent:triage")
        assert p.status == ProposalStatus.pending
        assert p.required_tier.value == "admin"


def test_propose_auto_tier_executes_immediately(app, agencies):
    from app.extensions import db
    from app.models.issue import IssueAgency
    from app.models.proposed_action import ActionType, ProposalStatus
    from app.services.approval_service import approval_service
    with app.app_context():
        issue = _mk_issue(db, agencies["MOH"])
        # same-agency tag -> auto -> executes on propose
        p = approval_service.propose(
            ActionType.tag_change, issue, {"agency_id": agencies["MOH"]}, "agent:hermes")
        assert p.status == ProposalStatus.executed
        row = db.session.scalar(db.select(IssueAgency).where(
            IssueAgency.issue_id == issue.id, IssueAgency.agency_id == agencies["MOH"]))
        assert row is not None


def test_list_proposals_agency_scoped(app, agencies, pm_user):
    from app.extensions import db
    from app.models.proposed_action import ActionType
    from app.services.approval_service import approval_service
    with app.app_context():
        moh = _mk_issue(db, agencies["MOH"])
        nea = _mk_issue(db, agencies["NEA"])
        approval_service.propose(ActionType.reply, moh, {"body": "a"}, "agent:triage")
        approval_service.propose(ActionType.reply, nea, {"body": "b"}, "agent:triage")
        pm = db.session.merge(pm_user)  # PM scoped to MOH
        result = approval_service.list_proposals(pm)
        assert result["total"] == 1
        assert result["items"][0].issue_id == moh.id
