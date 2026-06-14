"use client";

import { useState, useTransition } from "react";
import { approveReplyAndResolve, refineDraft } from "@/app/actions";

export function ReplyBox({ issueId, initialDraft }: { issueId: number; initialDraft: string }) {
  const [body, setBody] = useState(initialDraft);
  const [sender, setSender] = useState("Kelly Khoo");
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [refining, startRefine] = useTransition();

  const refine = () =>
    startRefine(async () => {
      if (!instruction.trim()) return;
      setStatus(null);
      const res = await refineDraft(issueId, body, instruction);
      if (res.ok) {
        setBody(res.draft);
        setInstruction("");
      } else {
        setStatus(res.detail);
      }
    });

  const approve = () =>
    startSend(async () => {
      setStatus(null);
      const res = await approveReplyAndResolve(issueId, body, sender);
      setStatus(res.ok ? `✓ ${res.detail}` : `Failed: ${res.detail}`);
    });

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium text-white">Reply to requester</div>
        {initialDraft && body === initialDraft && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
            AI draft — edit, refine, or send
          </span>
        )}
      </div>

      {/* Editable draft */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder="The reply to the requester. Edit freely, or ask the AI to refine it below."
        className="input mb-2"
      />

      {/* Conversational refine */}
      <div className="mb-3 flex items-center gap-2">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && refine()}
          placeholder="Ask the AI to adjust… e.g. 'shorter', 'mention the workaround', 'more formal'"
          className="input flex-1"
        />
        <button onClick={refine} disabled={refining || !instruction.trim()} className="btn-ghost">
          {refining ? "Refining…" : "Refine"}
        </button>
      </div>

      {/* Approve = send + save to memory + resolve, in one step */}
      <div className="flex items-center gap-2">
        <select value={sender} onChange={(e) => setSender(e.target.value)} className="input w-40">
          <option>Kelly Khoo</option>
          <option>Roy Tan</option>
          <option>Jeremy Ong</option>
        </select>
        <button onClick={approve} disabled={sending || !body.trim()} className="btn">
          {sending ? "Sending…" : "Approve, send & save to memory"}
        </button>
        {status && <span className="text-xs text-muted">{status}</span>}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Sending emails the requester, records the answer, saves the problem + answer to the
        knowledge base (so the AI learns it), and marks the ticket resolved — all at once.
      </p>
    </div>
  );
}
