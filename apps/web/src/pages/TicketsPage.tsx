// apps/web/src/pages/TicketsPage.tsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import Badge from "../components/Badge";

const STATUS_TABS = ["All", "Backlog", "InProgress", "Done", "Cancelled"];
const PRODUCTS = ["All", "GovEntry", "GovSupply", "GovRewards"];

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

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const statusParam = searchParams.get("status") ?? "";
  const productParam = searchParams.get("product") ?? "";
  const searchParam = searchParams.get("search") ?? "";

  // Local debounced search state
  const [searchInput, setSearchInput] = useState(searchParam);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchInput) {
        next.set("search", searchInput);
      } else {
        next.delete("search");
      }
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const params = new URLSearchParams();
  if (statusParam) params.set("status", statusParam);
  if (productParam) params.set("product", productParam);
  if (searchParam) params.set("search", searchParam);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["issues", params.toString()],
    queryFn: () => api.listIssues(params),
  });

  function setStatus(s: string) {
    const next = new URLSearchParams(searchParams);
    if (s && s !== "All") {
      next.set("status", s);
    } else {
      next.delete("status");
    }
    setSearchParams(next, { replace: true });
  }

  function setProduct(p: string) {
    const next = new URLSearchParams(searchParams);
    if (p && p !== "All") {
      next.set("product", p);
    } else {
      next.delete("product");
    }
    setSearchParams(next, { replace: true });
  }

  const activeTab = statusParam || "All";

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Tickets</h1>
        {data && (
          <p className="text-sm text-gray-500 mt-0.5">{data.total} total</p>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-md">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === s
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Product select */}
        <select
          value={productParam || "All"}
          onChange={(e) => setProduct(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {p === "All" ? "All products" : p}
            </option>
          ))}
        </select>

        {/* Search input */}
        <input
          type="search"
          placeholder="Search tickets…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="text-xs border border-gray-200 rounded px-3 py-1.5 bg-white text-gray-700 w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      {isLoading && (
        <div className="text-sm text-gray-400 py-12 text-center">
          Loading tickets…
        </div>
      )}

      {isError && (
        <div className="text-sm text-red-600 py-12 text-center">
          {(error as Error)?.message ?? "Failed to load tickets."}
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {data.items.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">
              No tickets match the current filters.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Title
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Requester
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Agency
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Priority
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Created
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      AI
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.items.map((issue) => (
                    <tr
                      key={issue.id}
                      onClick={() => navigate(`/tickets/${issue.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                        {issue.title}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {issue.requester_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={`Agency ${issue.agency_id}`} tone="gray" />
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          label={issue.priority}
                          tone={priorityTone(issue.priority)}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{issue.status}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {relativeDate(issue.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {issue.ai_draft_reply && (
                          <Badge label="AI draft ready" tone="green" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
