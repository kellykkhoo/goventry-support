# apps/backend/app/services/report_service.py
from datetime import date, datetime, timezone
import sqlalchemy as sa
from ..extensions import db
from ..models.issue import Issue, Status, Priority


def generate_daily_report(agency_id: int | None = None) -> dict:
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    today_end = datetime.combine(date.today(), datetime.max.time()).replace(tzinfo=timezone.utc)

    base_q = db.select(Issue)
    if agency_id is not None:
        base_q = base_q.where(Issue.agency_id == agency_id)

    # Issues created today
    new_today_q = base_q.where(Issue.created_at >= today_start, Issue.created_at <= today_end)
    new_today = db.session.scalar(sa.select(sa.func.count()).select_from(new_today_q.subquery()))

    # Open issues (not Done or Cancelled)
    open_statuses = [Status.Backlog, Status.InProgress]
    open_q = base_q.where(Issue.status.in_(open_statuses))
    open_total = db.session.scalar(sa.select(sa.func.count()).select_from(open_q.subquery()))

    # By status — count all issues per status
    by_status: dict[str, int] = {}
    for status in Status:
        count_q = base_q.where(Issue.status == status)
        count = db.session.scalar(sa.select(sa.func.count()).select_from(count_q.subquery()))
        by_status[status.value] = count or 0

    # By priority — count all issues per priority
    by_priority: dict[str, int] = {}
    for priority in Priority:
        count_q = base_q.where(Issue.priority == priority)
        count = db.session.scalar(sa.select(sa.func.count()).select_from(count_q.subquery()))
        by_priority[priority.value] = count or 0

    # Top 5 open issues by created_at desc
    top_open_rows = db.session.scalars(
        open_q.order_by(Issue.created_at.desc()).limit(5)
    ).all()
    top_open = [
        {"id": i.id, "title": i.title, "priority": i.priority.value, "status": i.status.value}
        for i in top_open_rows
    ]

    return {
        "date": date.today().isoformat(),
        "agency_id": agency_id,
        "new_today": new_today or 0,
        "open_total": open_total or 0,
        "by_status": by_status,
        "by_priority": by_priority,
        "top_open": top_open,
    }


def generate_weekly_report(agency_id: int | None = None) -> dict:
    from datetime import timedelta
    today = date.today()
    week_start = today - timedelta(days=6)
    week_start_dt = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    week_end_dt = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc)

    base_q = db.select(Issue)
    if agency_id is not None:
        base_q = base_q.where(Issue.agency_id == agency_id)

    new_q = base_q.where(Issue.created_at >= week_start_dt, Issue.created_at <= week_end_dt)
    new_this_week = db.session.scalar(sa.select(sa.func.count()).select_from(new_q.subquery())) or 0

    resolved_q = base_q.where(
        Issue.status == Status.Done,
        Issue.created_at >= week_start_dt,
        Issue.created_at <= week_end_dt,
    )
    resolved_this_week = db.session.scalar(sa.select(sa.func.count()).select_from(resolved_q.subquery())) or 0

    open_statuses = [Status.Backlog, Status.InProgress]
    open_q = base_q.where(Issue.status.in_(open_statuses))
    open_total = db.session.scalar(sa.select(sa.func.count()).select_from(open_q.subquery())) or 0

    by_status: dict[str, int] = {}
    for status in Status:
        count = db.session.scalar(
            sa.select(sa.func.count()).select_from(base_q.where(Issue.status == status).subquery())
        )
        by_status[status.value] = count or 0

    by_priority: dict[str, int] = {}
    for priority in Priority:
        count = db.session.scalar(
            sa.select(sa.func.count()).select_from(base_q.where(Issue.priority == priority).subquery())
        )
        by_priority[priority.value] = count or 0

    top_open_rows = db.session.scalars(
        open_q.order_by(Issue.created_at.desc()).limit(5)
    ).all()
    top_open = [
        {"id": i.id, "title": i.title, "priority": i.priority.value, "status": i.status.value}
        for i in top_open_rows
    ]

    return {
        "week_start": week_start.isoformat(),
        "week_end": today.isoformat(),
        "agency_id": agency_id,
        "new_this_week": new_this_week,
        "resolved_this_week": resolved_this_week,
        "open_total": open_total,
        "by_status": by_status,
        "by_priority": by_priority,
        "top_open": top_open,
    }
