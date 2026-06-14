# apps/api/app/services/issue_service.py
from ..extensions import db
from ..models.issue import Issue, Status, Priority, Product, Source
from ..models.ticket_message import TicketMessage, Direction
from ..models.knowledge_entry import KnowledgeEntry, SourceType, Visibility
from ..models.agency import UserAgencyAccess
from .audit_service import audit_service
from .email_service import email_service

WRITE_ROLES = {"PM", "Product Ops", "Admin"}


class IssueService:
    def allowed_agencies(self, user) -> list[int] | None:
        """Return list of agency IDs the user may see, or None meaning ALL (Admin)."""
        role = user.role.name if user.role else None
        if role == "Admin":
            return None
        rows = db.session.scalars(
            db.select(UserAgencyAccess.agency_id).where(UserAgencyAccess.user_id == user.id)
        ).all()
        return list(rows)

    def _require_write(self, user):
        role = user.role.name if user.role else None
        if role not in WRITE_ROLES:
            raise PermissionError("Role not allowed to modify tickets")

    def list_issues(self, user, status=None, product=None, search=None, page=1, per_page=25):
        q = db.select(Issue)
        allowed = self.allowed_agencies(user)
        if allowed is not None:
            if not allowed:
                return {"items": [], "total": 0, "page": page, "per_page": per_page}
            q = q.where(Issue.agency_id.in_(allowed))
        if status:
            q = q.where(Issue.status == Status(status))
        if product:
            q = q.where(Issue.product == Product(product))
        if search:
            like = f"%{search}%"
            q = q.where(db.or_(Issue.title.ilike(like), Issue.description.ilike(like)))
        total = db.session.scalar(db.select(db.func.count()).select_from(q.subquery()))
        rows = db.session.scalars(
            q.order_by(Issue.created_at.desc()).limit(per_page).offset((page - 1) * per_page)
        ).all()
        return {"items": rows, "total": total, "page": page, "per_page": per_page}

    def get_issue(self, user, issue_id) -> Issue:
        issue = db.session.get(Issue, issue_id)
        if issue is None:
            raise LookupError("Issue not found")
        allowed = self.allowed_agencies(user)
        if allowed is not None and issue.agency_id not in allowed:
            raise PermissionError("Out of agency scope")
        return issue

    def create_issue(self, user, data) -> Issue:
        agency_id = data["agency_id"]
        allowed = self.allowed_agencies(user)
        if allowed is not None and agency_id not in allowed:
            raise PermissionError("Out of agency scope")
        issue = Issue(
            title=data["title"], description=data["description"], agency_id=agency_id,
            status=Status(data.get("status", "Backlog")),
            priority=Priority(data.get("priority", "Medium")),
            source=Source(data.get("source", "web")),
            requester_name=data.get("requester_name"),
            requester_email=data.get("requester_email"),
        )
        db.session.add(issue); db.session.commit()
        audit_service.log("issue_created", user=user, issue=issue)
        return issue

    def update_status(self, user, issue_id, status) -> Issue:
        self._require_write(user)
        issue = self.get_issue(user, issue_id)
        issue.status = Status(status)
        db.session.commit()
        audit_service.log("status_changed", user=user, issue=issue, detail={"status": status})
        return issue

    def update_assignee(self, user, issue_id, assignee_id) -> Issue:
        self._require_write(user)
        issue = self.get_issue(user, issue_id)
        issue.assignee_id = assignee_id
        db.session.commit()
        audit_service.log("assignee_changed", user=user, issue=issue, detail={"assignee_id": assignee_id})
        return issue

    def add_internal_note(self, user, issue_id, body) -> TicketMessage:
        issue = self.get_issue(user, issue_id)
        msg = TicketMessage(issue_id=issue.id, direction=Direction.note,
                            sender_name=user.name, body=body)
        db.session.add(msg); db.session.commit()
        audit_service.log("note_added", user=user, issue=issue)
        return msg

    def list_messages(self, user, issue_id) -> list[TicketMessage]:
        issue = self.get_issue(user, issue_id)
        return db.session.scalars(
            db.select(TicketMessage).where(TicketMessage.issue_id == issue.id)
            .order_by(TicketMessage.created_at.asc())
        ).all()

    def approve_and_send(self, user, issue_id, body) -> Issue:
        self._require_write(user)
        issue = self.get_issue(user, issue_id)
        db.session.add(TicketMessage(issue_id=issue.id, direction=Direction.outbound,
                                     sender_name=user.name, body=body))
        if issue.requester_email:
            email_service.send(to=issue.requester_email,
                               subject=f"Re: {issue.title}", body=body)
        issue.status = Status.Done
        issue.resolution_summary = body[:500]
        db.session.add(KnowledgeEntry(
            title=issue.title,
            content=f"PROBLEM: {issue.description}\nRESOLUTION: {body}",
            source_type=SourceType.resolved_ticket, issue_id=issue.id,
            agency_id=issue.agency_id, visibility=Visibility.agency_specific,
        ))
        db.session.commit()
        audit_service.log("reply_sent", user=user, issue=issue)
        return issue


issue_service = IssueService()
