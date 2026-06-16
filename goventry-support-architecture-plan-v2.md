# GovEntry Support Architecture Plan

_Last updated: 2026-06-14_

## 1. Current Direction

The project should be migrated from the current Next.js monolith into a true frontend/backend architecture with a separate active-operator Hermes agent layer.

The target architecture is:

```txt
Vite React Frontend
    ↓ REST API
Flask Backend
    ↓
PostgreSQL

Hermes Agent
    ↓ MCP / controlled internal API
Flask Backend
    ↓
PostgreSQL / Slack / Internal GitLab API
```

The frontend should be a gated internal application. Public unauthenticated `/support` intake is no longer part of the preferred design.

Hermes should act as an active operator, but external or irreversible decisions must still go through human approval.

---

## 2. Confirmed Decisions

### Frontend

Decision: **Move to Vite React**

Recommended stack:

```txt
Vite
React
TypeScript
TanStack Query
React Router
Tailwind CSS
shadcn/ui
Zod
OpenAPI-generated API client
```

Frontend responsibilities:

```txt
login screen
ticket dashboard
ticket detail view
approval queue
Hermes activity/audit view
draft review/edit/send workflow
daily/weekly report viewer
admin settings
role-based UI controls
```

The frontend should not directly access:

```txt
database
email provider
LLM provider
Hermes runtime
GitLab API
webhook secrets
```

---

### Backend

Decision: **Use Python Flask backend and replace Prisma with SQLAlchemy**

Recommended stack:

```txt
Python 3.12+
Flask
SQLAlchemy 2.0
Alembic
PostgreSQL
Pydantic
Flask-CORS
Gunicorn
PyJWT / Flask-JWT-Extended
Passlib / bcrypt
```

Backend responsibilities:

```txt
authentication
role-based authorization
ticket CRUD
agency isolation
approval queue
email sending
webhook handling
AI/Hermes permission gate
internal notes
audit logging
GitLab integration broker
Slack report broker
```

The backend is the source of truth. Hermes should call the backend through approved endpoints or MCP tools rather than modifying the database directly.

---

### Database

Decision: **Replace Prisma with SQLAlchemy**

Migration approach:

```txt
1. Preserve current business entities conceptually.
2. Recreate the schema using SQLAlchemy models.
3. Use Alembic for migrations.
4. Migrate or reseed data gradually.
5. Remove Prisma after backend parity is reached.
```

Core tables:

```txt
users
roles
agencies
issues
ticket_messages
knowledge_entries
internal_notes
proposed_actions
draft_feedback
audit_logs
hermes_job_runs
hermes_reports
repo_references
slack_delivery_logs
```

---

### Authentication

Decision: **Internal SSO later; admin username/password login first**

Initial implementation:

```txt
admin username/password login
JWT session token or secure server-side session
role-based access control
admin-only user management
```

Future implementation:

```txt
internal SSO integration
map SSO groups to app roles
keep admin login as emergency fallback
```

Important design note:

```txt
Do not build the app assuming password login is the permanent identity model.
Abstract authentication behind an AuthService so SSO can be added later.
```

---

### Roles

Confirmed roles:

```txt
PM
Product Ops
UIUX
Admin
```

Recommended permissions:

| Capability | PM | Product Ops | UIUX | Admin |
|---|---:|---:|---:|---:|
| View assigned tickets | Yes | Yes | Yes | Yes |
| View all tickets within allowed agency scope | Yes | Yes | Limited | Yes |
| Edit ticket status | Yes | Yes | No | Yes |
| Edit draft responses | Yes | Yes | Limited | Yes |
| Approve/send external responses | Yes | Yes | No by default | Yes |
| Create internal notes | Yes | Yes | Yes | Yes |
| Review UIUX-related tickets | Yes | Yes | Yes | Yes |
| Approve GitLab issue proposals | Yes | Optional | Optional | Yes |
| Approve Hermes skill updates | No | No | No | Yes |
| Manage users/roles | No | No | No | Yes |
| Manage agency isolation rules | No | No | No | Yes |

---

### Frontend Access

Decision: **Frontend gated behind login**

The application should not expose internal tickets, reports, Hermes activity, drafts, or support workflows publicly.

If external intake is required later, it should be handled through:

```txt
authenticated agency portal
signature-protected webhook
separate public form service
separate minimal intake endpoint
```

---

### Hermes Agent

Decision: **Use Nous Hermes Agent as an active operator**

Hermes should be deployed as a separate automation/agent layer, not embedded into the Flask backend.

Hermes responsibilities:

```txt
daily ticket summary
weekly support report
ticket triage
auto-tagging
auto-assignment
internal notes
draft replies
KB suggestions
draft GitLab issue proposals
stale-ticket detection
agency-specific trend detection
reviewer feedback learning
skill improvement proposals
```

