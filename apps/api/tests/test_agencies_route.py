def test_agencies_counts_and_top_requests(client, app, agencies, admin_token):
    from app.extensions import db
    from app.models.issue import Issue, IssueAgency, Status, Priority, Source
    with app.app_context():
        i1 = Issue(title="Shared request", description="d", status=Status.Backlog,
                   priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"])
        i2 = Issue(title="Solo", description="d", status=Status.Done,
                   priority=Priority.Low, source=Source.web, agency_id=agencies["NEA"])
        db.session.add_all([i1, i2]); db.session.commit()
        db.session.add_all([
            IssueAgency(issue_id=i1.id, agency_id=agencies["MOH"]),
            IssueAgency(issue_id=i1.id, agency_id=agencies["NEA"]),
            IssueAgency(issue_id=i2.id, agency_id=agencies["NEA"]),
        ])
        db.session.commit()
    rv = client.get("/agencies", headers={"Authorization": f"Bearer {admin_token}"})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["top_requests"][0]["title"] == "Shared request"
    assert len(data["agencies"]) >= 2
