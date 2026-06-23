import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AgencyChips, PriorityBadge, SourceBadge, StatusBadge } from "@/components/badges";
import { IssueControls } from "@/components/IssueControls";
import { TriagePanel } from "@/components/TriagePanel";
import { ReplyBox } from "@/components/ReplyBox";

export const dynamic = "force-dynamic";

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await db.issue.findUnique({
    where: { id: Number(id) },
    include: {
      assignee: true,
      agencies: { include: { agency: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!issue) notFound();

  const team = await db.teamMember.findMany();

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      {/* Main column */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted">
          <span>#{issue.id}</span>
          <SourceBadge source={issue.source} />
          <span>{issue.issueType}</span>
          <span>·</span>
          <span>{issue.product}</span>
        </div>
        <h1 className="mb-3 text-xl font-semibold text-white">{issue.title}</h1>
        <div className="mb-4 flex items-center gap-2">
          <StatusBadge status={issue.status} />
          <PriorityBadge priority={issue.priority} />
          <AgencyChips codes={issue.agencies.map((a) => a.agency.code)} />
        </div>

        {issue.description && (
          <div className="card mb-5 whitespace-pre-wrap p-4 text-sm text-zinc-300">
            {issue.description}
          </div>
        )}

        {issue.requesterEmail && (
          <div className="mb-5 text-xs text-muted">
            Requester: <span className="text-zinc-300">{issue.requesterName ?? "—"}</span> ·{" "}
            <span className="text-zinc-300">{issue.requesterEmail}</span>
            {issue.submittedAt && (
              <>
                {" "}· Submitted: <span className="text-zinc-300">{new Date(issue.submittedAt).toLocaleString("en-SG")}</span>
              </>
            )}
          </div>
        )}

        {/* Conversation thread */}
        <h2 className="mb-2 text-sm font-medium text-white">Conversation</h2>
        <div className="mb-4 flex flex-col gap-2">
          {issue.messages.length === 0 && (
            <div className="text-xs text-muted">No messages yet.</div>
          )}
          {issue.messages.map((m) => (
            <div
              key={m.id}
              className={`card max-w-[85%] p-3 text-sm ${
                m.direction === "outbound" ? "self-end border-accent/40" : "self-start"
              }`}
            >
              <div className="mb-1 text-[11px] text-muted">
                {m.senderName} · {m.direction} · {m.createdAt.toLocaleString("en-SG")}
              </div>
              <div className="whitespace-pre-wrap text-zinc-300">{m.body}</div>
            </div>
          ))}
        </div>

        {issue.requesterEmail ? (
          <ReplyBox issueId={issue.id} initialDraft={issue.aiDraftReply ?? ""} />
        ) : (
          <div className="card p-3 text-xs text-muted">
            No requester email on this ticket — replies are disabled.
          </div>
        )}
      </div>

      {/* Side column */}
      <div className="w-80 shrink-0">
        <IssueControls
          issueId={issue.id}
          status={issue.status}
          assigneeId={issue.assigneeId}
          team={team.map((t) => ({ id: t.id, name: t.name }))}
        />
        <TriagePanel
          issueId={issue.id}
          triageJson={issue.aiTriageJson}
          triagedAt={issue.triagedAt?.toISOString() ?? null}
        />
        {issue.status === "Done" && issue.resolutionSummary && (
          <div className="card mt-4 p-4">
            <div className="mb-1 text-xs font-medium text-emerald-400">
              Resolved · saved to memory
            </div>
            <div className="whitespace-pre-wrap text-xs text-zinc-300">{issue.resolutionSummary}</div>
          </div>
        )}
      </div>
    </div>
  );
}
