// apps/frontend/src/pages/ReportsPage.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api, getToken } from "../lib/api";
import Badge from "../components/Badge";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

interface SlackLog {
  id: number;
  report_type: string;
  channel_hint: string | null;
  status: string;
  error_message: string | null;
  payload_preview: string | null;
  created_at: string;
}

function priorityTone(priority: string): string {
  switch (priority) {
    case "Urgent": return "red";
    case "High": return "amber";
    case "Medium": return "blue";
    default: return "gray";
  }
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [slackStatus, setSlackStatus] = useState<string | null>(null);
  const [showSlackLogs, setShowSlackLogs] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["report", "daily"],
    queryFn: () => api.getDailyReport(),
    enabled: isAdmin,
  });

  const { data: slackLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["slack", "delivery-logs"],
    queryFn: () => authFetch<SlackLog[]>("/slack/delivery-logs"),
    enabled: isAdmin && showSlackLogs,
  });

  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-gray-500 text-sm">Reports are available to Admin only.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400 py-12 text-center">Loading report…</div>;
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-red-600 py-12 text-center">
        {(error as Error)?.message ?? "Failed to load report."}
      </div>
    );
  }

  if (!data) return null;

  const byStatusEntries = Object.entries(data.by_status);
  const byPriorityEntries = Object.entries(data.by_priority);

  async function sendToSlack() {
    setSlackStatus("Sending…");
    try {
      const result = await authFetch<{ ok: boolean; error?: string }>("/slack/reports/send", {
        method: "POST",
        body: JSON.stringify({
          text: `Daily summary for ${data!.date}: ${data!.new_today} new tickets, ${data!.open_total} open.`,
          report_type: "daily",
        }),
      });
      if (result.ok) {
        setSlackStatus("Sent to Slack");
        if (showSlackLogs) refetchLogs();
      } else {
        setSlackStatus(`Failed: ${result.error ?? "unknown error"}`);
      }
    } catch (e) {
      setSlackStatus(`Error: ${(e as Error).message}`);
    }
    setTimeout(() => setSlackStatus(null), 4000);
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Daily Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data.date}</p>
        </div>
        <div className="flex items-center gap-2">
          {slackStatus && (
            <span className="text-xs text-gray-500">{slackStatus}</span>
          )}
          <button
            onClick={sendToSlack}
            className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Send to Slack
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">New today</p>
          <p className="text-3xl font-bold text-gray-900">{data.new_today}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Open total</p>
          <p className="text-3xl font-bold text-gray-900">{data.open_total}</p>
        </div>
      </div>

      {/* By status */}
      {byStatusEntries.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">By status</h2>
          <div className="flex flex-wrap gap-2">
            {byStatusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded px-3 py-1.5">
                <span className="text-xs text-gray-500">{status}</span>
                <span className="text-xs font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By priority */}
      {byPriorityEntries.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">By priority</h2>
          <div className="flex flex-wrap gap-2">
            {byPriorityEntries.map(([priority, count]) => (
              <div key={priority} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded px-3 py-1.5">
                <Badge label={priority} tone={priorityTone(priority)} />
                <span className="text-xs font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top open tickets */}
      {data.top_open.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Top open tickets</h2>
          <ul className="space-y-2">
            {data.top_open.slice(0, 5).map((ticket) => (
              <li key={ticket.id} className="flex items-center gap-3">
                <Link
                  to={`/tickets/${ticket.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex-1 truncate"
                >
                  #{ticket.id} {ticket.title}
                </Link>
                <Badge label={ticket.priority} tone={priorityTone(ticket.priority)} />
                <span className="text-xs text-gray-400 w-20 text-right shrink-0">{ticket.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weekly report placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Weekly Report</h2>
          <Link to="/hermes" className="text-xs text-blue-600 hover:underline">
            Generate in Hermes →
          </Link>
        </div>
        <p className="text-sm text-gray-400">
          Weekly reports are generated by Hermes. Go to the{" "}
          <Link to="/hermes" className="text-blue-600 hover:underline">
            Hermes Activity
          </Link>{" "}
          page and click Generate Weekly Report once Hermes is configured.
        </p>
      </div>

      {/* Slack delivery logs */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <button
          onClick={() => setShowSlackLogs((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <h2 className="text-sm font-semibold text-gray-700">Slack Delivery Logs</h2>
          <span className="text-xs text-gray-400 ml-auto">{showSlackLogs ? "▲ hide" : "▼ show"}</span>
        </button>
        {showSlackLogs && (
          <div className="mt-3">
            {!slackLogs || slackLogs.length === 0 ? (
              <p className="text-sm text-gray-400">No deliveries yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 pr-3 font-medium">Date</th>
                    <th className="text-left py-2 pr-3 font-medium">Type</th>
                    <th className="text-left py-2 pr-3 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {slackLogs.map((log) => (
                    <tr key={log.id} className="text-gray-600">
                      <td className="py-2 pr-3 text-gray-400">{relativeDate(log.created_at)}</td>
                      <td className="py-2 pr-3">{log.report_type}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          label={log.status}
                          tone={log.status === "success" ? "green" : "red"}
                        />
                      </td>
                      <td className="py-2 text-gray-400 truncate max-w-xs">{log.error_message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
