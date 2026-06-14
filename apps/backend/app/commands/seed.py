# apps/backend/app/commands/seed.py
from datetime import datetime, timezone
from ..extensions import db
from ..models.agency import Agency, UserAgencyAccess
from ..models.team_member import TeamMember
from ..models.issue import Issue, Status, Priority, Product, IssueType, Source
from ..models.knowledge_entry import KnowledgeEntry, SourceType, Visibility
from ..models.user import User


_AGENCIES = [
    ("MOH", "Ministry of Health"),
    ("NEA", "National Environment Agency"),
    ("MINDEF", "Ministry of Defence"),
    ("HDB", "Housing & Development Board"),
    ("LTA", "Land Transport Authority"),
    ("MOM", "Ministry of Manpower"),
    ("MOE", "Ministry of Education"),
    ("MFA", "Ministry of Foreign Affairs"),
    ("GOVTECH", "Government Technology Agency"),
]

_TEAM = [
    ("Roy Tan", "PM"),
    ("Kelly Khoo", "Product Ops"),
    ("Jeremy Ong", "UIUX"),
]

_ISSUES = [
    # (title, description, status, priority, product, source, agency_code,
    #  requester_name, requester_email, ai_draft_reply, summary)
    (
        "Cannot log into GovEntry portal",
        "Users are reporting SSO login failures since this morning.",
        Status.Backlog, Priority.High, Product.GovEntry, IssueType.Bug, Source.web,
        "MOH", "Jane Lim", "jane@moh.gov.sg",
        "Dear Jane, we have identified an SSO configuration issue and are working to resolve it. We expect a fix within 2 hours.",
        "SSO login failure for MOH users",
    ),
    (
        "GovSupply vendor onboarding process is unclear",
        "New vendors are confused by the multi-step registration flow.",
        Status.InProgress, Priority.Medium, Product.GovSupply, IssueType.UserGuideQuestion, Source.web,
        "NEA", "David Ng", "david@nea.gov.sg",
        "Dear David, we are updating the vendor onboarding guide and will share a revised version shortly.",
        "Unclear vendor onboarding UX",
    ),
    (
        "GovRewards points not credited after purchase",
        "Agency staff completed purchases but rewards points were not reflected in their accounts.",
        Status.Done, Priority.High, Product.GovRewards, IssueType.Bug, Source.formsg,
        "HDB", "Mary Tan", "mary@hdb.gov.sg",
        None, None,
    ),
    (
        "Request for bulk export of procurement data",
        "Need to export 12 months of GovSupply transaction history for audit purposes.",
        Status.Backlog, Priority.Medium, Product.GovSupply, IssueType.FeatureRequest, Source.intake,
        "MINDEF", "CPT Singh", "singh@mindef.gov.sg",
        "Dear CPT Singh, we are evaluating bulk export functionality for a future release.",
        "Bulk export feature request for MINDEF audit",
    ),
    (
        "GovEntry registration event for new hires",
        "We have 200 new hires joining next month and need to register them for GovEntry access.",
        Status.InProgress, Priority.Urgent, Product.GovEntry, IssueType.RegistrationEvent, Source.goventry,
        "MOE", "HR Lead", "hr@moe.gov.sg",
        None, None,
    ),
    (
        "LTA cannot access GovSupply tender module",
        "Error 403 when accessing the tender submission module.",
        Status.Backlog, Priority.High, Product.GovSupply, IssueType.Bug, Source.web,
        "LTA", "Ops Team", "ops@lta.gov.sg",
        "Dear LTA Ops Team, your account permissions have been misconfigured. We are correcting this now.",
        "LTA access control misconfiguration on tender module",
    ),
    (
        "MOM payroll integration guide needed",
        "MOM requires documentation on integrating payroll systems with GovEntry.",
        Status.Done, Priority.Low, Product.GovEntry, IssueType.UserGuideQuestion, Source.intake,
        "MOM", "IT Admin", "it@mom.gov.sg",
        None, None,
    ),
    (
        "MFA diplomatic pass registration",
        "Need to register 50 diplomatic staff for GovEntry.",
        Status.Backlog, Priority.Medium, Product.GovEntry, IssueType.RegistrationEvent, Source.formsg,
        "MFA", "Admin Office", "admin@mfa.gov.sg",
        None, None,
    ),
    (
        "GovRewards catalogue not loading",
        "The rewards catalogue page shows a blank screen on IE11.",
        Status.Done, Priority.Medium, Product.GovRewards, IssueType.Bug, Source.web,
        "GOVTECH", "Test User", "test@tech.gov.sg",
        None, None,
    ),
    (
        "HDB requests GovSupply price comparison feature",
        "HDB would like to see side-by-side vendor price comparison in GovSupply.",
        Status.Backlog, Priority.Low, Product.GovSupply, IssueType.FeatureRequest, Source.intake,
        "HDB", "Procurement", "procurement@hdb.gov.sg",
        None, None,
    ),
]

