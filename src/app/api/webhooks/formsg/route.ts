import { NextRequest, NextResponse } from "next/server";
import formsgSdk from "@opengovsg/formsg-sdk";
import { db } from "@/lib/db";
import { triageInBackground } from "@/lib/triage";
import { extractSupportFields } from "@/lib/ticketFields";

/**
 * FormSG webhook receiver (Storage mode forms only) — the support intake channel.
 *
 * Per the FormSG SDK spec:
 *  - verify the X-FormSG-Signature header (ed25519) against the exact public
 *    webhook URI configured in the form's Settings -> Webhooks
 *  - decrypt the payload with the form's secret key
 *  - FormSG RE-SENDS webhooks even after successful delivery, so processing
 *    must be idempotent: we key on the submissionId (stored as sourceRef).
 *
 * Fields are matched by question label keyword (see src/lib/ticketFields.ts),
 * so the FormSG form can mirror the support form fields:
 *   Name · Email · CC To · Which agency are you from? · Which feature…? ·
 *   What type of issue are you raising? · How is this impacting your work? ·
 *   Describe your issue
 */

const formsg = formsgSdk({ mode: "production" });

type FormResponse = { question?: string; answer?: string; answerArray?: string[] };

async function createTicketFromResponses(
  responses: FormResponse[],
  sourceRef: string,
  submittedAt?: Date,
) {
  // Flatten FormSG responses into a label -> answer map
  const byLabel: Record<string, string> = {};
  for (const r of responses) {
    if (r.question) byLabel[r.question] = r.answer ?? (r.answerArray ?? []).join(", ");
  }

  const s = extractSupportFields(byLabel);

  const agencyCode = (s.agency ?? "").toUpperCase().trim();
  const agency = agencyCode
    ? await db.agency.findUnique({ where: { code: agencyCode } })
    : null;

  const title = (
    (s.feature ? `[${s.feature}] ` : "") +
    (s.description ?? `Support request — ${s.name ?? "FormSG"}`)
  ).slice(0, 80);

  const description = [
    s.description ?? "",
    s.feature ? `Feature: ${s.feature}` : null,
    s.ccTo ? `CC: ${s.ccTo}` : null,
    "— via FormSG support form",
  ]
    .filter(Boolean)
    .join("\n\n");

  const issue = await db.issue.create({
    data: {
      title,
      description,
      issueType: s.issueType ?? "User Guide Question",
      priority: s.severity ?? "Medium",
      product: s.product ?? "GovEntry",
      status: "Backlog",
      source: "formsg",
      sourceRef,
      requesterName: s.name ?? null,
      requesterEmail: s.email ?? null,
      submittedAt: submittedAt ?? null,
      ...(agency ? { agencies: { create: [{ agencyId: agency.id }] } } : {}),
    },
  });

  // Respond fast (FormSG retries slow endpoints); triage runs in the background.
  triageInBackground(issue.id);
  return issue;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  // DEV-ONLY simulation path: FormSG's ed25519 signature cannot be faked, so
  // local tests of the field mapping post `{devTest: true, responses: [...]}`
  // (see scripts/test-formsg.mjs). Hard-disabled in production builds.
  if (process.env.NODE_ENV !== "production" && body.devTest === true) {
    const submittedAt = body.data?.created ? new Date(body.data.created) : undefined;
    const issue = await createTicketFromResponses(
      body.responses ?? [],
      `formsg-dev:${crypto.randomUUID()}`,
      submittedAt,
    );
    return NextResponse.json({ message: "ok (dev simulation)", issueId: issue.id });
  }

  const signature = req.headers.get("x-formsg-signature");
  const webhookUri = process.env.FORMSG_WEBHOOK_URI;

  if (!signature) {
    return NextResponse.json({ message: "Missing X-FormSG-Signature" }, { status: 401 });
  }
  if (!webhookUri || !process.env.FORMSG_SECRET_KEY) {
    return NextResponse.json(
      { message: "Server not configured: set FORMSG_WEBHOOK_URI and FORMSG_SECRET_KEY" },
      { status: 500 },
    );
  }

  try {
    formsg.webhooks.authenticate(signature, webhookUri);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const submission = formsg.crypto.decrypt(process.env.FORMSG_SECRET_KEY, body.data);
  if (!submission) {
    return NextResponse.json({ message: "Decryption failed" }, { status: 400 });
  }

  const submissionId: string = body.data.submissionId;

  // Idempotency: FormSG may deliver the same submission multiple times.
  const existing = await db.issue.findUnique({ where: { sourceRef: `formsg:${submissionId}` } });
  if (existing) {
    return NextResponse.json({ message: "Already processed", issueId: existing.id });
  }

  // Extract FormSG submission timestamp if available
  const submittedAt = body.data?.created ? new Date(body.data.created) : undefined;

  const issue = await createTicketFromResponses(
    submission.responses as FormResponse[],
    `formsg:${submissionId}`,
    submittedAt,
  );

  return NextResponse.json({ message: "ok", issueId: issue.id });
}
