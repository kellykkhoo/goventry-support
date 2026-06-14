// apps/web/src/pages/TicketDetailPage.tsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Badge from "../components/Badge";
import type { TicketMessage, ProposedAction } from "../lib/types";

const WRITE_ROLES = new Set(["PM", "Product Ops", "Admin"]);
const STATUS_OPTIONS = ["Backlog", "InProgress", "Done", "Cancelled"];

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function directionLabel(d: TicketMessage["direction"]) {
  if (d === "outbound") return "Sent";
  if (d === "inbound") return "Received";
  return "Note";
}

function messageBg(d: TicketMessage["direction"]) {
  if (d === "outbound") return "bg-blue-50 border-blue-100";
  if (d === "note") return "bg-gray-50 border-gray-100";
  return "bg-white border-gray-100";
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const issueId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.has(user?.role ?? "");
  const isAdmin = user?.role === "Admin";

  const [noteBody, setNoteBody] = useState("");
  const [draftBody, setDraftBody] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [approvalEditBodies, setApprovalEditBodies] = useState<Record<number, string>>({});
  const [approvalRejectReasons, setApprovalRejectReasons] = useState<Record<number, string>>({});
  const [rejectingApprovalId, setRejectingApprovalId] = useState<number | null>(null);

  const {
    data: issue,
    isLoading: issueLoading,
    isError: issueError,
    error: issueErr,
  } = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => api.getIssue(issueId),
    enabled: !!issueId,
  });

  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ["messages", issueId],
    queryFn: () => api.listMessages(issueId),
    enabled: !!issueId,
  });

  const { data: team } = useQuery({
    queryKey: ["team"],
    queryFn: () => api.listTeam(),
  });

  const { data: proposals } = useQuery({
    queryKey: ["approvals", "issue", issueId],
    queryFn: () =>
      api.listApprovals(new URLSearchParams({ issue_id: String(issueId), status: "pending" })),
    enabled: !!issueId,
  });

  const addNoteMutation = useMutation({
    mutationFn: (body: string) => api.addNote(issueId, body),
    onSuccess: () => {
      setNoteBody("");
      queryClient.invalidateQueries({ queryKey: ["messages", issueId] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.updateStatus(issueId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
    },
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: (assignee_id: number | null) => api.updateAssignee(issueId, assignee_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
    },
  });

  const triageMutation = useMutation({
    mutationFn: () => api.triage(issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
      queryClient.invalidateQueries({ queryKey: ["approvals", "issue", issueId] });
    },
  });

  const approveReplyMutation = useMutation({
    mutationFn: (body: string) => api.approveReply(issueId, body),
    onSuccess: () => {
      setSuccessMsg("Reply sent and ticket resolved.");
      setTimeout(() => navigate("/tickets"), 1500);
    },
  });

  const approveProposalMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body?: string }) =>
      api.approveProposal(id, body !== undefined ? { body } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals", "issue", issueId] });
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
      queryClient.invalidateQueries({ queryKey: ["messages", issueId] });
    },
  });

  const rejectProposalMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.rejectProposal(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals", "issue", issueId] });
      setRejectingApprovalId(null);
    },
  });

  if (issueLoading) {
    return <div className="p-8 text-sm text-gray-400 text-center">Loading ticket…</div>;
  }

  if (issueError || !issue) {
    return (
      <div className="p-8 text-sm text-red-600 text-center">
        {(issueErr as Error)?.message ?? "Ticket not found."}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded">
          {successMsg}
        </div>
      )}

      <div className="mb-4">
        <button
          onClick={() => navigate("/tickets")}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3"
        >
          ← Back to Tickets
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{issue.title}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge label={issue.source} tone="gray" />
          <Badge label={issue.status} tone="blue" />
          <span className="text-xs text-gray-400">
            Created {relativeDate(issue.created_at)} · Agency {issue.agency_id}
          </span>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main column */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Requester */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Requester
            </h2>
            <p className="text-sm text-gray-800 font-medium">{issue.requester_name ?? "—"}</p>
            {issue.requester_email && (
              <p className="text-sm text-gray-500">{issue.requester_email}</p>
            )}
          </div>

          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Description
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{issue.description}</p>
          </div>

          {/* Message thread */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Messages
            </h2>
            {msgsLoading && <p className="text-sm text-gray-400">Loading messages…</p>}
            {!msgsLoading && messages && messages.length === 0 && (
              <p className="text-sm text-gray-400">No messages yet.</p>
            )}
            <div className="space-y-2">
              {(messages ?? []).map((msg) => (
                <div key={msg.id} className={`border rounded p-3 ${messageBg(msg.direction)}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-600">
                      {msg.sender_name ?? "System"} · {directionLabel(msg.direction)}
                    </span>
                    <span className="text-xs text-gray-400">{relativeDate(msg.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-medium text-gray-500 mb-2">Add internal note</h3>
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={3}
                placeholder="Write an internal note…"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => { if (noteBody.trim()) addNoteMutation.mutate(noteBody.trim()); }}
                disabled={!noteBody.trim() || addNoteMutation.isPending}
                className="mt-2 px-4 py-1.5 bg-gray-800 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {addNoteMutation.isPending ? "Saving…" : "Add note"}
              </button>
              {addNoteMutation.isError && (
                <p className="text-xs text-red-600 mt-1">
                  {(addNoteMutation.error as Error)?.message}
                </p>
              )}
            </div>
          </div>

          {/* Pending approvals card */}
          {proposals && proposals.items.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-lg p-4 space-y-3">
              <h2 className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                Pending Approvals
              </h2>
              {proposals.items.map((p: ProposedAction) => {
                const bodyVal =
                  approvalEditBodies[p.id] ?? (p.proposed_payload.body as string) ?? "";
                const adminBlocked = p.required_tier === "admin" && !isAdmin;
                return (
                  <div key={p.id} className="border border-gray-100 rounded p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Badge label={p.action_type.replace("_", " ")} tone="gray" />
                      <Badge
                        label={p.required_tier}
                        tone={p.required_tier === "admin" ? "amber" : "blue"}
                      />
                      <span className="text-xs text-gray-500">{p.proposer}</span>
                    </div>
                    {p.action_type === "reply" ? (
                      isAdmin ? (
                        <textarea
                          value={bodyVal}
                          onChange={(e) =>
                            setApprovalEditBodies((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          rows={4}
                          className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2">
                          {p.proposed_payload.body as string}
                        </p>
                      )
                    ) : (
                      <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                        {Object.entries(p.proposed_payload).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-gray-400">{k}: </span>
                            <span>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {isAdmin ? (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() =>
                            approveProposalMutation.mutate({
                              id: p.id,
                              body: p.action_type === "reply" ? bodyVal : undefined,
                            })
                          }
                          disabled={adminBlocked || approveProposalMutation.isPending}
                          className="px-3 py-1 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            setRejectingApprovalId(rejectingApprovalId === p.id ? null : p.id)
                          }
                          className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">
                        Pending Admin approval ·{" "}
                        <Link to="/approvals" className="underline">
                          Review in queue
                        </Link>
                      </p>
                    )}
                    {rejectingApprovalId === p.id && (
                      <div className="flex gap-2 flex-col">
                        <input
                          type="text"
                          placeholder="Reason (required)"
                          value={approvalRejectReasons[p.id] ?? ""}
                          onChange={(e) =>
                            setApprovalRejectReasons((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400"
                        />
                        <button
                          onClick={() => {
                            const reason = approvalRejectReasons[p.id] ?? "";
                            if (reason.trim())
                              rejectProposalMutation.mutate({ id: p.id, reason });
                          }}
                          disabled={
                            !(approvalRejectReasons[p.id] ?? "").trim() ||
                            rejectProposalMutation.isPending
                          }
                          className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          Confirm reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Reply composer */}
          {canWrite && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Reply to requester
              </h2>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={6}
                placeholder="Write a reply… sending resolves the ticket."
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <button
                onClick={() => {
                  const body = draftBody.trim();
                  if (body) approveReplyMutation.mutate(body);
                }}
                disabled={!draftBody.trim() || approveReplyMutation.isPending}
                className="mt-2 px-4 py-1.5 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {approveReplyMutation.isPending ? "Sending…" : "Approve, send & resolve"}
              </button>
              {approveReplyMutation.isError && (
                <p className="text-xs text-red-600 mt-1">
                  {(approveReplyMutation.error as Error)?.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-56 flex-shrink-0 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
              {canWrite ? (
                <select
                  value={issue.status}
                  onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                  disabled={updateStatusMutation.isPending}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-700">{issue.status}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Assignee</label>
              {canWrite ? (
                <select
                  value={issue.assignee_id ?? ""}
                  onChange={(e) =>
                    updateAssigneeMutation.mutate(e.target.value ? Number(e.target.value) : null)
                  }
                  disabled={updateAssigneeMutation.isPending}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {(team ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-700">
                  {team?.find((m) => m.id === issue.assignee_id)?.name ?? "Unassigned"}
                </p>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              AI Triage
            </h2>
            <button
              onClick={() => triageMutation.mutate()}
              disabled={triageMutation.isPending}
              className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {triageMutation.isPending ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                  Running…
                </>
              ) : (
                "Run triage"
              )}
            </button>
            {triageMutation.isError && (
              <p className="text-xs text-red-600 mt-2">
                {(triageMutation.error as Error)?.message}
              </p>
            )}
            {issue.ai_triage_json && (
              <div className="mt-3 space-y-2 text-xs">
                {issue.priority && (
                  <div>
                    <span className="text-gray-400">Priority: </span>
                    <span className="font-medium text-gray-700">{issue.priority}</span>
                  </div>
                )}
                {issue.product && (
                  <div>
                    <span className="text-gray-400">Product: </span>
                    <span className="font-medium text-gray-700">{issue.product}</span>
                  </div>
                )}
                {typeof (issue.ai_triage_json as Record<string, unknown>).confidence === "number" && (
                  <div>
                    <span className="text-gray-400">Confidence: </span>
                    <span className="font-medium text-gray-700">
                      {Math.round(
                        ((issue.ai_triage_json as Record<string, unknown>).confidence as number) * 100
                      )}%
                    </span>
                  </div>
                )}
                {typeof (issue.ai_triage_json as Record<string, unknown>).summary === "string" && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-gray-500 leading-snug">
                      {String((issue.ai_triage_json as Record<string, unknown>).summary)}
                    </p>
                  </div>
                )}
                {Array.isArray((issue.ai_triage_json as Record<string, unknown>).similarTickets) &&
                  ((issue.ai_triage_json as Record<string, unknown>).similarTickets as Array<{
                    id: number; title: string; similarity: string;
                  }>).length > 0 && (
                    <div className="pt-1 border-t border-gray-100">
                      <p className="text-gray-400 mb-1">Similar tickets:</p>
                      <ul className="space-y-1">
                        {((issue.ai_triage_json as Record<string, unknown>).similarTickets as Array<{
                          id: number; title: string; similarity: string;
                        }>).map((t) => (
                          <li key={t.id} className="text-gray-600 truncate">#{t.id} {t.title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
