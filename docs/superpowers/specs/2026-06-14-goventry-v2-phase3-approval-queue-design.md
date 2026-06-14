# GovEntry Support v2 — Phase 3: Approval Queue Design Spec

_Spec date: 2026-06-14_
_Predecessor: `docs/superpowers/specs/2026-06-14-goventry-v2-phase2-ticket-core-design.md`_

## Goal

Introduce the v2 **authority gate**: AI/agent-suggested actions become **proposals** that wait in an approval queue for human sign-off, while humans continue to act directly. Reviewers can edit a proposal before approving, reject it with a reason, and every decision is audited. This is the foundation Hermes (Phase 4) plugs into — agents propose, humans/admins approve.

## Scope

**In Phase 3:**
- One new SQLAlchemy model + Alembic migration: `proposed_actions`
- `approval_service` — proposal lifecycle + a tier policy (auto / human / admin)
- `routes/approval.py` — list, get, approve (edit-before-approve), reject
- Rewire `triage_service` so its draft reply becomes a queued proposal (not a direct write)
- One new `issue_service` method: `add_agency_tag`
- Frontend: Approval Queue page, ticket-detail "pending approvals" card, nav badge
- Demo seed: a few proposals so the queue is populated on a fresh DB

**Not in Phase 3** (deferred):
- Hermes agent runtime + MCP server (Phase 4) — Phase 3 is exercised by triage + demo seed
- Slack reporting (Phase 5), GitLab (Phase 6), feedback learning loop (Phase 7), SSO (Phase 8)
- A public "create proposal" API route — proposals are born server-side from triage/agents/seed
- The v2 spec's separate `PATCH final-payload` and `execute` endpoints (folded into `approve`)

## Decisions

- **Humans act directly; AI proposals always queue.** PM/Product Ops keep acting directly on tickets (audited via the existing `audit_service`). Only AI/agent-originated actions go through the queue. The Phase 2 human "Approve, send & resolve" fast-path stays exactly as-is.
- **Three approval tiers** computed from the action's risk:
  - `auto` — executes immediately on propose (internal notes, same-agency tag changes)
  - `human` — any PM/Product Ops/Admin reviewer (status changes, assignments)
  - `admin` — Admin only (external replies, cross-agency tag changes)
- **Triage rewiring:** triage keeps setting `priority`/`product`/`issue_type` directly (low-stakes labels) but its draft reply becomes an **admin-tier** pending proposal. Re-running triage updates the existing pending reply proposal instead of stacking duplicates.
- **One polymorphic `proposed_actions` table + a dispatcher.** On approval, `approval_service` dispatches by `action_type` to the existing Phase 2 `issue_service` methods — one execution path, no duplicated logic.
- **`issues.ai_draft_reply` is retained for backward-compat but no longer written by triage.** The draft now lives in the reply proposal's `proposed_payload`.

---

## Data Model

One new table, `proposed_actions`. No changes to the `issues` table.

### `proposed_actions`
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| action_type | Enum | `reply` / `status_change` / `assignment` / `tag_change` / `internal_note` |
| issue_id | FK → issues (cascade delete) | the ticket the action targets |
| proposer | String(100) | `agent:triage`, `agent:hermes`, or `user:<id>` |
| proposed_payload | JSON | the original suggestion, e.g. `{"body": "..."}` for a reply |
| final_payload | JSON (nullable) | the reviewer's edited version, if edited before approving |
| required_tier | Enum | `auto` / `human` / `admin` (set at propose time) |
| status | Enum | `pending` / `approved` / `rejected` / `executed` / `failed` |
| reviewer_id | FK → users (nullable) | who approved/rejected |
| reject_reason | Text (nullable) | required when rejecting |
| created_at | DateTime | |
| decided_at | DateTime (nullable) | set on approve/reject |

**Payload shapes by action_type:**
- `reply` → `{"body": str}`
- `status_change` → `{"status": "InProgress"}`
- `assignment` → `{"assignee_id": int}`
- `tag_change` → `{"agency_id": int}`
- `internal_note` → `{"body": str}`

Enums live in `app/models/proposed_action.py`: `ActionType`, `ProposalStatus`, `ApprovalTier`.

---

## Backend — `approval_service.py`

All in `apps/api/app/services/approval_service.py`. Reuses `issue_service` for execution and `audit_service` for logging. Agency scoping reuses `issue_service.allowed_agencies(user)`.

### Tier policy

```
required_tier(action_type, payload, issue) -> ApprovalTier
    reply           -> admin                       # external send, irreversible
    status_change   -> human
    assignment      -> human
    internal_note   -> auto
    tag_change      -> auto, UNLESS payload["agency_id"] is a different agency
                       than issue.agency_id and not already tagged -> admin
```

