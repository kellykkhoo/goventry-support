# apps/backend/app/routes/gitlab.py
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.user import User
from ..models.gitlab_issue_proposal import GitLabIssueProposal, ProposalStatus
from ..services.gitlab_service import gitlab_service, REPOS

bp = Blueprint("gitlab", __name__, url_prefix="/gitlab")

APPROVE_ROLES = {"Admin", "PM", "Product Ops"}


def _user():
    return db.session.get(User, int(get_jwt_identity()))


def _proposal_dict(p: GitLabIssueProposal) -> dict:
    return {
        "id": p.id,
        "repo": p.repo,
        "title": p.title,
        "description": p.description,
        "labels": p.labels,
        "related_ticket_ids": p.related_ticket_ids,
        "confidence": p.confidence,
        "status": p.status.value,
        "created_by_id": p.created_by_id,
        "reviewer_id": p.reviewer_id,
        "reject_reason": p.reject_reason,
        "gitlab_issue_url": p.gitlab_issue_url,
        "created_at": p.created_at.isoformat(),
        "decided_at": p.decided_at.isoformat() if p.decided_at else None,
    }


def _handle(fn):
    try:
        return fn()
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404


# ------------------------------------------------------------------
# Docs search — queries live GitLab main branch
# ------------------------------------------------------------------

@bp.get("/docs/search")
@jwt_required()
def search_docs():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "q is required"}), 400
    repo_param = request.args.get("repo")  # "all", "goventry", "govrewards", "govsupply"
    repos = None if (not repo_param or repo_param == "all") else [repo_param]
    if repos and any(r not in REPOS for r in repos):
        return jsonify({"error": f"Invalid repo. Valid: {list(REPOS)}"}), 400
    def go():
        results = gitlab_service.search_docs(q, repos)
        return jsonify({"query": q, "results": results})
    return _handle(go)


@bp.get("/docs/file")
@jwt_required()
def get_file():
    repo = request.args.get("repo", "")
    path = request.args.get("path", "")
    ref = request.args.get("ref", "main")
    if not repo or not path:
        return jsonify({"error": "repo and path are required"}), 400
    def go():
        return jsonify(gitlab_service.get_file(repo, path, ref))
    return _handle(go)


# ------------------------------------------------------------------
# GitLab issue proposals
# ------------------------------------------------------------------

@bp.get("/proposals")
@jwt_required()
def list_proposals():
    status_filter = request.args.get("status")
    q = db.select(GitLabIssueProposal)
    if status_filter:
        q = q.where(GitLabIssueProposal.status == ProposalStatus(status_filter))
    proposals = db.session.scalars(q.order_by(GitLabIssueProposal.created_at.desc())).all()
    return jsonify([_proposal_dict(p) for p in proposals])


@bp.post("/proposals")
@jwt_required()
def create_proposal():
    user = _user()
    body = request.get_json(silent=True) or {}
    def go():
        repo = body.get("repo", "goventry")
        if repo not in REPOS:
            raise ValueError(f"Invalid repo. Valid: {list(REPOS)}")
        proposal = GitLabIssueProposal(
            repo=repo,
            title=body["title"],
            description=body["description"],
            labels=body.get("labels", ["support-signal", "triage-needed"]),
            related_ticket_ids=body.get("related_ticket_ids", []),
            confidence=body.get("confidence"),
            created_by_id=user.id,
        )
        db.session.add(proposal)
        db.session.commit()
        return jsonify(_proposal_dict(proposal)), 201
    return _handle(go)


@bp.get("/proposals/<int:proposal_id>")
@jwt_required()
def get_proposal(proposal_id):
    def go():
        p = db.session.get(GitLabIssueProposal, proposal_id)
        if not p:
            raise LookupError("Proposal not found")
        return jsonify(_proposal_dict(p))
    return _handle(go)


@bp.patch("/proposals/<int:proposal_id>")
@jwt_required()
def update_proposal(proposal_id):
    """Allow editing title/description/labels before approving."""
    user = _user()
    body = request.get_json(silent=True) or {}
    def go():
        role = user.role.name if user.role else None
        if role not in APPROVE_ROLES:
            raise PermissionError("Not allowed to edit proposals")
        p = db.session.get(GitLabIssueProposal, proposal_id)
        if not p:
            raise LookupError("Proposal not found")
        if p.status != ProposalStatus.pending:
            raise ValueError("Can only edit pending proposals")
        if "title" in body:
            p.title = body["title"]
        if "description" in body:
            p.description = body["description"]
        if "labels" in body:
            p.labels = body["labels"]
        if "repo" in body:
            if body["repo"] not in REPOS:
                raise ValueError(f"Invalid repo")
            p.repo = body["repo"]
        db.session.commit()
        return jsonify(_proposal_dict(p))
    return _handle(go)


@bp.post("/proposals/<int:proposal_id>/approve")
@jwt_required()
def approve_proposal(proposal_id):
    """Approve and attempt to create the issue in GitLab."""
    user = _user()
    def go():
        role = user.role.name if user.role else None
        if role not in APPROVE_ROLES:
            raise PermissionError("Not allowed to approve proposals")
        p = db.session.get(GitLabIssueProposal, proposal_id)
        if not p:
            raise LookupError("Proposal not found")
        if p.status != ProposalStatus.pending:
            raise ValueError(f"Proposal is already {p.status.value}")
        p.reviewer_id = user.id
        p.decided_at = datetime.now(timezone.utc)
        try:
            result = gitlab_service.create_issue(p.repo, p.title, p.description, p.labels)
            p.status = ProposalStatus.created
            p.gitlab_issue_url = result["url"]
            db.session.commit()
            return jsonify({**_proposal_dict(p), "gitlab_issue": result})
        except PermissionError:
            # Token lacks api scope — approve locally, creation deferred
            p.status = ProposalStatus.approved
            db.session.commit()
            return jsonify({
                **_proposal_dict(p),
                "warning": "Approved locally. GitLab issue not created — PAT needs 'api' scope.",
            })
    return _handle(go)


@bp.post("/proposals/<int:proposal_id>/reject")
@jwt_required()
def reject_proposal(proposal_id):
    user = _user()
    body = request.get_json(silent=True) or {}
    def go():
        role = user.role.name if user.role else None
        if role not in APPROVE_ROLES:
            raise PermissionError("Not allowed to reject proposals")
        p = db.session.get(GitLabIssueProposal, proposal_id)
        if not p:
            raise LookupError("Proposal not found")
        if p.status != ProposalStatus.pending:
            raise ValueError(f"Proposal is already {p.status.value}")
        p.status = ProposalStatus.rejected
        p.reviewer_id = user.id
        p.reject_reason = body.get("reason", "")
        p.decided_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify(_proposal_dict(p))
    return _handle(go)
