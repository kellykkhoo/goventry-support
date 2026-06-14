import Link from "next/link";
import { db } from "@/lib/db";
import { AgencyChips, PriorityBadge, SourceBadge, StatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  const issues = await db.issue.findMany({
    include: { assignee: true, agencies: { include: { agency: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Issues</h1>
        <Link href="/issues/new" className="btn">
          + New issue
        </Link>
      </div>
      <div className="card divide-y divide-border">
        {issues.map((i) => (
          <Link
            key={i.id}
            href={`/issues/${i.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel transition-colors"
          >
            <span className="w-12 shrink-0 text-xs text-muted">#{i.id}</span>
            <StatusBadge status={i.status} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {i.title}
              {i.aiDraftReply && (
                <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
                  AI draft ready
                </span>
              )}
            </span>
            <AgencyChips codes={i.agencies.map((a) => a.agency.code)} />
            <PriorityBadge priority={i.priority} />
            <SourceBadge source={i.source} />
            <span className="w-24 shrink-0 truncate text-right text-xs text-muted">
              {i.assignee?.name ?? "Unassigned"}
            </span>
          </Link>
        ))}
        {issues.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted">
            No issues yet. Run <code>npm run setup</code> to seed demo data.
          </div>
        )}
      </div>
    </div>
  );
}
