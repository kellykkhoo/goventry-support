import Link from "next/link";
import { db } from "@/lib/db";
import { PriorityBadge, StatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const team = await db.teamMember.findMany({
    include: {
      issues: {
        where: { status: { notIn: ["Cancelled"] } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  const unassigned = await db.issue.findMany({
    where: { assigneeId: null, status: { notIn: ["Done", "Cancelled"] } },
  });

  const groups = [
    ...team.map((t) => ({ name: t.name, role: t.role, issues: t.issues })),
    { name: "Unassigned", role: "", issues: unassigned },
  ];

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold text-white">Team</h1>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {groups.map((g) => (
          <div key={g.name} className="rounded-lg border border-border bg-panel p-3">
            <div className="mb-2 px-1">
              <div className="text-sm font-medium text-white">{g.name}</div>
              <div className="text-[11px] text-muted">
                {g.role && `${g.role} · `}
                {g.issues.length} active
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {g.issues.map((i) => (
                <Link key={i.id} href={`/issues/${i.id}`} className="card block p-3 hover:border-accent transition-colors">
                  <div className="mb-1.5 text-sm text-zinc-200">
                    <span className="mr-1 text-xs text-muted">#{i.id}</span>
                    {i.title}
                  </div>
                  <div className="flex gap-1.5">
                    <StatusBadge status={i.status} />
                    <PriorityBadge priority={i.priority} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
