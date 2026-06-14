"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { updateIssueStatus } from "@/app/actions";
import { AgencyChips, PriorityBadge } from "./badges";

type BoardIssue = {
  id: number;
  title: string;
  priority: string;
  status: string;
  assignee: string | null;
  agencies: string[];
  hasDraft: boolean;
};

const COLUMNS = ["Backlog", "In Progress", "Done", "Cancelled"];

export function KanbanBoard({ issues: initial }: { issues: BoardIssue[] }) {
  const [issues, setIssues] = useState(initial);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    const issueId = Number(e.active.id);
    const newStatus = e.over?.id as string | undefined;
    if (!newStatus || !COLUMNS.includes(newStatus)) return;
    setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i)));
    start(() => updateIssueStatus(issueId, newStatus));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <Column key={col} id={col} issues={issues.filter((i) => i.status === col)} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ id, issues }: { id: string; issues: BoardIssue[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[60vh] rounded-lg border p-2 transition-colors ${
        isOver ? "border-accent bg-accent/5" : "border-border bg-panel"
      }`}
    >
      <div className="mb-2 px-1 text-xs font-medium text-muted">
        {id} <span className="text-zinc-600">{issues.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {issues.map((i) => (
          <Card key={i.id} issue={i} />
        ))}
      </div>
    </div>
  );
}

function Card({ issue }: { issue: BoardIssue }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
          : undefined
      }
      className={`card cursor-grab p-3 ${isDragging ? "opacity-80 shadow-xl" : ""}`}
    >
      <Link
        href={`/issues/${issue.id}`}
        className="mb-1.5 block text-sm text-zinc-200 hover:text-white"
        onClick={(e) => isDragging && e.preventDefault()}
      >
        <span className="mr-1 text-xs text-muted">#{issue.id}</span>
        {issue.title}
      </Link>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <PriorityBadge priority={issue.priority} />
          {issue.hasDraft && <span className="text-[10px] text-indigo-300">✦</span>}
        </div>
        <AgencyChips codes={issue.agencies} />
      </div>
      {issue.assignee && <div className="mt-1.5 text-[11px] text-muted">{issue.assignee}</div>}
    </div>
  );
}
