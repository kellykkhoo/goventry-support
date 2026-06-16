// apps/frontend/src/pages/ReportsPage.tsx
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import Badge from "../components/Badge";

function priorityTone(priority: string): string {
  switch (priority) {
    case "Urgent":
      return "red";
    case "High":
      return "amber";
    case "Medium":
      return "blue";
    default:
      return "gray";
  }
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["report", "daily"],
    queryFn: () => api.getDailyReport(),
    enabled: isAdmin,
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
    return (
      <div className="p-6 text-sm text-gray-400 py-12 text-center">Loading report…</div>
    );
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

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Daily Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">{data.date}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            New today
          </p>
          <p className="text-3xl font-bold text-gray-900">{data.new_today}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Open total
          </p>
          <p className="text-3xl font-bold text-gray-900">{data.open_total}</p>
        </div>
      </div>

      {/* By status */}
      {byStatusEntries.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">By status</h2>
          <div className="flex flex-wrap gap-2">
            {byStatusEntries.map(([status, count]) => (
              <div
                key={status}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded px-3 py-1.5"
              >
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
              <div
                key={priority}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded px-3 py-1.5"
              >
                <Badge label={priority} tone={priorityTone(priority)} />
                <span className="text-xs font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top open tickets */}
      {data.top_open.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
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
                <span className="text-xs text-gray-400 w-20 text-right shrink-0">
                  {ticket.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
