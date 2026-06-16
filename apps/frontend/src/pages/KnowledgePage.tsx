// apps/frontend/src/pages/KnowledgePage.tsx
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import type { KnowledgeEntry } from "../lib/types";
import Badge from "../components/Badge";

const VISIBILITY_OPTIONS = [
  { value: "", label: "All visibility" },
  { value: "global_sanitized", label: "Global (sanitized)" },
  { value: "agency_specific", label: "Agency specific" },
  { value: "internal_admin_only", label: "Internal / admin only" },
];

function visibilityTone(v: string): string {
  switch (v) {
    case "global_sanitized":
      return "green";
    case "agency_specific":
      return "blue";
    case "internal_admin_only":
      return "red";
    default:
      return "gray";
  }
}

function visibilityLabel(v: string): string {
  switch (v) {
    case "global_sanitized":
      return "Global";
    case "agency_specific":
      return "Agency";
    case "internal_admin_only":
      return "Internal";
    default:
      return v;
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

const EDITABLE_ROLES = ["Admin", "PM", "Product Ops"];

interface ArticleFormProps {
  onClose: () => void;
  onSaved: () => void;
}

function ArticleForm({ onClose, onSaved }: ArticleFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<KnowledgeEntry["visibility"]>("global_sanitized");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createKnowledge({ title: title.trim(), content: content.trim(), visibility });
      onSaved();
    } catch (err) {
      setError((err as Error).message ?? "Failed to create article.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Add knowledge article</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Article title"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={6}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Write the knowledge article content…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as KnowledgeEntry["visibility"])}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="global_sanitized">Global (sanitized)</option>
              <option value="agency_specific">Agency specific</option>
              <option value="internal_admin_only">Internal / admin only</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !content.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving…" : "Save article"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role != null && EDITABLE_ROLES.includes(user.role);
  const isAdmin = user?.role === "Admin";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (visibility) params.set("visibility", visibility);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["knowledge", params.toString()],
    queryFn: () => api.listKnowledge(params),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteKnowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  function handleDelete(id: number) {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    deleteMutation.mutate(id);
  }

  function handleSaved() {
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ["knowledge"] });
  }

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="p-6">
      {showForm && <ArticleForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Knowledge Base</h1>
          {data && (
            <p className="text-sm text-gray-500 mt-0.5">{data.total} articles</p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Add article
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="search"
          placeholder="Search articles…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="text-xs border border-gray-200 rounded px-3 py-1.5 bg-white text-gray-700 w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* States */}
      {isLoading && (
        <div className="text-sm text-gray-400 py-12 text-center">Loading articles…</div>
      )}

      {isError && (
        <div className="text-sm text-red-600 py-12 text-center">
          {(error as Error)?.message ?? "Failed to load knowledge base."}
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {data.items.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">
              No articles match the current filters.
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
                      Visibility
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Source
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Agency
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Created
                    </th>
                    {isAdmin && (
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.items.map((entry) => (
                    <>
                      <tr
                        key={entry.id}
                        onClick={() => toggleExpand(entry.id)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                          <span className="truncate block">{entry.title}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            label={visibilityLabel(entry.visibility)}
                            tone={visibilityTone(entry.visibility)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            label={entry.source_type === "resolved_ticket" ? "Resolved ticket" : "Doc"}
                            tone={entry.source_type === "resolved_ticket" ? "blue" : "gray"}
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {entry.agency_id != null ? `Agency ${entry.agency_id}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {relativeDate(entry.created_at)}
                        </td>
                        {isAdmin && (
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleDelete(entry.id)}
                              disabled={deleteMutation.isPending}
                              className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                      {expandedId === entry.id && (
                        <tr key={`${entry.id}-expanded`}>
                          <td
                            colSpan={isAdmin ? 6 : 5}
                            className="px-4 py-4 bg-gray-50 border-t border-gray-100"
                          >
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {entry.content}
                            </p>
                          </td>
                        </tr>
                      )}
                    </>
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