Hermes should interact with the backend through:

```txt
custom MCP server
or controlled internal REST API
```

Preferred design:

```txt
Hermes Agent
    ↓
GovEntry Support MCP Server
    ↓
Flask Backend
    ↓
PostgreSQL
```

---

## 3. Hermes Permission Model

### Auto-allowed

Hermes may perform these actions automatically:

```txt
read tickets within allowed agency scope
read knowledge base within allowed agency scope
search similar historical tickets within same agency scope
classify ticket category
classify ticket priority
auto-tag ticket
auto-assign ticket
create internal notes
draft requester replies
draft internal summaries
generate daily reports
generate weekly reports
suggest KB updates
```

### Human approval required

Hermes must create a proposed action and wait for human approval before:

```txt
sending external responses
closing tickets when closure has external impact
creating GitLab issues
modifying Hermes skills
publishing KB articles
making cross-agency conclusions
deleting records
changing security-sensitive settings
```

### Admin approval required

```txt
Hermes skill updates
agency isolation rule changes
integration credential changes
role/permission changes
```

---

## 4. Human-in-the-loop Workflow

The goal is not for humans to manually do everything. The goal is for humans to sign off on meaningful decisions.

Recommended workflow:

```txt
1. Ticket enters system.
2. Hermes reads the ticket.
3. Hermes checks KB, prior tickets, and allowed product documentation.
4. Hermes tags and assigns the ticket automatically.
5. Hermes creates an internal note with its reasoning summary.
6. Hermes drafts a requester response.
7. Draft appears in approval queue.
8. PM/Product Ops reviews, edits, and sends.
9. Backend stores original draft, final sent version, and reviewer edits.
10. Hermes learns from approved/rejected/edited drafts.
```

External sending remains human-approved, but all drafts should be editable by PM/Product Ops.

Confirmed decision:

```txt
All drafts should allow PM editing.
There is no confidence threshold that blocks editing.
```

Confidence can still be shown as metadata, but it should not control whether a draft can be reviewed or edited.

---

## 5. Draft Improvement Loop

The system should explicitly teach Hermes to improve its drafts over time.

Every reviewed draft should store:

```txt
original Hermes draft
final human-approved version
diff between original and final
reviewer feedback
feedback category
ticket category
agency
product area
whether the draft was approved as-is, edited, or rejected
```

Recommended feedback categories:

```txt
approved_as_is
edited_for_tone
edited_for_accuracy
edited_for_clarity
edited_for_length
missing_context
wrong_policy
wrong_agency_context
wrong_product_context
too_vague
too_confident
too_technical
rejected
```

Daily learning job:

```txt
Every day after work hours:
1. Review today's draft feedback.
2. Identify repeated human corrections.
3. Propose updates to the support drafting guide.
4. Propose new few-shot examples.
5. Propose Hermes skill changes.
6. Submit proposed skill update for Admin approval.
```

Hermes should not directly modify its production skill without Admin approval.

---

## 6. Agency Data Isolation

Confirmed decision: **Data between agencies must not cross-mix.**

This is a critical architectural rule.

Required controls:

```txt
every issue belongs to an agency
every user has allowed agency scopes
every KB entry has agency scope or global/internal scope
every Hermes tool call includes agency scope
Hermes cannot search across agencies unless explicitly allowed by Admin
reports are agency-scoped by default
Slack delivery must respect agency visibility
draft examples used for learning must not leak agency-specific information into another agency's context
```

Recommended data model:

```txt
Agency
UserAgencyAccess
Issue.agency_id
KnowledgeEntry.agency_id nullable
DraftFeedback.agency_id
HermesReport.agency_id nullable
AuditLog.agency_id nullable
```

Suggested KB visibility model:

```txt
agency_specific
global_sanitized
internal_admin_only
```

Hermes should only use `global_sanitized` examples across agencies.

---

## 7. Slack Reporting

Decision: **Hermes reports should be delivered to Slack**

Initial report channels:

```txt
daily support briefing
weekly support report
urgent ticket alert
Hermes approval-needed alert
```

Recommended Slack integration pattern:

```txt
Hermes generates report
    ↓
Hermes calls backend/MCP create_report
    ↓
Backend stores report
    ↓
Backend sends Slack message
    ↓
Backend stores Slack delivery log
```

This keeps Slack tokens in the backend, not inside random prompts.

Daily timing:

```txt
Weekdays at 9:00am Singapore time
```

Weekly timing:

```txt
Fridays at 5:00pm Singapore time
```

These times are provisional and can be tuned later.

---

## 8. Internal GitLab Integration