_KB_DOCS = [
    (
        "GovSupply Overview",
        "GovSupply is the Singapore Government's centralised procurement platform. It connects agencies with approved vendors for goods and services procurement. All agencies must use GovSupply for purchases above SGD 6,000.",
        SourceType.doc, Visibility.global_sanitized,
    ),
    (
        "GovSupply User Guide",
        "Step-by-step guide to using GovSupply: 1) Log in with SingPass. 2) Navigate to Procurement > New Request. 3) Search for vendors by category. 4) Submit purchase order for approval. 5) Track delivery status in My Orders.",
        SourceType.doc, Visibility.global_sanitized,
    ),
    (
        "GovRewards Overview",
        "GovRewards is the incentive program for public servants. Participants earn points for completing training, achieving milestones, and peer recognition. Points can be redeemed for vouchers and merchandise.",
        SourceType.doc, Visibility.global_sanitized,
    ),
    (
        "GovRewards User Guide",
        "How to use GovRewards: 1) Sign in at rewards.gov.sg. 2) View your points balance on the dashboard. 3) Browse the catalogue under Rewards > Catalogue. 4) Add items to cart and confirm redemption. 5) Points are deducted immediately upon confirmation.",
        SourceType.doc, Visibility.global_sanitized,
    ),
]


def _get_or_create_agency(code, name) -> Agency:
    a = db.session.scalar(db.select(Agency).where(Agency.code == code))
    if a is None:
        a = Agency(code=code, name=name)
        db.session.add(a)
        db.session.flush()
    return a


def _get_or_create_team(name, role_label) -> TeamMember:
    t = db.session.scalar(db.select(TeamMember).where(TeamMember.name == name))
    if t is None:
        t = TeamMember(name=name, role_label=role_label)
        db.session.add(t)
        db.session.flush()
    return t


