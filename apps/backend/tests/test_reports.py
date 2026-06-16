# apps/backend/tests/test_reports.py
import pytest
from datetime import datetime, timezone
from app.extensions import db as _db
from app.models.issue import Issue, Status, Priority, Source


def _make_issue(agency_id, title="Test Issue", status=Status.Backlog, priority=Priority.Medium):
    return Issue(
        title=title,
        description="desc",
        status=status,
        priority=priority,
        source=Source.web,
        agency_id=agency_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_daily_report_requires_auth(client):
    rv = client.get("/reports/daily")
    assert rv.status_code == 401


def test_daily_report_non_admin_forbidden(client, pm_token):
    rv = client.get("/reports/daily", headers={"Authorization": f"Bearer {pm_token}"})
    assert rv.status_code == 403


def test_daily_report_admin_gets_report(app, client, admin_token, agencies):
    with app.app_context():
        moh_id = agencies["MOH"]
        # Add two open issues and one done issue
        _db.session.add(_make_issue(moh_id, title="Open 1", status=Status.Backlog, priority=Priority.High))
        _db.session.add(_make_issue(moh_id, title="Open 2", status=Status.InProgress, priority=Priority.Urgent))
        _db.session.add(_make_issue(moh_id, title="Done 1", status=Status.Done, priority=Priority.Low))
        _db.session.commit()

    rv = client.get("/reports/daily", headers={"Authorization": f"Bearer {admin_token}"})
    assert rv.status_code == 200
    data = rv.get_json()

    assert "date" in data
    assert "new_today" in data
    assert "open_total" in data
    assert "by_status" in data
    assert "by_priority" in data
    assert "top_open" in data

    # 3 issues created today
    assert data["new_today"] == 3
    # 2 open (Backlog + InProgress), 1 done
    assert data["open_total"] == 2
    # status counts
    assert data["by_status"]["Backlog"] == 1
    assert data["by_status"]["InProgress"] == 1
    assert data["by_status"]["Done"] == 1
    # top_open should have the 2 open issues
    assert len(data["top_open"]) == 2


def test_daily_report_agency_filter(app, client, admin_token, agencies):
    with app.app_context():
        moh_id = agencies["MOH"]
        nea_id = agencies["NEA"]
        _db.session.add(_make_issue(moh_id, title="MOH issue"))
        _db.session.add(_make_issue(nea_id, title="NEA issue"))
        _db.session.commit()

    rv = client.get(
        f"/reports/daily?agency_id={agencies['MOH']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["agency_id"] == agencies["MOH"]
    assert data["new_today"] == 1
    assert data["open_total"] == 1
