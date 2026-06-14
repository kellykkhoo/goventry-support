import { db } from "@/lib/db";
import { KanbanBoard } from "@/components/KanbanBoard";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const issues = await db.issue.findMany({
    include: { assignee: true, agencies: { include: { agency: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold text-white">Board</h1>
      <KanbanBoard
        issues={issues.map((i) => ({
          id: i.id,
          title: i.title,
          priority: i.priority,
          status: i.status,
          assignee: i.assignee?.name ?? null,
          agencies: i.agencies.map((a) => a.agency.code),
          hasDraft: !!i.aiDraftReply,
        }))}
      />
    </div>
  );
}
