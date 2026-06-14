"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { runTriage } from "@/app/actions";

type Triage = {
  issueType: string;
  product: string;
  priority: string;
  duplicateOfIssueId: number | null;
  similarTickets: { id: number; title: string; relevance: string }[];
  draftReply: string;
  confidence: "high" | "medium" | "low";
  summary: string;
};

const CONF_COLOR = { high: "text-emerald-400", medium: "text-amber-400", low: "text-red-400" };

export function TriagePanel({
  issueId,
  triageJson,
  triagedAt,
}: {
  issueId: number;
  triageJson: string | null;
  triagedAt: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  let triage: Triage | null = null;
  try {
    triage = triageJson ? (JSON.parse(triageJson) as Triage) : null;
  } catch {
    triage = null;
  }

  const trigger = () =>
    start(async () => {
      setError(null);
      const res = await runTriage(issueId);
      if (!res.ok) setError(res.detail ?? "Triage failed.");
    });

  return (
    <div className="card mt-4 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium text-indigo-300">✦ AI Triage</div>
        <button onClick={trigger} disabled={pending} className="btn-ghost text-xs">
          {pending ? "Analysing…" : triage ? "Re-run" : "Run triage"}
        </button>
      </div>

      {error && <div className="mb-2 text-xs text-red-400">{error}</div>}

      {!triage && !pending && (
        <div className="text-xs text-muted">
          Not triaged yet. The agent searches the knowledge base and past tickets, classifies the
          ticket, and drafts a reply for your approval.
        </div>
      )}

      {triage && (
        <div className="flex flex-col gap-2 text-xs">
          <div className="text-zinc-300">{triage.summary}</div>
          <div className="text-muted">
            Classified: <span className="text-zinc-300">{triage.issueType}</span> ·{" "}
            <span className="text-zinc-300">{triage.priority}</span> ·{" "}
            <span className="text-zinc-300">{triage.product}</span> · confidence{" "}
            <span className={CONF_COLOR[triage.confidence]}>{triage.confidence}</span>
          </div>
          {triage.duplicateOfIssueId && (
            <div className="text-amber-400">
              Possible duplicate of{" "}
              <Link href={`/issues/${triage.duplicateOfIssueId}`} className="underline">
                #{triage.duplicateOfIssueId}
              </Link>
            </div>
          )}
          {triage.similarTickets.length > 0 && (
            <div>
              <div className="mb-1 text-muted">Similar past tickets:</div>
              <ul className="flex flex-col gap-1">
                {triage.similarTickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/issues/${t.id}`} className="text-indigo-300 underline">
                      #{t.id} {t.title}
                    </Link>{" "}
                    <span className="text-muted">— {t.relevance}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {triagedAt && (
            <div className="text-[10px] text-muted">
              Triaged {new Date(triagedAt).toLocaleString("en-SG")} — draft loaded in the reply box
              below; review before sending.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
