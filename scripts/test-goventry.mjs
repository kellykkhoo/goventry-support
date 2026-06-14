#!/usr/bin/env node
/**
 * Sends a fake GovEntry registration event to your LOCAL dev server,
 * signed exactly per the Registration Webhook spec v1.0.0
 * (X-GovEntry-Signature: v1=<hex HMAC-SHA512 of "<timestamp>.<body>">).
 *
 * - If GOVENTRY_WEBHOOK_SECRET is set in .env, the request is signed with it
 *   and this also tests your signature verification.
 * - If the secret is empty, verification is skipped in dev and this just
 *   tests the event -> ticket mapping.
 *
 * Each run uses a fresh event UUID, so each run creates one new ticket.
 * Run it twice with EVENT_ID=<same-uuid> to see idempotency kick in.
 *
 * Usage:  node scripts/test-goventry.mjs            # registration/attendance event
 *         node scripts/test-goventry.mjs support    # support-form submission
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const URL = process.env.PMTOOL_URL ?? "http://localhost:3000";

// read GOVENTRY_WEBHOOK_SECRET from .env (no dotenv dependency needed)
let secret = "";
try {
  const env = readFileSync(new globalThis.URL("../.env", import.meta.url), "utf8");
  secret = env.match(/^GOVENTRY_WEBHOOK_SECRET="(.*)"/m)?.[1] ?? "";
} catch {}

const supportMode = process.argv[2] === "support";

// Support mode mirrors a GovEntry sign-up form configured as a support form:
// the custom Dropdown / Short Answer fields arrive as metadata key-value pairs.
// Mirrors the LIVE "GovEntry Product Support" form exactly — labels (including
// the trailing space in "Name "), long option strings, CC To, feature dropdown.
const metadata = supportMode
  ? {
      "Name ": "TEST OFFICER LIM (simulation)",
      "CC To": "team_lead@agency.gov.sg",
      "Which agency are you from?": "GovTech",
      "Which GovEntry feature is your enquiry about?": "Gamification",
      "What type of issue are you raising?": "Bug — Something isn't working the way it should",
      "How is this issue impacting your work?":
        "High — I'm blocked or a deadline/launch is at risk; needs attention ASAP",
      "Describe your issue":
        "TEST (GovEntry support form): Gamification points are not awarded after attendees complete check-in.",
    }
  : { "Person Name": "TEST ATTENDEE (simulation)", "Official ID": "S1234567D" };

const event = {
  id: process.env.EVENT_ID ?? crypto.randomUUID(),
  why: "registration",
  how: "attendance-self",
  // Attendee ID type is Email on the support event, so who.id is the email
  who: supportMode
    ? { id: "test_officer@agency.gov.sg", metadata: {} }
    : { id: "T3000006J", metadata: {} },
  what: supportMode ? "GovEntry Product Support" : "NDP 2026 Volunteer Briefing",
  when: new Date().toISOString(),
  where: {
    id: "AT-002",
    metadata: {},
    opens_at: new Date().toISOString(),
    closes_at: new Date(Date.now() + 86400000).toISOString(),
  },
  metadata,
};

const body = JSON.stringify(event);
const ts = Math.floor(Date.now() / 1000).toString();
const headers = {
  "Content-Type": "application/json",
  "X-GovEntry-Timestamp": ts,
};
if (secret) {
  const sig = crypto.createHmac("sha512", secret).update(`${ts}.${body}`).digest("hex");
  headers["X-GovEntry-Signature"] = `v1=${sig}`;
  console.log("Signing with GOVENTRY_WEBHOOK_SECRET from .env");
} else {
  console.log("No GOVENTRY_WEBHOOK_SECRET in .env — dev server will skip verification");
}

const res = await fetch(`${URL}/api/webhooks/goventry`, { method: "POST", headers, body });
const json = await res.json();
console.log(`HTTP ${res.status}:`, json);
if (res.ok && json.issueId) {
  console.log(`\n✓ Ticket created — open ${URL}/issues/${json.issueId}`);
} else {
  console.log("\n✗ Something went wrong — is the dev server running (npm run dev)?");
}
