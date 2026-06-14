# apps/api/app/services/approval_service.py
from datetime import datetime, timezone
from ..extensions import db
from ..models.proposed_action import (
    ProposedAction, ActionType, ProposalStatus, ApprovalTier,
)
from ..models.issue import Issue, IssueAgency
from ..models.ticket_message import TicketMessage, Direction
from .issue_service import issue_service
from .audit_service import audit_service

ADMIN = "Admin"
WRITE_ROLES = {"PM", "Product Ops", "Admin"}


class ApprovalService:
    # --- policy ---
    def required_tier(self, action_type, payload, issue) -> ApprovalTier:
        if action_type == ActionType.reply:
            return ApprovalTier.admin
        if action_type in (ActionType.status_change, ActionType.assignment):
            return ApprovalTier.human
        if action_type == ActionType.internal_note:
            return ApprovalTier.auto
        if action_type == ActionType.tag_change:
            target = payload.get("agency_id")
            already = db.session.scalar(db.select(IssueAgency).where(
                IssueAgency.issue_id == issue.id, IssueAgency.agency_id == target))
            if target != issue.agency_id and already is None:
                return ApprovalTier.admin
            return ApprovalTier.auto
        return ApprovalTier.human

    # --- lifecycle ---
    def propose(self, action_type, issue, proposed_payload, proposer) -> ProposedAction:
        # Re-triage idempotency: update existing pending reply proposal
        if action_type == ActionType.reply:
            existing = db.session.scalar(db.select(ProposedAction).where(
                ProposedAction.issue_id == issue.id,
                ProposedAction.action_type == ActionType.reply,
                ProposedAction.status == ProposalStatus.pending))
            if existing is not None:
                existing.proposed_payload = proposed_payload
                existing.proposer = proposer
                db.session.commit()
                audit_service.log("proposal_updated", user=None, issue=issue,
                                  detail={"proposal_id": existing.id})
                return existing

        tier = self.required_tier(action_type, proposed_payload, issue)
        proposal = ProposedAction(
            action_type=action_type, issue_id=issue.id, proposer=proposer,
            proposed_payload=proposed_payload, required_tier=tier,
            status=ProposalStatus.pending)
        db.session.add(proposal); db.session.commit()
        audit_service.log("proposal_created", user=None, issue=issue,
                          detail={"proposal_id": proposal.id,
                                  "action_type": action_type.value, "tier": tier.value})
        if tier == ApprovalTier.auto:
            self._execute(proposal, reviewer=None)
            proposal.status = ProposalStatus.executed
            proposal.decided_at = datetime.now(timezone.utc)
            db.session.commit()
            audit_service.log("proposal_executed", user=None, issue=issue,
                              detail={"proposal_id": proposal.id})
        return proposal

    def list_proposals(self, user, status=None, action_type=None, issue_id=None,
                       page=1, per_page=25):
        q = db.select(ProposedAction).join(Issue, ProposedAction.issue_id == Issue.id)
        allowed = issue_service.allowed_agencies(user)
        if allowed is not None:
            if not allowed:
                return {"items": [], "total": 0, "page": page, "per_page": per_page}
            q = q.where(Issue.agency_id.in_(allowed))
        if status:
            q = q.where(ProposedAction.status == ProposalStatus(status))
        if action_type:
            q = q.where(ProposedAction.action_type == ActionType(action_type))
        if issue_id:
            q = q.where(ProposedAction.issue_id == issue_id)
        total = db.session.scalar(db.select(db.func.count()).select_from(q.subquery()))
        rows = db.session.scalars(
            q.order_by(ProposedAction.created_at.desc())
            .limit(per_page).offset((page - 1) * per_page)).all()
        return {"items": rows, "total": total, "page": page, "per_page": per_page}

    def get_proposal(self, user, proposal_id) -> ProposedAction:
        proposal = db.session.get(ProposedAction, proposal_id)
        if proposal is None:
            raise LookupError("Proposal not found")
        issue = db.session.get(Issue, proposal.issue_id)
        allowed = issue_service.allowed_agencies(user)
        if allowed is not None and (issue is None or issue.agency_id not in allowed):
            raise PermissionError("Out of agency scope")
        return proposal

    # --- approve/reject added in Task 5 ---

    # --- execution (dispatch) ---
    def _execute(self, proposal, reviewer) -> None:
        p = proposal.final_payload or proposal.proposed_payload
        t = proposal.action_type
        if t == ActionType.reply:
            issue_service.approve_and_send(reviewer, proposal.issue_id, p["body"])
        elif t == ActionType.status_change:
            issue_service.update_status(reviewer, proposal.issue_id, p["status"])
        elif t == ActionType.assignment:
            issue_service.update_assignee(reviewer, proposal.issue_id, p["assignee_id"])
        elif t == ActionType.tag_change:
            if reviewer is None:
                self._system_add_tag(proposal.issue_id, p["agency_id"])
            else:
                issue_service.add_agency_tag(reviewer, proposal.issue_id, p["agency_id"])
        elif t == ActionType.internal_note:
            if reviewer is None:
                self._system_add_note(proposal.issue_id, proposal.proposer, p["body"])
            else:
                issue_service.add_internal_note(reviewer, proposal.issue_id, p["body"])

    def _system_add_tag(self, issue_id, agency_id) -> None:
        exists = db.session.scalar(db.select(IssueAgency).where(
            IssueAgency.issue_id == issue_id, IssueAgency.agency_id == agency_id))
        if exists is None:
            db.session.add(IssueAgency(issue_id=issue_id, agency_id=agency_id))
            db.session.commit()

    def _system_add_note(self, issue_id, proposer, body) -> None:
        db.session.add(TicketMessage(issue_id=issue_id, direction=Direction.note,
                                     sender_name=proposer, body=body))
        db.session.commit()


approval_service = ApprovalService()