### Lifecycle

```
propose(action_type, issue, proposed_payload, proposer) -> ProposedAction
    1. tier = required_tier(action_type, proposed_payload, issue)
    2. create ProposedAction(status=pending, required_tier=tier, ...)
    3. if tier == auto:
         _execute(proposal, reviewer=None)   # system action
         status = executed
       audit "proposal_created" (+ "proposal_executed" if auto)
    Special case (triage reply): if a pending reply proposal already exists
    for this issue, UPDATE its proposed_payload instead of creating a new one.

list_proposals(user, status=None, action_type=None, issue_id=None, page=1, per_page=25)
    Joins issues; WHERE issues.agency_id IN allowed_agencies(user)  (Admin: all)
    Optional filters: status, action_type, issue_id

get_proposal(user, id) -> ProposedAction      # raises 403 if out of agency scope, 404 if missing

approve(user, id, final_payload=None) -> ProposedAction
    1. load (scoped); require status == pending  (else ValueError)
    2. tier gate:
         admin -> user.role == "Admin"                       else PermissionError
         human -> user.role in {PM, Product Ops, Admin}       else PermissionError
         (auto never reaches approve — already executed)
    3. if final_payload: store it (edit-before-approve)
    4. status = approved, reviewer = user, decided_at = now
    5. _execute(proposal, reviewer=user) -> status = executed (or failed on error)
    6. audit "proposal_approved" + "proposal_executed"

reject(user, id, reason) -> ProposedAction
    1. load (scoped); require status == pending (else ValueError)
    2. require non-empty reason (else ValueError)
    3. any PM/Product Ops/Admin reviewer may reject
    4. status = rejected, reviewer = user, reject_reason = reason, decided_at = now
    5. audit "proposal_rejected"

_execute(proposal, reviewer) -> None
    payload = proposal.final_payload or proposal.proposed_payload
    dispatch by action_type using `reviewer` (or a system actor for auto-tier):
        reply         -> issue_service.approve_and_send(reviewer, issue_id, payload["body"])
        status_change -> issue_service.update_status(reviewer, issue_id, payload["status"])
        assignment    -> issue_service.update_assignee(reviewer, issue_id, payload["assignee_id"])
        tag_change    -> issue_service.add_agency_tag(reviewer, issue_id, payload["agency_id"])
        internal_note -> issue_service.add_internal_note(reviewer, issue_id, payload["body"])
```

**Auto-tier system execution:** when `propose` auto-executes (no human reviewer), `_execute` is called with `reviewer=None`. The dispatched `issue_service` write methods treat a `None` actor as a trusted system actor — they skip the `_require_write` role check (the tier policy already decided the action is auto-allowed) and the audit row records the `proposer` string instead of a `reviewer_id`. Only the auto-tier action types (`internal_note`, same-agency `tag_change`) ever take this path; `human`/`admin` tiers always carry a real reviewer.

### New `issue_service` method

```
add_agency_tag(user, issue_id, agency_id) -> IssueAgency
    Inserts an issue_agencies row (no-op if already tagged). Audited "agency_tagged".
```

---

## Backend — `routes/approval.py`

Blueprint `url_prefix="/approvals"`, all `@jwt_required()`. Agency scoping enforced in the service. Exception mapping: `PermissionError → 403`, `LookupError → 404`, `ValueError → 400`.

```
GET  /approvals                 list_proposals — ?status=&action_type=&issue_id=&page=&per_page=
GET  /approvals/:id             get_proposal
POST /approvals/:id/approve     {final_payload?: {...}}  — edit-before-approve folds in here
POST /approvals/:id/reject      {reason: str}            — reason required
```

No `create` route (proposals come from triage/agents/seed). The ticket-detail page reads a ticket's proposals via `GET /approvals?issue_id=<id>` — no new route.

JSON serializer fields (snake_case): `id`, `action_type`, `issue_id`, `proposer`, `proposed_payload`, `final_payload`, `required_tier`, `status`, `reviewer_id`, `reject_reason`, `created_at`, `decided_at`.

---

## Backend — triage rewiring

`triage_service.run_triage` changes (only behavior change to existing code):
- Still writes `ai_triage_json` + `triaged_at`; still sets `priority`/`product`/`issue_type` directly.
- Replace `issue.ai_draft_reply = parsed["draftReply"]` with:
  ```
  if parsed.get("draftReply"):
      approval_service.propose(
          action_type="reply", issue=issue,
          proposed_payload={"body": parsed["draftReply"]},
          proposer="agent:triage",
      )
  ```
- Import order: `triage → approval → issue_service`; nothing imports back, so no circular import.

---

## Frontend

