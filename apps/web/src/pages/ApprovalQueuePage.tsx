// apps/web/src/pages/ApprovalQueuePage.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Badge from "../components/Badge";
import type { ProposedAction } from "../lib/types";

const WRITE_ROLES = new Set(["PM", "Product Ops", "Admin"]);
const STATUS_TABS = ["pending", "approved", "rejected", "all"] as const;

function tierTone(tier: string) {
  if (tier === "admin") return "amber";
  if (tier === "human") return "blue";
  return "gray";
}

function proposerLabel(proposer: string) {
  if (proposer === "agent:triage") return "AI triage";
  if (proposer === "agent:hermes") return "Hermes";
  if (proposer.startsWith("user:")) return "User";
  return proposer;
}

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ApprovalQueuePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "Admin";
  const canReview = WRITE_ROLES.has(user?.role ?? "");

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editBodies, setEditBodies] = useState<Record<number, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["approvals", statusFilter],
    queryFn: () => api.listApprovals(params),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body?: string }) =>
      api.approveProposal(id, body !== undefined ? { body } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      setExpandedId(null);
      setToastMsg("Approved.");
      setTimeout(() => setToastMsg(null), 2000);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.rejectProposal(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      setExpandedId(null);
      setRejectingId(null);
      setToastMsg("Rejected.");
      setTimeout(() => setToastMsg(null), 2000);
    },
  });

  function handleApprove(p: ProposedAction) {
    if (p.action_type === "reply") {
      const body = editBodies[p.id] ?? (p.proposed_payload.body as string) ?? "";
      approveMutation.mutate({ id: p.id, body });
    } else {
      approveMutation.mutate({ id: p.id });
    }
  }

  const statusBadgeTone = (s: string) => {
    if (s === "pending") return "blue";
    if (s === "executed") return "green";
    if (s === "rejected" || s === "failed") return "red";
    return "gray";
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Approval Queue</h1>

      {toastMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded">
          {toastMsg}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              statusFilter === tab
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {isError && <p className="text-sm text-red-600">Failed to load approvals.</p>}
      {!isLoading && data && data.items.length === 0 && (
        <p className="text-sm text-gray-400">No proposals.</p>
      )}

      <div className="space-y-2">
        {(data?.items ?? []).map((p) => {
          const isExpanded = expandedId === p.id;
          const adminBlocked = p.required_tier === "admin" && !isAdmin;
          const bodyVal = editBodies[p.id] ?? (p.proposed_payload.body as string) ?? "";

          return (
            <div key={p.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Row header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
              >
                <Badge label={p.action_type.replace("_", " ")} tone="gray" />
                <Link
                  to={`/tickets/${p.issue_id}`}
                  className="text-sm text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Ticket #{p.issue_id}
                </Link>
                <span className="text-xs text-gray-500">{proposerLabel(p.proposer)}</span>
                <Badge label={p.required_tier} tone={tierTone(p.required_tier)} />
                <span className="text-xs text-gray-400 ml-auto">{relativeDate(p.created_at)}</span>
                <Badge label={p.status} tone={statusBadgeTone(p.status)} />
              </button>

              {/* Expanded detail */}
              {isExpanded && p.status === "pending" && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                  {p.action_type === "reply" ? (
                    <>
                      <p className="text-xs text-gray-400">Proposed reply:</p>
                      <textarea
                        value={bodyVal}
                        onChange={(e) =>
                          setEditBodies((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        rows={5}
                        className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </>
                  ) : (
                    <div className="bg-gray-50 rounded p-3 text-sm">
                      {Object.entries(p.proposed_payload).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-gray-400">{k}: </span>
                          <span className="text-gray-800">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {canReview && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleApprove(p)}
                        disabled={adminBlocked || approveMutation.isPending}
                        title={adminBlocked ? "Requires Admin" : undefined}
                        className="px-4 py-1.5 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                      >
                        {approveMutation.isPending ? "Approving…" : "Approve"}
                      </button>
                      <button
                        onClick={() => setRejectingId(rejectingId === p.id ? null : p.id)}
                        disabled={rejectMutation.isPending}
                        className="px-4 py-1.5 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {rejectingId === p.id && (
                    <div className="flex gap-2 items-start flex-col">
                      <input
                        type="text"
                        placeholder="Reason (required)"
                        value={rejectReasons[p.id] ?? ""}
                        onChange={(e) =>
                          setRejectReasons((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      <button
                        onClick={() => {
                          const reason = rejectReasons[p.id] ?? "";
                          if (reason.trim()) rejectMutation.mutate({ id: p.id, reason });
                        }}
                        disabled={!(rejectReasons[p.id] ?? "").trim() || rejectMutation.isPending}
                        className="px-4 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        Confirm reject
                      </button>
                    </div>
                  )}

                  {approveMutation.isError && (
                    <p className="text-xs text-red-600">
                      {(approveMutation.error as Error)?.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
