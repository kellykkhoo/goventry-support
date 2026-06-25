// apps/frontend/src/pages/FeatureBacklogPage.tsx
import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import Badge from "../components/Badge";
import type { FeatureRequest } from "../lib/types";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "New", label: "New" },
  { value: "UnderReview", label: "Under Review" },
  { value: "Planned", label: "Planned" },
  { value: "InProgress", label: "In Progress" },
  { value: "Released", label: "Released" },
  { value: "Rejected", label: "Rejected" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All priorities" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const PRODUCT_OPTIONS = [
  { value: "", label: "All products" },
  { value: "GovEntry", label: "GovEntry" },
  { value: "GovSupply", label: "GovSupply" },
  { value: "GovRewards", label: "GovRewards" },
];

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

const DEFAULT_FORM = {
  title: "",
  description: "",
  product: "",
  priority: "Medium" as FeatureRequest["priority"],
  status: "New" as FeatureRequest["status"],
};

export default function FeatureBacklogPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const params = new URLSearchParams();
  if (filterStatus) params.set("status", filterStatus);
  if (filterPriority) params.set("priority", filterPriority);
  if (filterProduct) params.set("product", filterProduct);
  if (search) params.set("search", search);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["feature-requests", params.toString()],
    queryFn: () => api.listFeatureRequests(params),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => api.createFeatureRequest(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-requests"] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    createMutation.mutate({
      title: form.title.trim(),
      description: form.description,
      product: form.product || null,
      priority: form.priority,
      status: form.status,
    });
  }

  function closeForm() {
    setShowForm(false);
    setForm(DEFAULT_FORM);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Feature Backlog</h1>
          {data && (
            <p className="text-sm text-gray-500 mt-0.5">{data.total} features</p>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
        >
          + New Request
        </button>
      </div>

      {/* Inline new-request form */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Feature Request</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Brief feature title"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="What problem does this solve?"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
                <select
                  value={form.product}
                  onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Not specified</option>
                  <option value="GovEntry">GovEntry</option>
                  <option value="GovSupply">GovSupply</option>
                  <option value="GovRewards">GovRewards</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value as FeatureRequest["priority"] }))
                  }
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as FeatureRequest["status"] }))
                  }
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="New">New</option>
                  <option value="UnderReview">Under Review</option>
                  <option value="Planned">Planned</option>
                  <option value="InProgress">In Progress</option>
                  <option value="Released">Released</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={!form.title.trim() || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? "Creating…" : "Create Feature Request"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
            {createMutation.isError && (
              <p className="text-xs text-red-600">
                {(createMutation.error as Error)?.message ?? "Failed to create feature request."}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="search"
          placeholder="Search features…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs border border-gray-200 rounded px-3 py-1.5 bg-white text-gray-700 w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {PRODUCT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading && (
        <div className="text-sm text-gray-400 py-12 text-center">Loading features…</div>
      )}

      {isError && (
        <div className="text-sm text-red-600 py-12 text-center">
          {(error as Error)?.message ?? "Failed to load features."}
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {data.items.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">
              No feature requests match the current filters.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Feature
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Agencies
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Tickets
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Score
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Priority
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Target
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.items.map((fr) => (
                    <tr
                      key={fr.id}
                      onClick={() => navigate(`/roadmap/features/${fr.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-gray-900 truncate">{fr.title}</div>
                        {fr.product && (
                          <div className="text-xs text-gray-400 mt-0.5">{fr.product}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-gray-100 text-gray-700 rounded-full">
                          {fr.agency_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fr.ticket_count}</td>
                      <td className="px-4 py-3 font-medium text-gray-700">{fr.score}</td>
                      <td className="px-4 py-3">
                        <Badge label={fr.priority} tone={priorityTone(fr.priority)} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={statusLabel(fr.status)} tone={statusTone(fr.status)} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {fr.target_release ?? "—"}
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
