def _seed_reply_proposal(app, agency_id):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    from app.models.proposed_action import ActionType
    from app.services.approval_service import approval_service
    with app.app_context():
        issue = Issue(title="t", description="d", status=Status.Backlog,
                      priority=Priority.Low, source=Source.web, agency_id=agency_id,
                      requester_email="r@x.gov.sg")
        db.session.add(issue); db.session.commit()
        p = approval_service.propose(ActionType.reply, issue, {"body": "hi"}, "agent:triage")
        return p.id


def test_list_requires_auth(client):
    assert client.get("/approvals").status_code == 401


def test_pm_scoped_list(client, app, agencies, pm_token):
    _seed_reply_proposal(app, agencies["MOH"])
    _seed_reply_proposal(app, agencies["NEA"])
    rv = client.get("/approvals", headers={"Authorization": f"Bearer {pm_token}"})
    assert rv.status_code == 200
    assert rv.get_json()["total"] == 1  # only MOH


def test_pm_cannot_approve_admin_tier(client, app, agencies, pm_token):
    pid = _seed_reply_proposal(app, agencies["MOH"])
    rv = client.post(f"/approvals/{pid}/approve",
                     headers={"Authorization": f"Bearer {pm_token}"}, json={})
    assert rv.status_code == 403


def test_admin_approves_reply(client, app, agencies, admin_token, monkeypatch):
    import app.services.issue_service as isvc
    monkeypatch.setattr(isvc.email_service, "send",
                        lambda **kw: {"provider": "dev-console"})
    pid = _seed_reply_proposal(app, agencies["MOH"])
    rv = client.post(f"/approvals/{pid}/approve",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     json={"final_payload": {"body": "ok done"}})
    assert rv.status_code == 200
    assert rv.get_json()["status"] == "executed"


def test_reject_empty_reason_is_400(client, app, agencies, admin_token):
    pid = _seed_reply_proposal(app, agencies["MOH"])
    rv = client.post(f"/approvals/{pid}/reject",
                     headers={"Authorization": f"Bearer {admin_token}"}, json={"reason": ""})
    assert rv.status_code == 400