Decision: **Use internal GitLab, not GitHub**

Allowed product documentation source:

```txt
https://sgts.gitlab-dedicated.com/wog/gvt/gdsacedndgoventr/goventry/registration/-/tree/main/docs
```

Repo inspection strategy:

```txt
Primary: GitLab API
Fallback: local clone if GitLab API is not accessible
```

Hermes should be allowed to inspect the approved documentation path for context.

Hermes should not directly create GitLab issues. Instead:

```txt
1. Hermes identifies likely product bug or feature request.
2. Hermes creates a proposed GitLab issue.
3. PM/Product Ops/Admin reviews and edits.
4. Human approves.
5. Backend creates GitLab issue through GitLab API.
```

Recommended proposed GitLab issue payload:

```json
{
  "title": "Short issue title",
  "description": "Problem summary, observed behavior, expected behavior, evidence, linked support tickets",
  "labels": ["support-signal", "triage-needed"],
  "related_ticket_ids": [123, 124],
  "confidence": 0.82,
  "requires_approval": true
}
```

Security note:

```txt
GitLab access token should be stored only in backend secrets.
Hermes should call backend/MCP tools, not GitLab directly, unless a separate tightly scoped read-only token is approved.
```

---

## 9. Proposed Backend API Surface

### Auth

```txt
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /admin/users
PATCH /admin/users/:id
```

### Tickets

```txt
GET    /issues
POST   /issues
GET    /issues/:id
PATCH  /issues/:id
PATCH  /issues/:id/status
PATCH  /issues/:id/assignee
POST   /issues/:id/internal-notes
GET    /issues/:id/messages
```

### Hermes

```txt
POST /hermes/tickets/:id/triage
POST /hermes/tickets/:id/draft-reply
POST /hermes/tickets/:id/internal-note
POST /hermes/reports/daily
POST /hermes/reports/weekly
GET  /hermes/activity
GET  /hermes/reports
```

### Approval Queue

```txt
GET    /proposed-actions
GET    /proposed-actions/:id
POST   /proposed-actions
POST   /proposed-actions/:id/approve
POST   /proposed-actions/:id/reject
PATCH  /proposed-actions/:id/final-payload
POST   /proposed-actions/:id/execute
```

### Knowledge Base

```txt
GET    /knowledge
POST   /knowledge
PATCH  /knowledge/:id
DELETE /knowledge/:id
POST   /knowledge/suggestions
```

### GitLab

```txt
GET  /gitlab/docs/search
GET  /gitlab/docs/file
POST /gitlab/issues/proposals
POST /gitlab/issues/proposals/:id/approve
POST /gitlab/issues/proposals/:id/create
```

### Slack

```txt
POST /slack/reports/send
POST /slack/alerts/send
GET  /slack/delivery-logs
```

---

## 10. MCP Tool Surface for Hermes

Recommended MCP tools exposed to Hermes:

### Read tools

```txt
list_open_tickets
list_untriaged_tickets
get_ticket
get_ticket_messages
search_similar_tickets
search_knowledge_base
get_allowed_gitlab_docs
search_gitlab_docs
get_daily_metrics
get_weekly_metrics
```

### Action tools

```txt
auto_tag_ticket
auto_assign_ticket
create_internal_note
create_draft_reply
create_proposed_action
create_kb_suggestion
create_gitlab_issue_proposal
create_hermes_report
send_report_to_slack_via_backend
```

### Feedback tools

```txt
list_recent_draft_feedback
get_approved_examples
create_learning_summary
propose_skill_update
```

Tools not exposed initially:

```txt
send_email
delete_ticket
close_ticket_directly
execute_sql
create_gitlab_issue_directly
modify_user_roles
modify_agency_isolation
write_hermes_skill_directly
```

---

## 11. Suggested Monorepo Structure

```txt
goventry-support/
  apps/
    web/
      src/
        app/
        components/
        routes/
        api/
        hooks/
        auth/
        pages/
      package.json
      vite.config.ts

    api/
      app/
        __init__.py
        main.py
        config.py
        extensions.py

        routes/
          auth.py
          users.py
          issues.py
          agencies.py
          knowledge.py
          approval.py
          hermes.py
          gitlab.py
          slack.py
          webhooks_formsg.py
          webhooks_goventry.py

        services/
          auth_service.py
          issue_service.py
          assignment_service.py
          triage_service.py
          approval_service.py
          email_service.py
          knowledge_service.py
          gitlab_service.py
          slack_service.py
          hermes_service.py
          audit_service.py

        models/
          user.py
          role.py
          agency.py
          issue.py
          ticket_message.py
          knowledge_entry.py
          proposed_action.py
          draft_feedback.py
          audit_log.py
          hermes_report.py
          hermes_job_run.py

        schemas/
          auth_schema.py
          issue_schema.py
          approval_schema.py
          knowledge_schema.py
          hermes_schema.py
          gitlab_schema.py

        mcp/
          server.py
          tools/
            tickets.py
            knowledge.py
            reports.py
            gitlab.py
            feedback.py

      alembic/
      pyproject.toml

    hermes/
      README.md
      skills/
        goventry-support-drafting/SKILL.md
      jobs/
        daily-briefing.md
        weekly-report.md
        draft-learning-review.md

  infra/
    docker/
      web.Dockerfile
      api.Dockerfile
      mcp.Dockerfile
    compose.yaml

  docs/
    architecture.md
    hermes-operator-model.md
    security-and-agency-isolation.md
    migration-plan.md
```

