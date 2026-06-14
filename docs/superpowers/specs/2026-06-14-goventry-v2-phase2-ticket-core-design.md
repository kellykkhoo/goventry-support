# GovEntry Support v2 — Phase 2: Ticket Core Design Spec

_Spec date: 2026-06-14_
_Predecessor: `docs/superpowers/specs/2026-06-14-goventry-v2-rewrite-design.md`_

## Goal

PM/Product Ops can view tickets, run AI triage, review and edit AI draft replies, approve and send replies (with email), and see the cross-agency demand aggregate — all in the Vite frontend, through the Flask API, with agency data isolation enforced from day one.

## Scope

**In Phase 2:**
- Six new SQLAlchemy models + Alembic migration
- Ticket CRUD API with agency-scoped filtering
- Triage service (Anthropic Python SDK, tool-use loop, background thread)
- Email service (M365 Graph → Postman.gov.sg → dev-console)
- Knowledge service (keyword-overlap search for triage tools)
- Audit service (thin action logger)
- Demo seed (9 agencies, 3 team members, 10 issues, 6 KB entries)
- Frontend: ticket list, ticket detail (AI draft + approve-and-send), agencies page

**Not in Phase 2** (deferred):
- Kanban board, Team page, Knowledge Base page, `/support` intake form
- Approval queue with edit-history and audit trail (Phase 3)
- Hermes MCP integration (Phase 4)
- FormSG / GovEntry webhook receivers (Phase 2 uses manual ticket creation + demo seed only)
- Email receiving / inbound message ingestion

## Decisions

