# apps/api/app/routes/agencies.py
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.user import User
from ..models.agency import Agency
from ..models.issue import Issue, IssueAgency, Status
from ..services.issue_service import issue_service

bp = Blueprint("agencies", __name__, url_prefix="/agencies")


@bp.get("")
@jwt_required()
def list_agencies():
    user = db.session.get(User, int(get_jwt_identity()))
    allowed = issue_service.allowed_agencies(user)  # None = all

    aq = db.select(Agency)
    if allowed is not None:
        aq = aq.where(Agency.id.in_(allowed or [-1]))
    agencies = db.session.scalars(aq).all()

    out = []
    for a in agencies:
        counts = {}
        for st in (Status.Backlog, Status.InProgress, Status.Done):
            counts[st.value] = db.session.scalar(
                db.select(db.func.count()).select_from(Issue)
                .where(Issue.agency_id == a.id, Issue.status == st)
            )
        out.append({"id": a.id, "code": a.code, "name": a.name, "counts": counts})

    tq = (
        db.select(IssueAgency.issue_id,
                  db.func.count(db.distinct(IssueAgency.agency_id)).label("n"))
        .group_by(IssueAgency.issue_id)
        .order_by(db.text("n DESC")).limit(8)
    )
    if allowed is not None:
        tq = tq.where(IssueAgency.agency_id.in_(allowed or [-1]))
    rows = db.session.execute(tq).all()
    top = []
    for issue_id, n in rows:
        issue = db.session.get(Issue, issue_id)
        if issue:
            top.append({"id": issue.id, "title": issue.title,
                        "distinct_agency_count": n, "status": issue.status.value})

    return jsonify({"agencies": out, "top_requests": top})
