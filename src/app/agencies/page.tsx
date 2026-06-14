import Link from "next/link";
import { db } from "@/lib/db";
import { AgencyChips, StatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function AgenciesPage() {
  const agencies = await db.agency.findMany({
    include: { issues: true },
    orderBy: { code: "asc" },
  });

  // Aggregate: requests ranked by how many agencies want them (cross-agency demand).
  const issues = await db.issue.findMany({
    where: { status: { not: "Cancelled" } },
    include: { agencies: { include: { agency: true } } },
  });
  const topRequests = issues
    .map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      agencyCodes: i.agencies.map((a) => a.agency.code),
    }))
    .filter((i) => i.agencyCodes.length > 0)
    .sort((a, b) => b.agencyCodes.length - a.agencyCodes.length)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-5 text-lg font-semibold text-white">Agencies</h1>
      <div className="grid grid-cols-2 gap-3">
        {agencies.map((a) => (
          <Link
            key={a.id}
            href={`/agencies/${a.id}`}
            className="card flex items-center justify-between p-4 hover:border-accent transition-colors"
          >
            <div>
              <div className="text-sm font-medium text-white">{a.code}</div>
              <div className="text-xs text-muted">{a.name}</div>
            </div>
            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-sm text-indigo-300">
              {a.issues.length}
            </span>
          </Link>
        ))}
      </div>

      {/* Aggregate view across all agencies */}
      <h2 className="mb-1 mt-8 text-sm font-semibold text-white">Top requests across agencies</h2>
      <p className="mb-3 text-xs text-muted">
        Ranked by how many agencies are asking for it — the more agencies, the stronger the case to
        prioritise.
      </p>
      <div className="card divide-y divide-border">
        {topRequests.map((r) => (
          <Link
            key={r.id}
            href={`/issues/${r.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel transition-colors"
          >
            <span className="w-8 shrink-0 text-center text-sm font-semibold text-indigo-300">
              {r.agencyCodes.length}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
            <AgencyChips codes={r.agencyCodes} />
            <StatusBadge status={r.status} />
          </Link>
        ))}
        {topRequests.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted">
            No agency-tagged requests yet.
          </div>
        )}
      </div>
    </div>
  );
}