All under `apps/web/src/`. TanStack Query + the extended `api.ts` client.

### `lib/api.ts` + `lib/types.ts`
Add `ProposedAction` and `ApprovalListResponse` types (snake_case mirror) and:
```
listApprovals(params: URLSearchParams)         -> ApprovalListResponse
getApproval(id)                                -> ProposedAction
approveProposal(id, finalPayload?)             -> ProposedAction   // POST .../approve
rejectProposal(id, reason)                     -> ProposedAction   // POST .../reject
```

### `pages/ApprovalQueuePage.tsx` (new, route `/approvals`)
- `useQuery(["approvals", filters], …)`, default filter `status=pending`.
- Filter bar: status tabs (Pending / Approved / Rejected / All) + action-type filter.
- Rows: action-type badge, ticket title (links to `/tickets/:id`), proposer label (`agent:triage` → "AI triage"), **tier badge** (auto=gray, human=blue, admin=amber), created date.
- Expand → detail: render the payload; for a `reply`, an **editable textarea** pre-filled with the draft.
  - **Approve** → `approveProposal(id, {body})` (or the appropriate payload). Disabled with a tooltip when `required_tier === "admin"` and the user isn't Admin.
  - **Reject** → reveals a required reason input → `rejectProposal(id, reason)`.
  - On success → invalidate `["approvals"]` + toast.

### Ticket detail integration (`TicketDetailPage.tsx`)
- Keep the Phase 2 **human fast-path** unchanged: compose a reply → "Approve, send & resolve" → direct send (a human action, not queued).
- ADD a **"Pending approvals" card** listing this ticket's proposals (`GET /approvals?issue_id=`), each with inline Approve/Reject (tier-gated) or a "Review in queue" link for non-admins.
- The AI draft no longer auto-fills the human's reply box — it appears as a proposal card instead.

### Nav + routing
- `AppShell.tsx`: add **"Approvals"** nav item with a **pending-count badge** (lightweight `listApprovals(status=pending)` → `total`).
- `App.tsx`: add `/approvals → ApprovalQueuePage`.

---

## Demo Seed

Extend `apps/api/app/commands/seed.py` (idempotent — guard by existence):
- Convert the 3 demo tickets that previously set `ai_draft_reply` into **pending `reply` proposals** (`proposer="agent:triage"`, admin tier) so the queue is populated on a fresh DB.
- Add 1 pending `status_change` proposal (`proposer="agent:hermes"`, human tier) — e.g. Backlog → InProgress — to show a non-reply type.
- Add 1 already-`executed` auto-tier `tag_change` to show the auto path in history.

---

## Testing

**Backend (pytest, SQLite in-memory):**
- `test_approval_service.py`
  - tier policy: `reply→admin`, `status_change→human`, same-agency `tag_change→auto`, new-agency `tag_change→admin`
  - `propose` auto-tier executes immediately (e.g. same-agency tag → `issue_agencies` row created, `status=executed`)
  - `propose` admin-tier stays `pending`
  - `approve` admin-tier: PM → `PermissionError`; Admin → executes (reply → outbound message + status Done + KB entry, via `approve_and_send`)
  - `approve` with `final_payload` sends the edited body
  - `reject` empty reason → `ValueError`; with reason → `status=rejected`
  - agency scoping: PM scoped to MOH cannot see/approve a proposal on an NEA ticket
- `test_approval_routes.py`: 401 without token; scoped list; role gates on approve; 400 on empty reject reason
- Update `test_triage_service.py`: triage creates a pending reply proposal (not `ai_draft_reply`); re-triage updates the existing proposal rather than duplicating

**Frontend:** manual smoke test (no Vitest in Phase 3), consistent with Phase 2.

---

## Verification Checklist

- [ ] `flask db upgrade` applies the `proposed_actions` migration cleanly
- [ ] `flask seed-demo` populates the queue (≥3 pending reply proposals + 1 status proposal + 1 executed tag)
- [ ] `POST /issues/:id/triage` (with `ANTHROPIC_API_KEY` set) creates a pending admin-tier reply proposal; re-triage updates it, no duplicate
- [ ] `GET /approvals` without token → 401; with PM token scoped to MOH → only MOH-ticket proposals
- [ ] PM approving an admin-tier reply → 403; Admin approving → sends email (dev-console if no provider), creates outbound `TicketMessage`, sets status Done, creates `KnowledgeEntry`
- [ ] Edit-before-approve: approving with an edited body sends the edited text
- [ ] Reject with empty reason → 400; with a reason → proposal `rejected`, reason stored, audited
- [ ] Frontend: Approval Queue lists pending proposals with tier badges; admin-tier Approve disabled for non-Admins; ticket detail shows the pending proposal card; human fast-path send still works directly
