# GovEntry PM Tool

Product management + support tool for the GovEntry / GovSupply / GovRewards team.
Linear-style issue tracking with automated ticket intake (FormSG + GovEntry webhooks),
email replies from the web, and an AI triage agent with a knowledge-base memory.

## Stack

Next.js (App Router, TypeScript) · Prisma + SQLite (swap to Postgres at deploy) ·
Tailwind CSS · dnd-kit (kanban) · Claude API (`claude-opus-4-8`) · Resend → Postman.gov.sg (email)

## Run it

```bash
cp .env.example .env        # fill in ANTHROPIC_API_KEY for AI triage (rest optional)
npm install
npm run setup               # creates SQLite db + seeds demo data
npm run dev                 # http://localhost:3000
```

Without any keys set: the app fully works; AI triage is skipped and "sent" emails are
logged to the dev console instead of delivered.

## How the pieces fit

```
FormSG  ──▶ POST /api/webhooks/formsg    (ed25519 verify + decrypt, idempotent on submissionId)
GovEntry ─▶ POST /api/webhooks/goventry  (v1 HMAC verify + replay window, idempotent on event id)
Web form ─▶ /support                     (public intake page)
                 │
                 ▼
           issues table ──▶ triage agent (src/lib/triage.ts)
                                │   Claude + 2 tools: search_knowledge_base, search_tickets
                                ▼
                  classification + draft reply on the ticket
                                │   human reviews on /issues/[id]
                                ▼
                  "Approve & send" ──▶ email (src/lib/email.ts) + thread
                                │
                  resolve w/ summary ──▶ knowledge_base  (the memory loop)
```

## Webhook setup

**FormSG** (Storage mode forms only)
1. Form admin → Settings → Webhooks → set `https://<your-domain>/api/webhooks/formsg`
2. Put the form's secret key in `.env` as `FORMSG_SECRET_KEY`, and the exact same URL as `FORMSG_WEBHOOK_URI`
3. Field mapping is by question text in `src/app/api/webhooks/formsg/route.ts` (`FIELD_MAP`)
4. FormSG re-sends webhooks even after success — handled via the `sourceRef` idempotency key

**GovEntry** (Registration Webhook spec v1.0.0)
1. Subscribe your endpoint `https://<your-domain>/api/webhooks/goventry` with the GovEntry team
2. Put the shared secret in `.env` as `GOVENTRY_WEBHOOK_SECRET`
3. ⚠️ Signature is verified as HMAC-SHA512 over `"<timestamp>.<body>"` (v1 scheme, hex).
   The spec excerpt didn't name the algorithm — if the OpenAPI security section differs,
   adjust one line in `src/app/api/webhooks/goventry/route.ts` (`verifySignature`),
   or confirm with GovEntry_Support@tech.gov.sg.

For local webhook testing, expose your dev server with a tunnel (e.g. `cloudflared tunnel` or ngrok).

## Production notes (before real data)

- Swap Prisma datasource to `postgresql` + a managed Postgres; `prisma db push` migrates the schema
- Replace Resend with Postman.gov.sg in `src/lib/email.ts` (one function)
- Add team login in front of the internal pages (the `/support` form and webhooks stay public)
- Set `GOVENTRY_WEBHOOK_SECRET` — verification is only skippable in dev
- Mock data only until your data-classification clearance covers the Claude API path
- Background triage runs in-process (`triageInBackground`) — fine on a Node server (RabbitDeploy),
  but on serverless hosts (Vercel) move it to a queue or use `waitUntil`

## AI triage agent

`src/lib/triage.ts` is the harness: Claude (model `claude-opus-4-8`) gets the ticket and two
search tools, investigates the knowledge base + existing tickets, and returns structured JSON
(classification, similar tickets, draft reply, confidence). It never sends anything — every
outbound email is human-approved on the issue page. Resolving a ticket writes the resolution
summary into the knowledge base, which is what makes future similar tickets faster.
