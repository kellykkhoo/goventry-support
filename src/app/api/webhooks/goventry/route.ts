import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { triageInBackground } from "@/lib/triage";

/**
 * GovEntry Registration Webhook receiver (spec v1.0.0).
 *
 * Headers (per spec):
 *  - X-GovEntry-Signature: "v1=<hex>"  (version-prefixed to prevent downgrade attacks)
 *  - X-GovEntry-Timestamp: epoch seconds (replay protection — we allow 5 min skew)
 *
 * Payload: { id (uuid), why, how, who{id, metadata}, what (campaign),
 *            when (date-time), where{id, metadata, opens_at, closes_at}, metadata{} }
 *
 * NOTE on the algorithm: the spec excerpt shows a 64-byte hex signature but the
 * pasted portion doesn't name the algorithm. We verify HMAC-SHA512 over
 * "<timestamp>.<rawBody>" (the common gov webhook pattern; output length matches).
 * If the OpenAPI security section differs, fix ONLY the `expectedSignature`
 * line below — or confirm with GovEntry_Support@tech.gov.sg.
 */

type GovEntryEvent = {
  id: string;
  why: string;
  how: string;
  who: { id: string; metadata: Record<string, unknown> };
  what: string;
  when: string;
  where: { id: string; metadata: Record<string, unknown>; opens_at?: string; closes_at?: string };
  metadata: Record<string, string>;
};

function verifySignature(rawBody: string, signature: string, timestamp: string, secret: string): boolean {
  if (!signature.startsWith("v1=")) return false; // only v1 scheme exists; reject anything else
  const provided = signature.slice(3);
  const expectedSignature = crypto
    .createHmac("sha512", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expectedSignature, "hex"));
  } catch {
    return false;
  }
}