def seed_demo(if_empty: bool = False) -> None:
    from flask import current_app

    # Early return when if_empty=True and issues already exist
    if if_empty:
        count = db.session.scalar(db.select(db.func.count()).select_from(Issue))
        if count and count > 0:
            return

    # 1. Agencies (9)
    agency_map = {}
    for code, name in _AGENCIES:
        a = _get_or_create_agency(code, name)
        agency_map[code] = a.id

    # 2. Team members (3)
    for name, role_label in _TEAM:
        _get_or_create_team(name, role_label)

    # 3. Issues (10)
    now = datetime.now(timezone.utc)
    created_issues = []
    for row in _ISSUES:
        (title, description, status, priority, product, issue_type, source,
         agency_code, req_name, req_email, ai_draft, summary) = row
        issue = Issue(
            title=title,
            description=description,
            status=status,
            priority=priority,
            product=product,
            issue_type=issue_type,
            source=source,
            agency_id=agency_map[agency_code],
            requester_name=req_name,
            requester_email=req_email,
        )
        if ai_draft:
            issue.ai_draft_reply = ai_draft
            issue.ai_triage_json = {
                "issueType": issue_type.value if issue_type else None,
                "product": product.value if product else None,
                "priority": priority.value,
                "draftReply": ai_draft,
                "confidence": 0.85,
                "summary": summary or title,
                "duplicateOfIssueId": None,
                "similarTickets": [],
            }
            issue.triaged_at = now
        db.session.add(issue)
        db.session.flush()
        created_issues.append(issue)

    # 4. KB entries (6): 4 docs + 2 resolved_ticket entries for Done issues
    for title, content, source_type, visibility in _KB_DOCS:
        existing = db.session.scalar(
            db.select(KnowledgeEntry).where(KnowledgeEntry.title == title)
        )
        if existing is None:
            db.session.add(KnowledgeEntry(
                title=title, content=content,
                source_type=source_type, visibility=visibility,
                agency_id=None,
            ))

    # 2 resolved_ticket KB entries — from the Done issues (indices 2 and 6 in _ISSUES)
    done_issues = [i for i in created_issues if i.status == Status.Done]
    for done_issue in done_issues[:2]:
        existing = db.session.scalar(
            db.select(KnowledgeEntry).where(KnowledgeEntry.issue_id == done_issue.id)
        )
        if existing is None:
            db.session.add(KnowledgeEntry(
                title=done_issue.title,
                content=f"PROBLEM: {done_issue.description}\nRESOLUTION: Issue resolved by support team.",
                source_type=SourceType.resolved_ticket,
                visibility=Visibility.agency_specific,
                issue_id=done_issue.id,
                agency_id=done_issue.agency_id,
            ))

    # 5. Admin agency access — grant bootstrap admin access to all 9 agencies
    try:
        cfg = current_app.config.get("_APP_CONFIG")
        if cfg:
            admin_email = cfg.BOOTSTRAP_ADMIN_EMAIL
            admin_user = db.session.scalar(db.select(User).where(User.email == admin_email))
            if admin_user:
                for agency_id in agency_map.values():
                    exists = db.session.scalar(
                        db.select(UserAgencyAccess).where(
                            UserAgencyAccess.user_id == admin_user.id,
                            UserAgencyAccess.agency_id == agency_id,
                        )
                    )
                    if not exists:
                        db.session.add(UserAgencyAccess(
                            user_id=admin_user.id, agency_id=agency_id
                        ))
    except Exception:  # noqa: BLE001
        pass  # No app context or admin user — skip silently

    # 6. Proposed actions (Phase 3)
    from ..models.proposed_action import (
        ProposedAction, ActionType, ProposalStatus, ApprovalTier,
    )
    existing_proposals = db.session.scalar(
        db.select(db.func.count()).select_from(ProposedAction))
    if not existing_proposals:
        for issue in created_issues:
            if issue.ai_draft_reply:
                db.session.add(ProposedAction(
                    action_type=ActionType.reply, issue_id=issue.id,
                    proposer="agent:triage",
                    proposed_payload={"body": issue.ai_draft_reply},
                    required_tier=ApprovalTier.admin, status=ProposalStatus.pending))
        backlog = next((i for i in created_issues if i.status == Status.Backlog), None)
        if backlog is not None:
            db.session.add(ProposedAction(
                action_type=ActionType.status_change, issue_id=backlog.id,
                proposer="agent:hermes", proposed_payload={"status": "InProgress"},
                required_tier=ApprovalTier.human, status=ProposalStatus.pending))
        if created_issues:
            first = created_issues[0]
            db.session.add(ProposedAction(
                action_type=ActionType.tag_change, issue_id=first.id,
                proposer="agent:hermes", proposed_payload={"agency_id": first.agency_id},
                required_tier=ApprovalTier.auto, status=ProposalStatus.executed,
                decided_at=now))

    db.session.commit()
