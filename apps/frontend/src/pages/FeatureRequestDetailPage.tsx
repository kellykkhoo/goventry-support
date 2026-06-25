// apps/frontend/src/pages/FeatureRequestDetailPage.tsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import Badge from "../components/Badge";
import type { FeatureRequest } from "../lib/types";

const STATUS_OPTIONS: FeatureRequest["status"][] = [
  "New", "UnderReview", "Planned", "InProgress", "Released", "Rejected",
];

const PRIORITY_OPTIONS: FeatureRequest["priority"][] = ["High", "Medium", "Low"];

function statusTone(status: FeatureRequest["status"]): string {
  switch (status) {
    case "New": return "gray";
    case "UnderReview": return "amber";
    case "Planned": return "blue";
    case "InProgress": return "blue";
    case "Released": return "green";
    case "Rejected": return "red";
  }
}

function statusLabel(status: FeatureRequest["status"]): string {
  switch (status) {
    case "UnderReview": return "Under Review";
    case "InProgress": return "In Progress";
    default: return status;
  }
}

function priorityTone(priority: FeatureRequest["priority"]): string {
  switch (priority) {
    case "High": return "red";
    case "Medium": return "amber";
    case "Low": return "gray";
  }
}

export default function FeatureRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const featureId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Inline title edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Inline description edit state
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  // PM notes: null = not editing (show saved value), string = pending edit
  const [pmNotesDraft, setPmNotesDraft] = useState<string | null>(null);

  // Target release: null = not editing (show saved value), string = pending edit
  const [targetDraft, setTargetDraft] = useState<string | null>(null);

  const {
    data: feature,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["feature-request", featureId],
    queryFn: () => api.getFeatureRequest(featureId),
    enabled: !!featureId,
  });

  const patchMutation = useMutation({
    mutationFn: (body: object) => api.patchFeatureRequest(featureId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-request", featureId] });
    },
  });

  const pmNotesMutation = useMutation({
    mutationFn: (notes: string) => api.patchFeatureRequest(featureId, { pm_notes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-request", featureId] });
      setPmNotesDraft(null);
    },
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-400 text-center">Loading feature…</div>;
  }

  if (isError || !feature) {
    return (
      <div className="p-8 text-sm text-red-600 text-center">
        {(error as Error)?.message ?? "Feature request not found."}
      </div>
    );
  }

  const currentPmNotes = pmNotesDraft !== null ? pmNotesDraft : (feature.pm_notes ?? "");
  const currentTarget = targetDraft !== null ? targetDraft : (feature.target_release ?? "");

  function startEditTitle() {
    setTitleDraft(feature.title);
    setEditingTitle(true);
  }

  function saveTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== feature.title) {
      patchMutation.mutate({ title: trimmed });
    }
    setEditingTitle(false);
  }

  function startEditDesc() {
    setDescDraft(feature.description);
    setEditingDesc(true);
  }

  function saveDesc() {
    if (descDraft !== feature.description) {
      patchMutation.mutate({ description: descDraft });
    }
    setEditingDesc(false);
  }

  function handleTargetBlur() {
    if (targetDraft !== null) {
      const trimmed = targetDraft.trim();
      if (trimmed !== (feature.target_release ?? "")) {
        patchMutation.mutate({ target_release: trimmed || null });
      }
    }
    setTargetDraft(null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back link */}
      <div className="mb-4">
        <button
          onClick={() => navigate("/roadmap/features")}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3 block"
        >
          ← Back to Feature Backlog
        </button>

        {/* Title — click to edit inline */}
        {editingTitle ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="flex-1 text-xl font-semibold text-gray-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <button
              onClick={saveTitle}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditingTitle(false)}
              className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <h1
            className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={startEditTitle}
            title="Click to edit title"
          >
            {feature.title}
          </h1>
        )}

        <div className="flex flex-wrap gap-2 mt-2">
          <Badge label={statusLabel(feature.status)} tone={statusTone(feature.status)} />
          <Badge label={feature.priority} tone={priorityTone(feature.priority)} />
          {feature.product && <Badge label={feature.product} tone="gray" />}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left column */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Description
              </h2>
              {!editingDesc && (
                <button
                  onClick={startEditDesc}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={5}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveDesc}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingDesc(false)}
                    className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : feature.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{feature.description}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No description</p>
            )}
          </div>

          {/* Supporting Agencies */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Supporting Agencies
            </h2>
            {feature.agencies.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No agencies linked</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {feature.agencies.map((agency) => (
                  <span
                    key={agency.id}
                    title={agency.name}
                    className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded"
                  >
                    {agency.code}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Linked Support Tickets */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Linked Support Tickets
            </h2>
            {feature.linked_tickets.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No tickets linked</p>
            ) : (
              <ul className="space-y-1.5">
                {feature.linked_tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      to={`/tickets/${ticket.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      #{ticket.id} — {ticket.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* PM Notes */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              PM Notes
            </h2>
            <textarea
              value={currentPmNotes}
              onChange={(e) => setPmNotesDraft(e.target.value)}
              rows={4}
              placeholder="Add PM notes, context, or decision rationale…"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {pmNotesDraft !== null && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => pmNotesMutation.mutate(pmNotesDraft)}
                  disabled={pmNotesMutation.isPending}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {pmNotesMutation.isPending ? "Saving…" : "Save Notes"}
                </button>
                <button
                  onClick={() => setPmNotesDraft(null)}
                  className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
            {pmNotesMutation.isError && (
              <p className="text-xs text-red-600 mt-1">
                {(pmNotesMutation.error as Error)?.message}
              </p>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-60 flex-shrink-0 space-y-4">
          {/* Controls */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            {/* Status */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
              <select
                value={feature.status}
                onChange={(e) => patchMutation.mutate({ status: e.target.value })}
                disabled={patchMutation.isPending}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Priority</label>
              <select
                value={feature.priority}
                onChange={(e) => patchMutation.mutate({ priority: e.target.value })}
                disabled={patchMutation.isPending}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Target Release */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Target Release</label>
              <input
                type="text"
                value={currentTarget}
                onChange={(e) => setTargetDraft(e.target.value)}
                onFocus={() => { if (targetDraft === null) setTargetDraft(feature.target_release ?? ""); }}
                onBlur={handleTargetBlur}
                placeholder="e.g. Q3 2025"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {patchMutation.isError && (
              <p className="text-xs text-red-600">
                {(patchMutation.error as Error)?.message}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900">{feature.score}</p>
              <p className="text-xs text-gray-400 mt-0.5">Score</p>
            </div>
            <div className="flex gap-4 pt-3 border-t border-gray-100">
              <div className="flex-1 text-center">
                <p className="text-xl font-semibold text-gray-800">{feature.agency_count}</p>
                <p className="text-xs text-gray-400 mt-0.5">Agencies</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-xl font-semibold text-gray-800">{feature.ticket_count}</p>
                <p className="text-xs text-gray-400 mt-0.5">Tickets</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