/**
 * GovEntry pings the webhook URL with a GET to verify it's reachable before
 * (and sometimes while) delivering events. Answer 200 so the endpoint validates.
 * If GovEntry sends a verification challenge as a query param, echo it back.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const challenge =
    url.searchParams.get("challenge") ??
    url.searchParams.get("token") ??
    url.searchParams.get("verification");
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ status: "ok", endpoint: "goventry-webhook" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-goventry-signature") ?? "";
  const timestamp = req.headers.get("x-goventry-timestamp") ?? "";

  // DEV CAPTURE: log the raw inbound payload + headers so we can see the exact
  // encryption envelope GovEntry uses, then implement decryption to match.
  // Remove once decryption is confirmed working.
  if (process.env.NODE_ENV !== "production") {
    console.log("\n===== GOVENTRY WEBHOOK RECEIVED =====");
    console.log("headers:", JSON.stringify(Object.fromEntries(req.headers), null, 2));
    console.log("raw body (first 1200 chars):\n" + rawBody.slice(0, 1200));
    console.log("body length:", rawBody.length);
    console.log("=====================================\n");
  }

  const secret = process.env.GOVENTRY_WEBHOOK_SECRET;
  if (secret) {
    // Replay protection: reject timestamps more than 5 minutes off
    const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!timestamp || Number.isNaN(Number(timestamp)) || skew > 300) {
      return NextResponse.json({ message: "Stale or missing timestamp" }, { status: 401 });
    }
    if (!verifySignature(rawBody, signature, timestamp, secret)) {
      return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "GOVENTRY_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  let event: GovEntryEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  // Idempotency on the event UUID
  const sourceRef = `goventry:${event.id}`;
  const existing = await db.issue.findUnique({ where: { sourceRef } });
  if (existing) {
    return NextResponse.json({ message: "Already processed", issueId: existing.id });
  }

  const meta = event.metadata ?? {};
  const personName =
    findMeta(meta, /full name|person name|^name$/i) ?? event.who?.id ?? "Unknown attendee";

  // SUPPORT-FORM mode: a GovEntry sign-up form configured as a support form
  // (custom Dropdown/Short Answer fields) puts those answers in `metadata`.
  // If the metadata carries support fields, build a real support ticket.
  // If the event's Attendee ID type is Email, who.id IS the requester's email —
  // use it as the fallback reply-to when no email field is found in metadata.
  const whoIdEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(event.who?.id ?? "")
    ? event.who.id
    : undefined;

  // Field labels per the live "GovEntry Product Support" form:
  //   "Name " · "Email" (_who) · "CC To" (_cc) · "Which agency are you from?"
  //   "Which GovEntry feature is your enquiry about?" (Entry/Gamification/Distribution)
  //   "What type of issue are you raising?" · "How is this issue impacting your work?"
  //   "Describe your issue"
  // Matching is by keyword so minor label edits in the portal don't break intake.
  const support = {
    email: findMeta(meta, /^email|contact email/i) ?? whoIdEmail,
    ccTo: findMeta(meta, /cc to|^cc$/i),
    agency: findMeta(meta, /agency/i),
    feature: findMeta(meta, /feature.*enquiry|which.*feature/i),
    product: findMeta(meta, /^product$/i),
    issueType: normalizeIssueType(findMeta(meta, /issue type|type of issue|issue are you raising/i)),
    severity: normalizeSeverity(findMeta(meta, /severity|impact/i)),
    description: findMeta(meta, /describe|description|details of/i),
  };
  const isSupportTicket = !!(support.description || support.issueType);

  if (isSupportTicket) {
    const agencyCode = (support.agency ?? "").toUpperCase().trim();
    const agency = agencyCode
      ? await db.agency.findUnique({ where: { code: agencyCode } })
      : null;

    const title = (
      (support.feature ? `[${support.feature}] ` : "") +
      (support.description ?? `Support request — ${personName}`)
    ).slice(0, 80);

    const descriptionParts = [
      support.description ?? "",
      support.feature ? `Feature: ${support.feature}` : null,
      support.ccTo ? `CC: ${support.ccTo}` : null,
      `— via GovEntry form "${event.what}" at ${event.when}`,
    ].filter(Boolean);

    const issue = await db.issue.create({
      data: {
        title,
        description: descriptionParts.join("\n\n"),
        issueType: support.issueType ?? "User Guide Question",
        priority: support.severity ?? "Medium",
        product: support.product ?? "GovEntry",
        status: "Backlog",
        source: "goventry",
        sourceRef,
        requesterName: personName,
        requesterEmail: support.email ?? null,
        ...(agency ? { agencies: { create: [{ agencyId: agency.id }] } } : {}),
      },
    });
    triageInBackground(issue.id);
    return NextResponse.json({ message: "ok (support ticket)", issueId: issue.id });
  }

  // REGISTRATION-EVENT mode: ordinary attendance/registration notifications.
  const description = [
    `GovEntry registration event (${event.why} / ${event.how})`,
    `Campaign: ${event.what}`,
    `Attendee: ${personName} (who.id: ${event.who?.id})`,
    `Location: ${event.where?.id}`,
    `At: ${event.when}`,
    `Metadata: ${JSON.stringify(meta, null, 2)}`,
  ].join("\n");

  // Assisted / walk-in check-ins usually mean something went wrong at the gate —
  // those are the ones worth a ticket. Self check-ins are recorded but low priority.
  const assisted = event.how?.includes("assisted") || event.how === "attendance-walk-in";

  const issue = await db.issue.create({
    data: {
      title: `[${event.what}] ${event.how} — ${personName}`.slice(0, 80),
      description,
      issueType: "Registration Event",
      priority: assisted ? "Medium" : "Low",
      product: "GovEntry",
      status: "Backlog",
      source: "goventry",
      sourceRef,
    },
  });

  triageInBackground(issue.id);

  return NextResponse.json({ message: "ok", issueId: issue.id });
}

/** Find a metadata value whose KEY matches the pattern (form field labels vary).
 *  Keys are trimmed first — the live form has labels like "Name " with trailing spaces. */
function findMeta(meta: Record<string, string>, pattern: RegExp): string | undefined {
  const key = Object.keys(meta).find((k) => pattern.test(k.trim()));
  const val = key ? meta[key] : undefined;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

/** The form's options are long labels like "Bug — Something isn't working the way
 *  it should" — normalize to the app's canonical issue types. */
function normalizeIssueType(v?: string): string | undefined {
  if (!v) return undefined;
  const s = v.toLowerCase();
  if (s.includes("bug")) return "Bug";
  if (s.includes("feature")) return "Feature Request";
  if (s.includes("support") || s.includes("help") || s.includes("guide")) return "User Guide Question";
  return v;
}

/** "High — I'm blocked or a deadline/launch is at risk…" -> "High" */
function normalizeSeverity(v?: string): string | undefined {
  const m = v?.match(/^\s*(low|medium|high|urgent)/i);
  if (!m) return undefined;
  const w = m[1].toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}
