# GovEntry Support — v2 Full Rewrite Design Spec

_Spec date: 2026-06-14 · Source design: `goventry-support-architecture-plan-v2.md`_

## Context

The current `pmtool` repo is a **working, deployed Next.js 15 monolith** (Prisma + Postgres on Render) that already delivers the core job: FormSG/GovEntry webhooks → ticket store → Claude tool-use agent for triage + draft replies → human approve-and-send → resolved-ticket memory loop, plus a Kanban board and a cross-agency demand aggregate.

The v2 architecture plan calls for a **full rewrite** into a true frontend/backend split with a separate active-operator agent layer:

```
Vite React  →REST→  Flask + SQLAlchemy  →  PostgreSQL
Hermes Agent  →MCP/internal API→  Flask  →  PostgreSQL / Slack / internal GitLab
```

The new capabilities v2 wants — authentication + RBAC, **agency data isolation**, an **approval queue** with edit-before-approve and audit, a **draft-feedback learning loop**, **Slack reporting**, **internal GitLab** docs + proposed-issue flow, and **Hermes** as a scheduled active operator — are the point of the rewrite. The same domain entities and human-approval workflow that work today are conceptually preserved.

**Decisions locked (this planning session):**
1. **Monorepo in place** — restructure THIS repo into the v2 layout; keep the Next.js app live on `main` until the new stack reaches parity, then retire it.
2. **Deploy target: internal gov platform** (RabbitDeploy/SHIP-style, container-based) — not commercial cloud. Everything ships as Docker images; aligns with the internal GitLab (`sgts.gitlab-dedicated.com`) and the existing render.yaml note that gov source must not live on commercial cloud.
3. **Foundation first** — Phases 1–2 are specced for execution here; Phases 3–8 are sequenced at roadmap level.
4. **Reseed fresh** — recreate the schema as SQLAlchemy models + Alembic and rebuild the demo seed natively (all current data is mock).

---

## Target Monorepo Layout (introduced incrementally)

```
goventry-support/            # this repo, restructured
  apps/
    web/      # Vite + React + TS + TanStack Query + React Router + Tailwind + shadcn/ui + Zod
    api/      # Flask + SQLAlchemy 2.0 + Alembic + Pydantic + JWT + Gunicorn
      app/{__init__,config,extensions}.py
      app/routes/{auth,admin,issues,agencies,knowledge,approval,hermes,gitlab,slack,webhooks_formsg,webhooks_goventry}.py
      app/services/{auth,issue,assignment,triage,approval,email,knowledge,gitlab,slack,hermes,audit}_service.py
      app/models/*.py
      app/schemas/*.py
      app/mcp/{server.py,tools/*.py}
      alembic/  ·  pyproject.toml
    hermes/   # agent runtime: skills/ + jobs/ (daily-briefing, weekly-report, draft-learning-review)
  infra/docker/{web,api,mcp}.Dockerfile  ·  infra/compose.yaml
  docs/{architecture,hermes-operator-model,security-and-agency-isolation,migration-plan}.md
  (legacy Next.js app stays at repo root until parity, then removed)
```

The existing Next.js app is **not deleted up front** — it keeps running while `apps/api` + `apps/web` are built and verified. Retire it only when Phase 2 reaches parity.

---

## Phase 1 — Skeleton + Auth (detailed)

**Goal:** admin can log in; frontend calls `/auth/me`; migrations run; everything runs in containers locally via compose.

### Backend `apps/api`
- **App factory** `app/__init__.py` (`create_app(config)`), extensions in `extensions.py` (`db = SQLAlchemy()`, `migrate = Migrate()`, `jwt = JWTManager()`, `cors = CORS()`). `config.py` reads env via Pydantic settings.
- **Stack:** Python 3.12, Flask, SQLAlchemy 2.0 (typed `Mapped[]` models), Alembic via Flask-Migrate, Flask-JWT-Extended, Passlib/bcrypt, Flask-CORS, Gunicorn. Managed with `uv` + `pyproject.toml`.
- **Auth: JWT** — `auth_service.py` behind an `AuthService` class so SSO (Phase 8) can replace the credential provider without touching routes. Endpoints: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /admin/users`, `PATCH /admin/users/:id`.
- **RBAC** — roles `PM | Product Ops | UIUX | Admin` as a `roles` table + `users.role_id`; a `@require_role(...)` decorator enforces the v2 permission matrix. Capability checks centralized in `auth_service`.
- **Admin bootstrap** — first admin created from env (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`) via a `flask bootstrap-admin` CLI command; never hard-coded.
- **Models this phase:** `User`, `Role`, `Agency`, `UserAgencyAccess` — agency scaffolding is added now so isolation is baked in from the start, not retrofitted.

### Frontend `apps/web`
- Vite + React 19 + TypeScript, React Router v7, TanStack Query v5, Tailwind CSS v3, Zod.
- Screens this phase: **login page**, an authenticated shell (sidebar nav), and a `/auth/me`-gated route guard. No ticket UI yet.
- Frontend must NOT touch DB/email/LLM/secrets directly — all via the REST `api` client module.

### Infra
- `infra/docker/{api,web}.Dockerfile` + `infra/compose.yaml` (api + web + Postgres). Container-first so the internal platform can run the same images. `flask db upgrade` runs as a container start step.