- **Basic approve-and-send is in Phase 2.** The full edit-history, proposal-reject, audit-trail approval queue is Phase 3.
- **Triage in Phase 2 is direct Anthropic SDK** (background thread, same as today's `triageInBackground()`). The Hermes agent takeover is Phase 4.
- **TeamMember stays a separate model** from `User` for parity with the current app. Merging into `User` is a later phase decision.
- **Agency scoping enforced in `issue_service`**, not at the model level. Admin users bypass the filter and see all agencies.

---

## Data Model

Six tables added in a single Alembic migration (`phase2_ticket_core`).

### `team_members`
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| name | String(255) | |
| role_label | String(50) | display label: PM / Product Ops / UIUX |

### `issues`
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| title | String(500) | |
| description | Text | |
| status | Enum | Backlog / InProgress / Done / Cancelled |
| priority | Enum | Low / Medium / High / Urgent |
| product | Enum | GovEntry / GovSupply / GovRewards |
| issue_type | Enum | FeatureRequest / Bug / UserGuideQuestion / RegistrationEvent |
| source | Enum | web / intake / formsg / goventry |
| source_ref | String(255) UNIQUE | idempotency key |
| requester_name | String(255) | |
| requester_email | String(255) | |
| agency_id | FK → agencies | **primary scoping agency** |
| assignee_id | FK → team_members (nullable) | |
| ai_triage_json | JSON (nullable) | full triage output |
| ai_draft_reply | Text (nullable) | extracted draft for the reply box |
| triaged_at | DateTime (nullable) | |
| resolution_summary | Text (nullable) | written on approve-and-send |
| created_at | DateTime | |
| updated_at | DateTime | auto-updated |

### `issue_agencies`
Composite PK `(issue_id, agency_id)`. Many-to-many agency tags. A ticket's primary scope is `issues.agency_id`; `issue_agencies` records additional agency tags for reporting.

### `ticket_messages`
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| issue_id | FK → issues (cascade delete) | |
| direction | Enum | outbound / inbound / note |
| sender_name | String(255) | |
| body | Text | |
| created_at | DateTime | |

### `knowledge_entries`
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| title | String(500) | |
| content | Text | |
| source_type | Enum | doc / resolved_ticket |
| issue_id | FK → issues (nullable) | link to source ticket |
| agency_id | FK → agencies (nullable) | None = global |
| visibility | Enum | agency_specific / global_sanitized / internal_admin_only |
| created_at | DateTime | |

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| action | String(100) | e.g. status_changed, reply_sent, note_added |
| user_id | FK → users (nullable) | null if system action |
| issue_id | FK → issues (nullable) | |
| agency_id | FK → agencies (nullable) | |
| detail | JSON | action-specific payload |
| created_at | DateTime | |

---

## Backend — Services

All in `apps/api/app/services/`.

### `issue_service.py`

The single source of truth for ticket data access. Every query enforces agency scoping.

```
allowed_agencies(user) → list[int]
    Admin: all agency IDs
    Others: IDs from user_agency_access

list_issues(user, status, product, search, page, per_page) → paginated Issue list
    WHERE issues.agency_id IN allowed_agencies(user)

get_issue(user, id) → Issue (raises 403 if out of scope)

create_issue(user, data) → Issue
    Sets agency_id from data; must be in allowed_agencies(user)

update_status(user, id, status) → Issue
    Calls audit_service.log("status_changed", ...)
    Requires role in [PM, Product Ops, Admin]

update_assignee(user, id, assignee_id) → Issue

add_internal_note(user, id, body) → TicketMessage
    direction=note, sender_name=user.name
    Calls audit_service.log("note_added", ...)

approve_and_send(user, id, body) → Issue
    1. Creates TicketMessage(direction=outbound, ...)
    2. Calls email_service.send(to=issue.requester_email, body=body)
    3. Sets issue.status = Done
    4. Sets issue.resolution_summary = body[:500]
    5. Creates KnowledgeEntry(source_type=resolved_ticket, agency_id=issue.agency_id,
                              visibility=agency_specific, title=issue.title,
                              content="PROBLEM: {issue.description}\nRESOLUTION: {body}")
    6. Calls audit_service.log("reply_sent", ...)
    Requires role in [PM, Product Ops, Admin]
```

### `triage_service.py`

Python port of `src/lib/triage.ts`. Uses `anthropic` Python SDK.

```
run_triage(issue_id) → dict   (runs in calling thread; caller uses a background thread)
    1. Loads Issue from DB
    2. Builds system prompt (same as TS: products, agencies, team, feature→product mapping)
    3. Runs tool-use loop (up to 8 turns):
       Tools: search_knowledge_base(query), search_tickets(query)
       Output: JSON matching OUTPUT_SCHEMA
    4. Writes ai_triage_json, ai_draft_reply, triaged_at, issue_type, priority, product back to Issue

triage_in_background(app, issue_id)
    Flask does not propagate the app context into new threads.
    The thread must push its own context:
        def _run():
            with app.app_context():
                run_triage(issue_id)
        threading.Thread(target=_run, daemon=True).start()
    Routes call: triage_in_background(current_app._get_current_object(), issue_id)
```

**Model:** `claude-opus-4-8`, `max_tokens=8000`. JSON output enforced by placing the OUTPUT_SCHEMA in the system prompt and instructing the model to return only valid JSON — no dependency on non-standard `output_config` SDK fields (the TS code used these experimentally; the Python port uses prompt-level enforcement, which is more reliable).

**OUTPUT_SCHEMA** (same fields as current app):
```json
{
  "issueType": "FeatureRequest | Bug | UserGuideQuestion | RegistrationEvent",
  "product": "GovEntry | GovSupply | GovRewards | null",
  "priority": "Low | Medium | High | Urgent",
  "duplicateOfIssueId": "integer | null",
  "similarTickets": [{"id": "int", "title": "str", "similarity": "str"}],
  "draftReply": "string",
  "confidence": "0.0–1.0",
  "summary": "string"
}
```

### `knowledge_service.py`

Python port of `src/lib/search.ts`. Naive keyword-overlap scoring (no embeddings).

```
search_knowledge_base(query, agency_id) → list[dict]
    Fetches entries where agency_id matches OR agency_id is NULL (global)
    Scores by keyword overlap, returns top 5

search_tickets(query, agency_id) → list[dict]
    Fetches resolved tickets within agency scope
    Scores by keyword overlap on title+description+resolution_summary, returns top 5
```

### `email_service.py`

Python port of `src/lib/email.ts`. Provider chosen by env vars present.

```
send(to, subject, body, reply_to=None)
    Priority 1: M365 Graph  (MS_TENANT_ID + MS_CLIENT_ID + MS_CLIENT_SECRET + MS_SENDER_MAILBOX)
                Uses httpx + client-credentials OAuth token
    Priority 2: Postman.gov.sg  (POSTMAN_API_KEY + POSTMAN_FROM)
                POST https://api.postman.gov.sg/v1/transactional/email/send
    Priority 3: Dev-console (no provider set) — logs to stdout
```

### `audit_service.py`

Thin wrapper around `AuditLog`.

```
log(action, user, issue=None, detail=None)
    Creates AuditLog row and commits. Never raises — failures are logged to stderr.
```

---

## Backend — Routes

All routes require JWT (`@jwt_required()`). Agency scoping enforced in service layer.

### `routes/issues.py`

```
GET  /issues                    list_issues — supports ?status=&product=&search=&page=&per_page=
POST /issues                    create_issue — body: {title, description, agency_id, ...}
GET  /issues/:id                get_issue
PATCH /issues/:id               update title/description
PATCH /issues/:id/status        {status: "InProgress"} — PM/Product Ops/Admin only
PATCH /issues/:id/assignee      {assignee_id: int} — PM/Product Ops/Admin only
POST /issues/:id/internal-notes {body: str} — all roles
GET  /issues/:id/messages       list TicketMessages for this issue
POST /issues/:id/triage         triggers triage_in_background(); returns {ok: true}
POST /issues/:id/approve-reply  {body: str} — PM/Product Ops/Admin only
```

### `routes/agencies.py`

```
GET /agencies   returns agency list + per-agency issue counts (open/in-progress/done)
                + top_requests: top 8 issues ranked by distinct_agency_count desc
                Scoped to user's allowed agencies
```

### `routes/team.py`

```
GET /team   returns TeamMember list (for assignee dropdown)
```

### `routes/seed.py`

```
POST /seed/demo   Admin-only. Body: {if_empty: bool}.
                  Runs demo seed; skips if if_empty=true and issues already exist.
```

---

## Demo Seed

`apps/api/app/commands/seed.py` — registered as `flask seed-demo [--if-empty]`.

Seeds (idempotent — checks existence before inserting):
- **9 agencies:** MOH, NEA, MINDEF, HDB, LTA, MOM, MOE, MFA, GOVTECH
- **3 team members:** Roy Tan (PM), Kelly Khoo (Product Ops), Jeremy Ong (UIUX)
- **10 issues** spanning: different statuses (Backlog/InProgress/Done), different products, different agencies, 3 with `ai_draft_reply` populated (so "AI draft ready" badge shows in UI)
- **6 KB entries:** 4 canonical docs (GovSupply overview, GovSupply user guide, GovRewards overview, GovRewards user guide — `visibility=global_sanitized`), 2 resolved-ticket entries (`visibility=agency_specific`)
- **UserAgencyAccess rows** granting the bootstrap admin access to all 9 agencies

Compose startup command adds `flask seed-demo --if-empty` so demo data only seeds on empty DB.

---

## Frontend

All pages live under `apps/web/src/pages/`. All use TanStack Query for data fetching and the existing `api.ts` client (extended with ticket/agency endpoints).

### `TicketsPage.tsx`

- Fetches `GET /issues` with filters. URL params sync with filter bar state (React Router `useSearchParams`).
- Filter bar: status tab group (All / Backlog / In Progress / Done / Cancelled), product dropdown, debounced search input (300ms).
- Table rows: title, requester name, agency badge, priority chip, assignee, relative created date, "AI draft ready" badge.
- Click → `navigate('/tickets/:id')`.

### `TicketDetailPage.tsx`

Two-column layout. TanStack Query fetches the ticket and messages in parallel.

**Main column:**
- Ticket header: title, source badge, created date, agency tag(s)
- Requester: name, email
- Description block
- Message thread: outbound messages in blue, notes in gray, inbound in white. Each shows sender, direction label, timestamp, body.
- "Add internal note" section: textarea + submit button (all roles).

**Right sidebar:**
- Status select — role-gated (PM/Product Ops/Admin only; UIUX sees read-only)
- Assignee select from `GET /team` — same role gate
- **Triage panel:**
  - "Run triage" button → `POST /issues/:id/triage` → invalidates ticket query → shows spinner → re-renders with `ai_triage_json` (priority, product, confidence, summary, similar tickets)
- **Draft reply panel** (shown when `ai_draft_reply` exists):
  - Editable textarea pre-filled with `ai_draft_reply`
  - "Approve, send & resolve" button → `POST /issues/:id/approve-reply` with edited body → on success: navigate back to ticket list, show success toast
  - Role-gated: PM/Product Ops/Admin can edit and send; UIUX sees read-only draft

### `AgenciesPage.tsx`

- Fetches `GET /agencies`
- Agency cards with open/in-progress/done counts
- "Top requests across agencies" section: table showing top 8 issues ranked by how many agencies have tagged them

### Routing (`App.tsx` additions)

```
/              → redirect to /tickets
/tickets       → TicketsPage
/tickets/:id   → TicketDetailPage
/agencies      → AgenciesPage
```

Sidebar nav: Tickets, Agencies (both role-visible for all roles).

---

## Testing

**Backend (pytest, SQLite in-memory):**
- `test_issue_service.py` — agency scoping: user A (MOH access) cannot see issue owned by NEA; Admin sees all
- `test_issue_service.py` — approve_and_send: creates outbound message, marks Done, creates KB entry, calls email_service.send
- `test_triage_service.py` — mock Anthropic client; verify tool loop runs, OUTPUT_SCHEMA parsed, fields written to Issue
- `test_email_service.py` — mock httpx; verify provider selection by env vars
- `test_agencies_route.py` — top_requests aggregate returns correct ordering

**Frontend:** Manual smoke test (no Vitest tests in Phase 2; UI shape is straightforward CRUD).

---

## Verification Checklist

- [ ] `flask db upgrade` applies `phase2_ticket_core` migration cleanly
- [ ] `flask seed-demo` populates 9 agencies, 3 team members, 10 issues, 6 KB entries
- [ ] `GET /issues` without token → 401; with PM token scoped to MOH → only MOH issues
- [ ] `POST /issues/:id/triage` (with `ANTHROPIC_API_KEY` unset) → gracefully returns `{ok: true}` and logs warning; issue `ai_draft_reply` stays null
- [ ] `POST /issues/:id/approve-reply` → creates outbound TicketMessage, sets status=Done, creates KnowledgeEntry, calls email (dev-console logs if no provider set)
- [ ] Vite frontend: ticket list shows 10 demo tickets, 3 with "AI draft ready" badge; detail page shows draft in textarea; agencies page shows top-requests table
- [ ] Admin user sees all agencies' tickets; PM user scoped to MOH sees only MOH tickets
