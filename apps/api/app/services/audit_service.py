# apps/api/app/services/audit_service.py
import sys
import json
from ..extensions import db
from ..models.audit_log import AuditLog


class AuditService:
    def log(self, action, user=None, issue=None, detail=None):
        """Write an audit row. Never raises — logs failures to stderr."""
        try:
            safe_detail = None
            if detail is not None:
                json.dumps(detail)  # validate serializable
                safe_detail = detail
            row = AuditLog(
                action=action,
                user_id=user.id if user is not None else None,
                issue_id=issue.id if issue is not None else None,
                agency_id=getattr(issue, "agency_id", None) if issue is not None else None,
                detail=safe_detail,
            )
            db.session.add(row)
            db.session.commit()
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            print(f"[audit] failed to log {action!r}: {exc}", file=sys.stderr)


audit_service = AuditService()
