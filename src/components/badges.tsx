const STATUS_STYLES: Record<string, string> = {
  Backlog: "bg-zinc-700/40 text-zinc-300",
  "In Progress": "bg-amber-500/15 text-amber-400",
  Done: "bg-emerald-500/15 text-emerald-400",
  Cancelled: "bg-zinc-700/40 text-zinc-500 line-through",
};

const PRIORITY_STYLES: Record<string, string> = {
  Low: "text-zinc-400 border-zinc-600",
  Medium: "text-sky-400 border-sky-700",
  High: "text-amber-400 border-amber-700",
  Urgent: "text-red-400 border-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.Backlog}`}>
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.Medium}`}>
      {priority}
    </span>
  );
}

export function AgencyChips({ codes }: { codes: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <span key={c} className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-indigo-300">
          {c}
        </span>
      ))}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, string> = {
    web: "Web",
    intake: "Intake form",
    formsg: "FormSG",
    goventry: "GovEntry",
  };
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">
      {labels[source] ?? source}
    </span>
  );
}
