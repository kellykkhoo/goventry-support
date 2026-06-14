"use client";

import { useTransition } from "react";
import { updateIssueAssignee, updateIssueStatus } from "@/app/actions";

export function IssueControls({
  issueId,
  status,
  assigneeId,
  team,
}: {
  issueId: number;
  status: string;
  assigneeId: number | null;
  team: { id: number; name: string }[];
}) {
  const [pending, start] = useTransition();

  return (
    <div className="card flex flex-col gap-3 p-4">
      <label className="text-xs text-muted">
        Status
        <select
          className="input mt-1"
          defaultValue={status}
          disabled={pending}
          onChange={(e) => start(() => updateIssueStatus(issueId, e.target.value))}
        >
          <option>Backlog</option>
          <option>In Progress</option>
          <option>Done</option>
          <option>Cancelled</option>
        </select>
      </label>
      <label className="text-xs text-muted">
        Assignee
        <select
          className="input mt-1"
          defaultValue={assigneeId ?? ""}
          disabled={pending}
          onChange={(e) =>
            start(() => updateIssueAssignee(issueId, e.target.value ? Number(e.target.value) : null))
          }
        >
          <option value="">Unassigned</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
