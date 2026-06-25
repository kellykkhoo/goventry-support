// apps/frontend/src/pages/RoadmapPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import Badge from "../components/Badge";
import type { FeatureRequest } from "../lib/types";

type KanbanStatus = "New" | "UnderReview" | "Planned" | "InProgress" | "Released";

const COLUMNS: { status: KanbanStatus; label: string }[] = [
  { status: "New", label: "New" },
  { status: "UnderReview", label: "Under Review" },
  { status: "Planned", label: "Planned" },
  { status: "InProgress", label: "In Progress" },
  { status: "Released", label: "Released" },
];

function priorityTone(priority: FeatureRequest["priority"]): string {
  switch (priority) {
    case "High": return "red";
    case "Medium": return "amber";
    case "Low": return "gray";
  }
}

export default function RoadmapPage() {
  const [activeTab, setActiveTab] = useState<"roadmap" | "analytics">("roadmap");
  const navigate = useNavigate();

  const { data: features, isLoading: featuresLoading } = useQuery({
    queryKey: ["feature-requests", ""],
    queryFn: () => api.listFeatureRequests(),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["feature-analytics"],
    queryFn: () => api.getFeatureAnalytics(),
    enabled: activeTab === "analytics",
  });

  const grouped = COLUMNS.reduce<Record<KanbanStatus, FeatureRequest[]>>(
    (acc, col) => {
      acc[col.status] = (features?.items ?? []).filter((f) => f.status === col.status);
      return acc;
    },
    {} as Record<KanbanStatus, FeatureRequest[]>
  );

  const maxAgencyCount = Math.max(
    ...(analytics?.top_features.map((f) => f.agency_count) ?? []),
    1
  );
  const maxMonthCount = Math.max(
    ...(analytics?.monthly_trend.map((m) => m.count) ?? []),
    1
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Roadmap</h1>
        <p className="text-sm text-gray-500 mt-0.5">Feature planning and prioritization</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-md mb-6 w-fit">
        <button
          onClick={() => setActiveTab("roadmap")}
          className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === "roadmap"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Roadmap
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === "analytics"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Roadmap tab — Kanban board */}
      {activeTab === "roadmap" && (
        <>
          {featuresLoading && (
            <div className="text-sm text-gray-400 py-12 text-center">Loading roadmap…</div>
          )}
          {!featuresLoading && (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {COLUMNS.map((col) => {
                const cards = grouped[col.status] ?? [];
                return (
                  <div key={col.status} className="flex-shrink-0 w-64">
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        {col.label}
                      </h2>
                      <span className="text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        {cards.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="space-y-2">
                      {cards.length === 0 ? (
                        <div className="text-xs text-gray-300 text-center py-8 border border-dashed border-gray-200 rounded-lg">
                          Empty
                        </div>
                      ) : (
                        cards.map((fr) => (
                          <div
                            key={fr.id}
                            onClick={() => navigate(`/roadmap/features/${fr.id}`)}
                            className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all"
                          >
                            <p className="text-sm font-medium text-gray-900 leading-snug mb-2">
                              {fr.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <Badge label={fr.priority} tone={priorityTone(fr.priority)} />
                              {fr.target_release && (
                                <span className="text-xs text-gray-400">{fr.target_release}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400">
                              <span>{fr.agency_count} {fr.agency_count === 1 ? "agency" : "agencies"}</span>
                              <span className="font-medium text-gray-600">Score: {fr.score}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Analytics tab */}
      {activeTab === "analytics" && (
        <>
          {analyticsLoading && (
            <div className="text-sm text-gray-400 py-12 text-center">Loading analytics…</div>
          )}
          {!analyticsLoading && analytics && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top Requested Features */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Requested Features</h2>
                {analytics.top_features.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {analytics.top_features.map((f) => (
                      <div key={f.id} className="flex items-center gap-3">
                        <button
                          onClick={() => navigate(`/roadmap/features/${f.id}`)}
                          className="text-xs text-gray-600 hover:text-blue-600 text-left truncate flex-shrink-0"
                          style={{ width: "140px" }}
                          title={f.title}
                        >
                          {f.title}
                        </button>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{
                              width: `${Math.round((f.agency_count / maxAgencyCount) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-6 text-right flex-shrink-0">
                          {f.agency_count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Most Requested By */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Most Requested By</h2>
                {analytics.top_agencies.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.top_agencies.map((agency) => (
                      <div key={agency.code} className="flex items-center justify-between py-1">
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-gray-700">{agency.code}</span>
                          <span className="text-xs text-gray-400 ml-2 truncate">{agency.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                          {agency.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Feature Requests Over Time */}
              <div className="bg-white border border-gray-200 rounded-lg p-5 lg:col-span-2">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Feature Requests Over Time
                </h2>
                {analytics.monthly_trend.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No data yet</p>
                ) : (
                  <div className="flex items-end gap-2 h-36">
                    {analytics.monthly_trend.map((m) => (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500">{m.count}</span>
                        <div
                          className="w-full bg-blue-200 rounded-t"
                          style={{
                            height: `${Math.max(
                              Math.round((m.count / maxMonthCount) * 80),
                              4
                            )}px`,
                          }}
                        />
                        <span className="text-xs text-gray-400 truncate w-full text-center leading-tight">
                          {m.month}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