**Deliverable:** `docker compose -f infra/compose.yaml up` → admin logs in via the Vite app → frontend shows `/auth/me` response → Alembic migration creates all Phase-1 tables.

---

## Phase 2 — Ticket Core (detailed)

**Goal:** PM/Product Ops view and manage tickets in the Vite frontend, at parity with today's app.

### SQLAlchemy data model

Port the existing six Prisma models and add the isolation/authority tables. **Agency scoping is enforced via `issue_service` filters from day one** — never trusted from the client.

| Table | Origin | Notes |
|---|---|---|
| `users`, `roles` | Phase 1 | RBAC |
| `agencies` | port `Agency` | code unique (MOH, NEA, MINDEF, HDB, LTA, MOM, MOE, MFA, GOVTECH) |
| `user_agency_access` | Phase 1 | which agencies each user may see |
| `issues` | port `Issue` | + `agency_id` first-class scope; keep status/priority/product/issueType/source/sourceRef(unique)/requester/assignee/AI fields/resolutionSummary |
| `issue_agencies` | port `IssueAgency` | many-to-many tag join (a ticket can touch multiple agencies) |
| `team_members` | port `TeamMember` | may merge into `users` in a later phase |
| `ticket_messages` | port `TicketMessage` | direction inbound/outbound/note |
| `knowledge_entries` | port `KnowledgeEntry` | + `agency_id` nullable + `visibility` (agency_specific / global_sanitized / internal_admin_only) |
| `proposed_actions` | new (Phase 3) | approval queue — schema only, no logic yet |
| `audit_logs` | new | `agency_id` nullable |

### Ticket API
`routes/issues.py` + `issue_service.py`: `GET /issues`, `POST /issues`, `GET /issues/:id`, `PATCH /issues/:id`, `PATCH /issues/:id/status`, `PATCH /issues/:id/assignee`, `POST /issues/:id/internal-notes`, `GET /issues/:id/messages`. Every list query is filtered by the caller's allowed agency set.

### Logic ported from the current TS app (re-implemented in Python)
- **Triage agent** `src/lib/triage.ts` → `services/triage_service.py`: Anthropic Python SDK, same tool-use loop (`search_knowledge_base`, `search_tickets`), JSON-schema-constrained output, same system prompt with feature→product→repo mapping. **Model `claude-opus-4-8` (Opus 4.8) is correct — keep it.**
- **Email adapter** `src/lib/email.ts` → `services/email_service.py`: provider auto-select M365 Graph → Postman.gov.sg → dev-console, same env-var contract.
- **KB/ticket keyword search** `src/lib/search.ts` → `services/knowledge_service.py` (same scoring logic).
- **Agencies aggregate** ported into `routes/agencies.py` (top requests across agencies).

### Frontend
Ticket dashboard (list + agencies aggregate), ticket detail view (thread, controls, AI panel placeholder), role-based UI controls per the v2 permission matrix.

---

## Roadmap — Phases 3–8 (sequenced, detail deferred)

- **Phase 3 — Approval queue.** `proposed_actions` routes + `approval_service.py`. Frontend queue with edit-before-approve, reject-with-reason, audit trail. Authority gate lives in the backend — agents propose, humans/admins approve.
- **Phase 4 — Hermes integration.** `apps/hermes` runtime + GovEntry Support MCP server (`app/mcp/`). Safe tools only — reads + proposal-creating writes, never irreversible actions directly. Daily-briefing + weekly-report jobs.
- **Phase 5 — Slack reporting.** `slack_service.py` + `slack_delivery_logs`. Hermes → backend `create_report` → backend sends Slack (tokens stay in backend). Weekdays 9am SGT, Fri 5pm SGT.
- **Phase 6 — Internal GitLab.** `gitlab_service.py` client for the approved docs path, read-only MCP tools, proposed-GitLab-issue flow. Token in backend secrets only.
- **Phase 7 — Feedback learning loop.** `draft_feedback` table, frontend feedback buttons, daily learning job proposes skill updates → Admin approval required. Approved examples restricted to `global_sanitized`.
- **Phase 8 — SSO.** Add internal SSO behind the `AuthService` interface; map SSO groups → roles; admin password login remains as break-glass.

---

## Key Risks / Open Questions

1. **Internal platform specifics (blocking for deploy):** RabbitDeploy/SHIP build & runtime contract, secret injection, Postgres provisioning, cron/worker support for Hermes. Must be resolved before infra is finalized.
2. **FormSG decryption in Python:** `@opengovsg/formsg-sdk` (ed25519 verify + NaCl decrypt) is Node-only. Recommended: reimplement with PyNaCl; fallback is a thin Node webhook shim. GovEntry HMAC-SHA512 is trivial in Python.
3. **Internal GitLab auth type** (PAT / project / group / OAuth / CI token) — affects `gitlab_service`.
4. **UIUX visibility, auto-assignment mode, report retention, cross-agency trends** — v2 §13 Q5/6/8/9; default to most restrictive until decided.
5. **Secrets hygiene:** current repo tracks `.env` + `.pem`/`.key` files at root + stale `prisma/dev.db`. The rewrite must keep all secrets out of git and load from the platform secret store.