---

## 12. Migration Plan

### Phase 0 — Freeze target decisions

```txt
confirm Vite React
confirm Flask backend
confirm SQLAlchemy replacement
confirm roles
confirm agency isolation
confirm Slack delivery
confirm GitLab API integration
```

Status: mostly confirmed.

---

### Phase 1 — Create new project skeleton

```txt
create apps/web Vite React app
create apps/api Flask app
create SQLAlchemy models
create Alembic setup
create docker-compose for local Postgres
create basic auth and admin login
```

Deliverable:

```txt
admin can log in
frontend can call backend /auth/me
database migration runs
```

---

### Phase 2 — Rebuild ticket core

```txt
migrate Issue model
migrate Agency model
migrate TeamMember/User model
migrate TicketMessage model
build ticket list API
build ticket detail API
build ticket update API
build frontend dashboard
```

Deliverable:

```txt
PM/Product Ops can view and manage tickets in Vite frontend.
```

---

### Phase 3 — Approval queue

```txt
create ProposedAction model
create approval queue API
create approval queue frontend
support edit-before-approve
support reject with reason
support audit trail
```

Deliverable:

```txt
Hermes-generated drafts can be reviewed, edited, approved, rejected, and audited.
```

---

### Phase 4 — Hermes integration

```txt
install/deploy Nous Hermes Agent separately
create GovEntry Support MCP server
expose safe MCP tools
create Hermes support drafting skill
create daily briefing job
create weekly report job
create draft learning review job
```

Deliverable:

```txt
Hermes can create internal notes, auto-tag, auto-assign, draft replies, and produce reports.
```

---

### Phase 5 — Slack reporting

```txt
create Slack app/token
store Slack secrets in backend
create Slack delivery service
wire Hermes reports to backend Slack delivery
log delivery status
```

Deliverable:

```txt
Daily and weekly support reports are sent to Slack.
```

---

### Phase 6 — GitLab documentation integration

```txt
create GitLab API client
support approved docs path
search docs through GitLab API
fallback to local clone if API unavailable
expose read-only GitLab docs MCP tools
create proposed GitLab issue flow
```

Deliverable:

```txt
Hermes can inspect approved GitLab docs and propose GitLab issues for human approval.
```

---

### Phase 7 — Feedback learning loop

```txt
store draft feedback
compute draft diffs
add feedback buttons in frontend
create approved examples library
create Hermes learning job
require Admin approval for skill updates
```

Deliverable:

```txt
Hermes learns from PM/Product Ops edits and proposes improvements to its drafting skill.
```

---

### Phase 8 — SSO integration

```txt
add internal SSO
map SSO groups to roles
keep admin password login as break-glass access
```

Deliverable:

```txt
Normal users log in through internal SSO.
Admin login remains as fallback.
```

---

## 13. Remaining Open Questions

1. What exact admin username should be bootstrapped for first login?
2. Should password login use JWT or server-side sessions?
3. Which Slack workspace and channel names should be used?
4. Which internal GitLab authentication method is available: personal access token, project token, group token, OAuth, or CI token?
5. Should UIUX users see all tickets or only UI/UX-tagged tickets?
6. Should auto-assignment be rule-based first, AI-based first, or hybrid?
7. What fields define agency separation in the current data?
8. Should cross-agency global trends be allowed if anonymized?
9. Should Hermes reports be stored forever or retained for a fixed period?
10. What is the deployment target: Vercel/Cloudflare for frontend and Render/Fly/Cloud Run for backend, or an internal platform?
11. Should external webhooks still exist if the frontend is gated behind login?
12. Should there be a separate agency-facing portal in the future?

---

## 14. Design Principle

The core operating model is:

```txt
Hermes does the work.
The backend controls the authority.
Humans approve external or irreversible decisions.
Admin approves changes to Hermes behavior.
Agency data never crosses boundaries by default.
```
