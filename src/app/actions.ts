"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { triageIssue, refineDraft as refineDraftAgent } from "@/lib/triage";

function revalidateAll(issueId?: number) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/agencies");
  revalidatePath("/team");
  revalidatePath("/knowledge");
  if (issueId) revalidatePath(`/issues/${issueId}`);
}

export async function createIssue(formData: FormData) {
  const agencyCodes = formData.getAll("agencies").map(String);
  const agencies = await db.agency.findMany({ where: { code: { in: agencyCodes } } });
  const fromIntake = formData.get("source") === "intake";

  const issue = await db.issue.create({
    data: {
      title: String(formData.get("title") ?? "").slice(0, 120) || "Untitled",
      description: String(formData.get("description") ?? ""),
      status: "Backlog",
      priority: String(formData.get("priority") ?? "Medium"),
      product: String(formData.get("product") ?? "GovEntry"),
      issueType: String(formData.get("issueType") ?? "Feature Request"),
      source: fromIntake ? "intake" : "web",
      requesterName: (formData.get("requesterName") as string) || null,
      requesterEmail: (formData.get("requesterEmail") as string) || null,
      assigneeId: formData.get("assigneeId") ? Number(formData.get("assigneeId")) : null,
      agencies: { create: agencies.map((a) => ({ agencyId: a.id })) },
    },
  });

  // Intake tickets get triaged automatically (fire and forget)
  if (fromIntake) {
    void triageIssue(issue.id).catch((e) => console.error("[triage]", e));
  }

  revalidateAll(issue.id);
  return { id: issue.id };
}

export async function updateIssueStatus(issueId: number, status: string) {
  await db.issue.update({ where: { id: issueId }, data: { status } });
  revalidateAll(issueId);
}

export async function updateIssueAssignee(issueId: number, assigneeId: number | null) {
  await db.issue.update({ where: { id: issueId }, data: { assigneeId } });
  revalidateAll(issueId);
}

/**
 * One action when the PM is happy with the reply: send it to the requester,
 * record it on the thread, save the problem + final answer to memory (so the
 * agent learns from it), and mark the ticket Done. Replaces the old separate
 * "send reply" + "resolve / save to memory" steps.
 */
export async function approveReplyAndResolve(issueId: number, body: string, senderName: string) {
  const issue = await db.issue.findUnique({ where: { id: issueId } });
  if (!issue) return { ok: false, detail: "Issue not found" };
  if (!issue.requesterEmail) return { ok: false, detail: "No requester email on this ticket" };
  if (!body.trim()) return { ok: false, detail: "Reply is empty" };

  // 1. Send the email
  const result = await sendEmail({
    to: issue.requesterEmail,
    subject: `[GovEntry Support #${issue.id}] ${issue.title}`,
    text: body,
  });
  if (!result.ok) {
    revalidateAll(issueId);
    return result; // don't resolve if the send failed
  }

  // 2. Record on the thread, 3. mark Done, 4. save problem + answer to memory
  await db.ticketMessage.create({
    data: { issueId, direction: "outbound", senderName, body },
  });
  await db.issue.update({
    where: { id: issueId },
    data: { status: "Done", resolutionSummary: body },
  });
  await db.knowledgeEntry.create({
    data: {
      title: `Resolved: ${issue.title}`,
      // Store BOTH the problem and the confirmed answer — this is what makes
      // future triage of similar tickets accurate.
      content: `PROBLEM:\n${issue.description}\n\nRESOLUTION (sent to requester):\n${body}`,
      sourceType: "resolved_ticket",
      issueId,
    },
  });

  revalidateAll(issueId);
  return { ok: true, detail: `${result.detail} · saved to memory · ticket resolved` };
}

/** Conversational refine: PM asks the agent to adjust the draft; returns new text. */
export async function refineDraft(issueId: number, currentDraft: string, instruction: string) {
  const revised = await refineDraftAgent(issueId, currentDraft, instruction);
  if (!revised) return { ok: false, detail: "Refine failed — is ANTHROPIC_API_KEY set?", draft: currentDraft };
  return { ok: true, detail: "revised", draft: revised };
}

export async function addKnowledgeDoc(formData: FormData) {
  await db.knowledgeEntry.create({
    data: {
      title: String(formData.get("title") ?? "Untitled"),
      content: String(formData.get("content") ?? ""),
      sourceType: "doc",
    },
  });
  revalidatePath("/knowledge");
}

export async function deleteKnowledgeEntry(id: number) {
  await db.knowledgeEntry.delete({ where: { id } });
  revalidatePath("/knowledge");
}

export async function runTriage(issueId: number) {
  const result = await triageIssue(issueId);
  revalidateAll(issueId);
  return { ok: result !== null };
}
