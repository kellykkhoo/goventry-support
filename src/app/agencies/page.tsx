import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AgenciesPage() {
  const agencies = await db.agency.findMany({
    include: { issues: true },
    orderBy: { code: "asc" },
  });

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
    </div>
  );
}
