import pytest


def test_pm_cannot_see_other_agency_issue(app, agencies, pm_user):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    from app.services.issue_service import issue_service
    with app.app_context():
        nea_issue = Issue(title="NEA only", description="x", status=Status.Backlog,
                          priority=Priority.Low, source=Source.web, agency_id=agencies["NEA"])
        db.session.add(nea_issue); db.session.commit()
        nea_id = nea_issue.id
        pm = db.session.merge(pm_user)
        with pytest.raises(PermissionError):
            issue_service.get_issue(pm, nea_id)


def test_admin_sees_all_agencies(app, agencies, admin_user):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    from app.services.issue_service import issue_service
    with app.app_context():
        db.session.add_all([
            Issue(title="MOH", description="x", status=Status.Backlog, priority=Priority.Low,
                  source=Source.web, agency_id=agencies["MOH"]),
            Issue(title="NEA", description="x", status=Status.Backlog, priority=Priority.Low,
                  source=Source.web, agency_id=agencies["NEA"]),
        ])
        db.session.commit()
        admin = db.session.merge(admin_user)
        result = issue_service.list_issues(admin)
        assert result["total"] == 2


def test_approve_and_send_creates_message_and_kb(app, agencies, monkeypatch):
    from app.extensions import db
    from app.models.issue import Issue, Status, Source, Priority
    from app.models.user import User
    from app.models.role import Role
    from app.models.ticket_message import TicketMessage, Direction
    from app.models.knowledge_entry import KnowledgeEntry
    import app.services.issue_service as mod

    sent = {}
    monkeypatch.setattr(mod.email_service, "send",
                        lambda **kw: sent.update(kw) or {"provider": "dev-console"})

    with app.app_context():
        admin_role = db.session.scalar(db.select(Role).where(Role.name == "Admin"))
        admin = User(email="a2@test.com", name="A2", role=admin_role)
        issue = Issue(title="Help", description="problem text", status=Status.Backlog,
                      priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"],
                      requester_email="user@moh.gov.sg")
        db.session.add_all([admin, issue]); db.session.commit()

        result = mod.issue_service.approve_and_send(admin, issue.id, "Here is your fix.")
        assert result.status == Status.Done
        assert result.resolution_summary == "Here is your fix."
        assert sent["to"] == "user@moh.gov.sg"
        msgs = db.session.scalars(db.select(TicketMessage)).all()
        assert any(m.direction == Direction.outbound for m in msgs)
        kbs = db.session.scalars(db.select(KnowledgeEntry)).all()
        assert len(kbs) == 1
        assert "problem text" in kbs[0].content


def test_audit_log_writes_row(app, agencies):
    from app.extensions import db
    from app.services.audit_service import audit_service
    from app.models.audit_log import AuditLog
    with app.app_context():
        audit_service.log("status_changed", user=None, detail={"to": "Done"})
        rows = db.session.scalars(db.select(AuditLog)).all()
        assert len(rows) == 1
        assert rows[0].action == "status_changed"


def test_audit_log_never_raises(app):
    from app.services.audit_service import audit_service
    with app.app_context():
        # Passing an un-JSON-able detail must not raise
        audit_service.log("weird", user=None, detail={"obj": object()})


def test_remaining_models_persist(app, agencies):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    from app.models.ticket_message import TicketMessage, Direction
    from app.models.knowledge_entry import KnowledgeEntry, SourceType, Visibility
    from app.models.audit_log import AuditLog
    with app.app_context():
        issue = Issue(title="t", description="d", status=Status.Backlog,
                      priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"])
        db.session.add(issue); db.session.commit()
        msg = TicketMessage(issue_id=issue.id, direction=Direction.note,
                            sender_name="Kelly", body="looking into it")
        ke = KnowledgeEntry(title="How to log in", content="...",
                            source_type=SourceType.doc, visibility=Visibility.global_sanitized)
        al = AuditLog(action="note_added", issue_id=issue.id, detail={"x": 1})
        db.session.add_all([msg, ke, al]); db.session.commit()
        assert msg.id and ke.id and al.id
        assert msg.direction == Direction.note


def test_issue_persists_with_enums(app, agencies):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Product, IssueType, Source
    with app.app_context():
        issue = Issue(
            title="Cannot log in", description="SSO fails",
            status=Status.Backlog, priority=Priority.High,
            product=Product.GovEntry, issue_type=IssueType.Bug,
            source=Source.web, requester_name="Jane", requester_email="jane@moh.gov.sg",
            agency_id=agencies["MOH"],
        )
        db.session.add(issue)
        db.session.commit()
        assert issue.id is not None
        assert issue.status == Status.Backlog
        assert issue.created_at is not None


def test_team_member_persists(app):
    from app.extensions import db
    from app.models.team_member import TeamMember
    with app.app_context():
        tm = TeamMember(name="Roy Tan", role_label="PM")
        db.session.add(tm)
        db.session.commit()
        assert tm.id is not None
        assert tm.role_label == "PM"
