# apps/backend/app/services/feedback_service.py
import sqlalchemy as sa
from ..extensions import db
from ..models.draft_feedback import DraftFeedback
from ..models.issue import Issue


class FeedbackService:
    def record_feedback(
        self,
        issue_id: int,
        proposed_action_id: int | None,
        original_draft: str,
        feedback_category: str,
        final_approved_version: str | None = None,
        reviewer_notes: str | None = None,
    ) -> DraftFeedback:
        issue = db.session.get(Issue, issue_id)
        agency_id = issue.agency_id if issue else None
        ticket_category = issue.issue_type.value if issue and issue.issue_type else None
        product_area = issue.product.value if issue and issue.product else None

        record = DraftFeedback(
            issue_id=issue_id,
            proposed_action_id=proposed_action_id,
            agency_id=agency_id,
            original_draft=original_draft,
            final_approved_version=final_approved_version,
            feedback_category=feedback_category,
            reviewer_notes=reviewer_notes,
            ticket_category=ticket_category,
            product_area=product_area,
        )
        db.session.add(record)
        db.session.commit()
        return record

    def list_feedback(self, agency_id: int | None = None, limit: int = 50) -> list[DraftFeedback]:
        q = db.select(DraftFeedback).order_by(DraftFeedback.created_at.desc()).limit(limit)
        if agency_id is not None:
            q = q.where(DraftFeedback.agency_id == agency_id)
        return list(db.session.scalars(q).all())

    def get_approved_examples(self, agency_id: int | None = None, limit: int = 20) -> list[dict]:
        q = (
            db.select(DraftFeedback)
            .where(DraftFeedback.feedback_category == "approved_as_is")
            .order_by(DraftFeedback.created_at.desc())
            .limit(limit)
        )
        if agency_id is not None:
            q = q.where(DraftFeedback.agency_id == agency_id)
        rows = db.session.scalars(q).all()
        return [
            {
                "original_draft": r.original_draft,
                "final_approved_version": r.final_approved_version,
                "ticket_category": r.ticket_category,
                "product_area": r.product_area,
            }
            for r in rows
        ]


feedback_service = FeedbackService()
