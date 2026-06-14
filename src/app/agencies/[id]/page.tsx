import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PriorityBadge, SourceBadge, StatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function AgencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agency = await db.agency.findUnique({
    where: { id: Number(id) },
    include: {
      issues: {
        include: { issue: { include: { assignee: true } } },
        orderBy: { issueId: "desc" },
      },
    },
  });
  if (!agency) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <Link href="/agencies" className="text-xs text-muted hover:text-zinc-300">
          ← Agencies
        </Link>
        <h1 className="text-lg font-semibold text-white">
          {agency.code} <span className="font-normal text-muted">— {agency.name}</span>
        </h1>
        <div className="text-xs text-muted">{agency.issues.length} issue(s) tagged</div>
      </div>
      <div className="card divide-y divide-border">
        {agency.issues.map(({ issue }) => (
          <Link
            key={issue.id}
            href={`/issues/${issue.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel transition-colors"
          >
            <span className="w-10 shrink-0 text-xs text-muted">#{issue.id}</span>
            <StatusBadge status={issue.status} />
            <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
            <PriorityBadge priority={issue.priority} />
            <SourceBadge source={issue.source} />
            <span className="w-24 shrink-0 truncate text-right text-xs text-muted">
              {issue.assignee?.name ?? "Unassigned"}
            </span>
          </Link>
        ))}
        {agency.issues.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted">No issues tagged yet.</div>
        )}
      </div>
    </div>
  );
}
