// apps/frontend/src/pages/TicketDetailPage.tsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Badge from "../components/Badge";
import type { TicketMessage, ProposedAction } from "../lib/types";

const WRITE_ROLES = new Set(["PM", "Product Ops", "Admin"]);
const STATUS_OPTIONS = ["Backlog", "InProgress", "Done", "Cancelled"];

const FEEDBACK_CATEGORIES: { key: string; label: string }[] = [
  { key: "approved_as_is", label: "Approved as-is" },
  { key: "edited_for_tone", label: "Edited: tone" },
  { key: "edited_for_accuracy", label: "Edited: accuracy" },
  { key: "edited_for_clarity", label: "Edited: clarity" },
  { key: "edited_for_length", label: "Edited: length" },
  { key: "missing_context", label: "Missing context" },
  { key: "wrong_policy", label: "Wrong policy" },
  { key: "wrong_agency_context", label: "Wrong agency context" },
  { key: "wrong_product_context", label: "Wrong product context" },
  { key: "too_vague", label: "Too vague" },
  { key: "too_confident", label: "Too confident" },
  { key: "too_technical", label: "Too technical" },
  { key: "rejected", label: "Rejected" },
];

const BASE = import.meta.env.VITE_API_URL ?? "";

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
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<number>>(new Set());
  const [feedbackCategory, setFeedbackCategory] = useState<Record<number, string>>({});
  const [feedbackNotes, setFeedbackNotes] = useState<Record<number, string>>({});
  const [feedbackSending, setFeedbackSending] = useState<Record<number, boolean>>({});
  const [showNoteCompose, setShowNoteCompose] = useState(false);
  const [showManualReply, setShowManualReply] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);

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

  async function handleRegenerate(proposal: ProposedAction) {
    if (!regenFeedback.trim()) return;
    setRegenLoading(true);
    try {
      const existing = approvalEditBodies[proposal.id] ?? (proposal.proposed_payload.body as string) ?? "";
      const result = await api.regenerateDraft(issueId, proposal.id, regenFeedback.trim(), existing);
      if (result.ok) {
        setApprovalEditBodies((prev) => ({ ...prev, [proposal.id]: result.draft }));
        setRegenFeedback("");
        setShowRegenerate(false);
        queryClient.invalidateQueries({ queryKey: ["approvals", "issue", issueId] });
      }
    } finally {
      setRegenLoading(false);
    }
  }

  async function submitFeedback(proposalId: number, originalDraft: string) {
    const category = feedbackCategory[proposalId];
    if (!category) return;
    setFeedbackSending((prev) => ({ ...prev, [proposalId]: true }));
    try {
      const token = localStorage.getItem("goventry_token") ?? "";
      await fetch(`${BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          issue_id: issueId,
          proposed_action_id: proposalId,
          original_draft: originalDraft,
          feedback_category: category,
          reviewer_notes: feedbackNotes[proposalId] ?? "",
        }),
      });
      setFeedbackSubmitted((prev) => new Set(prev).add(proposalId));
    } finally {
      setFeedbackSending((prev) => ({ ...prev, [proposalId]: false }));
    }
  }

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
            Created {relativeDate(issue.created_at)} · {issue.agency_name ?? issue.agency_code ?? `Agency ${issue.agency_id}`}
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

          {/* Messages + reply draft — single unified area */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Messages</h2>

            {/* Message thread */}
            {msgsLoading && <p className="text-sm text-gray-400">Loading messages…</p>}
            {!msgsLoading && messages && messages.length === 0 && !proposals?.items.length && (
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

            {/* Pending reply draft — integrated */}
            {proposals?.items
              .filter((p: ProposedAction) => p.action_type === "reply")
              .map((p: ProposedAction) => {
                const bodyVal = approvalEditBodies[p.id] ?? (p.proposed_payload.body as string) ?? "";
                return (
                  <div key={p.id} className="border border-amber-200 rounded-lg p-4 bg-amber-50 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">AI Draft · Pending approval</span>
                      <span className="text-xs text-gray-400 ml-auto">{p.proposer}</span>
                    </div>

                    <textarea
                      value={bodyVal}
                      onChange={(e) =>
                        setApprovalEditBodies((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      rows={6}
                      readOnly={!isAdmin}
                      className="w-full text-sm border border-amber-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                    />

                    {/* Regenerate section */}
                    {isAdmin && (
                      <div>
                        {showRegenerate ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={regenFeedback}
                              onChange={(e) => setRegenFeedback(e.target.value)}
                              placeholder="What to improve? e.g. 'make it shorter', 'add pricing info'"
                              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRegenerate(p)}
                                disabled={!regenFeedback.trim() || regenLoading}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
                              >
                                {regenLoading ? "Regenerating…" : "Regenerate"}
                              </button>
                              <button
                                onClick={() => { setShowRegenerate(false); setRegenFeedback(""); }}
                                className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowRegenerate(true)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Improve this draft →
                          </button>
                        )}
                      </div>
                    )}

                    {/* Approve / Reject */}
                    {isAdmin ? (
                      <div className="flex gap-2 flex-wrap pt-1">
                        <button
                          onClick={() => approveProposalMutation.mutate({ id: p.id, body: bodyVal })}
                          disabled={approveProposalMutation.isPending}
                          className="px-4 py-1.5 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          {approveProposalMutation.isPending ? "Sending…" : "Approve & send"}
                        </button>
                        <button
                          onClick={() => setRejectingApprovalId(rejectingApprovalId === p.id ? null : p.id)}
                          className="px-4 py-1.5 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">
                        Pending Admin approval ·{" "}
                        <Link to="/approvals" className="underline">Review in queue</Link>
                      </p>
                    )}

                    {rejectingApprovalId === p.id && (
                      <div className="flex gap-2 flex-col">
                        <input
                          type="text"
                          placeholder="Reason (required)"
                          value={approvalRejectReasons[p.id] ?? ""}
                          onChange={(e) =>
                            setApprovalRejectReasons((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400"
                        />
                        <button
                          onClick={() => {
                            const reason = approvalRejectReasons[p.id] ?? "";
                            if (reason.trim()) rejectProposalMutation.mutate({ id: p.id, reason });
                          }}
                          disabled={!(approvalRejectReasons[p.id] ?? "").trim() || rejectProposalMutation.isPending}
                          className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          Confirm reject
                        </button>
                      </div>
                    )}

                    {/* Feedback tags */}
                    {!feedbackSubmitted.has(p.id) && (
                      <div className="pt-2 border-t border-amber-100">
                        <p className="text-xs text-gray-500 mb-1.5">How was this draft?</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {FEEDBACK_CATEGORIES.map((cat) => (
                            <button
                              key={cat.key}
                              onClick={() => setFeedbackCategory((prev) => ({ ...prev, [p.id]: prev[p.id] === cat.key ? "" : cat.key }))}
                              className={`px-2 py-1 text-xs rounded-full border transition-colors ${feedbackCategory[p.id] === cat.key ? "bg-blue-600 text-white border-blue-600" : "text-gray-600 border-gray-200 hover:border-blue-400"}`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => submitFeedback(p.id, (p.proposed_payload.body as string) ?? "")}
                          disabled={!feedbackCategory[p.id] || feedbackSending[p.id]}
                          className="px-3 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 disabled:opacity-40 transition-colors"
                        >
                          {feedbackSending[p.id] ? "Saving…" : "Submit feedback"}
                        </button>
                      </div>
                    )}
                    {feedbackSubmitted.has(p.id) && <p className="text-xs text-green-600">Feedback saved.</p>}
                  </div>
                );
              })}

            {/* Manual reply — only when no pending draft */}
            {canWrite && !proposals?.items.some((p: ProposedAction) => p.action_type === "reply") && (
              <div className="border-t border-gray-100 pt-4">
                {showManualReply ? (
                  <div className="space-y-2">
                    <textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={5}
                      placeholder="Write a reply… sending resolves the ticket."
                      className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { if (draftBody.trim()) approveReplyMutation.mutate(draftBody.trim()); }}
                        disabled={!draftBody.trim() || approveReplyMutation.isPending}
                        className="px-4 py-1.5 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                      >
                        {approveReplyMutation.isPending ? "Sending…" : "Send & resolve"}
                      </button>
                      <button onClick={() => { setShowManualReply(false); setDraftBody(""); }} className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700">
                        Cancel
                      </button>
                    </div>
                    {approveReplyMutation.isError && (
                      <p className="text-xs text-red-600">{(approveReplyMutation.error as Error)?.message}</p>
                    )}
                  </div>
                ) : (
                  <button onClick={() => setShowManualReply(true)} className="text-xs text-green-700 font-medium hover:underline">
                    + Write reply
                  </button>
                )}
              </div>
            )}

            {/* Internal note — collapsible */}
            <div className="border-t border-gray-100 pt-4">
              {showNoteCompose ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500">Internal note (not sent to requester)</p>
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    rows={3}
                    placeholder="Write an internal note…"
                    className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { if (noteBody.trim()) addNoteMutation.mutate(noteBody.trim()); }}
                      disabled={!noteBody.trim() || addNoteMutation.isPending}
                      className="px-4 py-1.5 bg-gray-800 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {addNoteMutation.isPending ? "Saving…" : "Add note"}
                    </button>
                    <button onClick={() => { setShowNoteCompose(false); setNoteBody(""); }} className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700">
                      Cancel
                    </button>
                  </div>
                  {addNoteMutation.isError && (
                    <p className="text-xs text-red-600 mt-1">{(addNoteMutation.error as Error)?.message}</p>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowNoteCompose(true)} className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
                  + Add internal note
                </button>
              )}
            </div>
          </div>

          {/* Non-reply pending approvals (e.g. internal notes from Hermes) */}
          {proposals && proposals.items.filter((p: ProposedAction) => p.action_type !== "reply").length > 0 && (
            <div className="bg-white border border-amber-200 rounded-lg p-4 space-y-3">
              <h2 className="text-xs font-medium text-amber-700 uppercase tracking-wide">Pending Approvals</h2>
              {proposals.items
                .filter((p: ProposedAction) => p.action_type !== "reply")
                .map((p: ProposedAction) => (
                  <div key={p.id} className="border border-gray-100 rounded p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Badge label={p.action_type.replace("_", " ")} tone="gray" />
                      <Badge label={p.required_tier} tone={p.required_tier === "admin" ? "amber" : "blue"} />
                      <span className="text-xs text-gray-500">{p.proposer}</span>
                    </div>
                    <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                      {Object.entries(p.proposed_payload).map(([k, v]) => (
                        <div key={k}><span className="text-gray-400">{k}: </span><span>{String(v)}</span></div>
                      ))}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveProposalMutation.mutate({ id: p.id })}
                          disabled={approveProposalMutation.isPending}
                          className="px-3 py-1 bg-green-700 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectingApprovalId(rejectingApprovalId === p.id ? null : p.id)}
                          className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
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
