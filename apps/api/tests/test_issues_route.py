def test_list_requires_auth(client):
    assert client.get("/issues").status_code == 401


def test_pm_scoped_list(client, app, agencies, pm_token):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    with app.app_context():
        db.session.add_all([
            Issue(title="MOH one", description="d", status=Status.Backlog,
                  priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"]),
            Issue(title="NEA one", description="d", status=Status.Backlog,
                  priority=Priority.Low, source=Source.web, agency_id=agencies["NEA"]),
        ])
        db.session.commit()
    rv = client.get("/issues", headers={"Authorization": f"Bearer {pm_token}"})
    assert rv.status_code == 200
    titles = [i["title"] for i in rv.get_json()["items"]]
    assert "MOH one" in titles and "NEA one" not in titles


def test_triage_endpoint_returns_ok(client, app, agencies, pm_token, monkeypatch):
    import app.routes.issues as mod
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    monkeypatch.setattr(mod, "triage_in_background", lambda app_, iid: None)
    with app.app_context():
        issue = Issue(title="T", description="d", status=Status.Backlog,
                      priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"])
        db.session.add(issue); db.session.commit()
        iid = issue.id
    rv = client.post(f"/issues/{iid}/triage", headers={"Authorization": f"Bearer {pm_token}"})
    assert rv.status_code == 200 and rv.get_json()["ok"] is True
