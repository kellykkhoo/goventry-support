import { db } from "@/lib/db";
import { addKnowledgeDoc } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const entries = await db.knowledgeEntry.findMany({ orderBy: { createdAt: "desc" } });
  const docs = entries.filter((e) => e.sourceType === "doc");
  const resolutions = entries.filter((e) => e.sourceType === "resolved_ticket");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold text-white">Knowledge</h1>
      <p className="mb-5 text-xs text-muted">
        Everything here is searchable by the AI triage agent. Docs are added by the team;
        resolutions are saved automatically when tickets are marked Done.
      </p>

      <form action={addKnowledgeDoc} className="card mb-6 flex flex-col gap-3 p-4">
        <div className="text-sm font-medium text-white">Add internal documentation</div>
        <input name="title" placeholder="Title (e.g. 'Bulk import troubleshooting')" required className="input" />
        <textarea
          name="content"
          rows={4}
          placeholder="Paste the doc / guide / process here…"
          required
          className="input"
        />
        <button type="submit" className="btn self-start">
          Add to knowledge base
        </button>
      </form>

      <h2 className="mb-2 text-sm font-medium text-white">Documentation ({docs.length})</h2>
      <div className="mb-6 flex flex-col gap-2">
        {docs.map((e) => (
          <details key={e.id} className="card p-3">
            <summary className="cursor-pointer text-sm text-zinc-200">{e.title}</summary>
            <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{e.content}</p>
          </details>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-medium text-white">
        Resolved-ticket memory ({resolutions.length})
      </h2>
      <div className="flex flex-col gap-2">
        {resolutions.map((e) => (
          <details key={e.id} className="card border-emerald-900/50 p-3">
            <summary className="cursor-pointer text-sm text-zinc-200">{e.title}</summary>
            <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{e.content}</p>
          </details>
        ))}
        {resolutions.length === 0 && (
          <div className="text-xs text-muted">
            None yet — resolve a ticket with a summary and it appears here.
          </div>
        )}
      </div>
    </div>
  );
}
