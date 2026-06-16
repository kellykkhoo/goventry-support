// apps/frontend/src/pages/HermesActivityPage.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { getToken } from "../lib/api";
import Badge from "../components/Badge";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function fetchHermesActivity() {
  const res = await fetch(`${BASE}/hermes/activity`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Failed to load activity");
  return res.json() as Promise<HermesJobRun[]>;
}

async function fetchHermesReports(report_type?: string) {
  const qs = report_type ? `?report_type=${report_type}` : "";
  const res = await fetch(`${BASE}/hermes/reports${qs}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Failed to load reports");
  return res.json() as Promise<HermesReport[]>;
}

interface HermesJobRun {
  id: number;
  job_name: string;
  issue_id: number | null;
  status: string;
  result_summary: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

interface HermesReport {
  id: number;
  report_type: string;
  agency_id: number | null;
  slack_sent: boolean;
  payload: Record<string, unknown>;
  created_at: string;
}

function statusTone(status: string) {
  if (status === "success") return "green";
  if (status === "failed") return "red";
  return "blue";
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HermesActivityPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [reportTypeFilter, setReportTypeFilter] = useState("");

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["hermes", "activity"],
    queryFn: fetchHermesActivity,
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["hermes", "reports", reportTypeFilter],
    queryFn: () => fetchHermesReports(reportTypeFilter || undefined),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 text-sm">Access restricted to Admin.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Hermes Activity</h1>
        <p className="text-sm text-gray-500 mt-0.5">AI agent job history and generated reports.</p>
      </div>

      {/* Job Runs */}
      <div className="bg-white border border-gray-200 rounded-lg mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Job Runs</h2>
        </div>
        {jobsLoading ? (
          <p className="p-5 text-sm text-gray-400">Loading…</p>
        ) : !jobs || jobs.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">No job runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left px-5 py-3 font-medium">ID</th>
                  <th className="text-left px-5 py-3 font-medium">Job</th>
                  <th className="text-left px-5 py-3 font-medium">Issue</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Summary</th>
                  <th className="text-left px-5 py-3 font-medium">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-400 text-xs">{job.id}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{job.job_name}</td>
                    <td className="px-5 py-3">
                      {job.issue_id ? (
                        <Link
                          to={`/tickets/${job.issue_id}`}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          #{job.issue_id}
                        </Link>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge label={job.status} tone={statusTone(job.status)} />
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600 max-w-xs truncate">
                      {job.status === "failed"
                        ? job.error_message ?? "Unknown error"
                        : job.result_summary ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">{relativeDate(job.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reports */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Reports</h2>
          <select
            value={reportTypeFilter}
            onChange={(e) => setReportTypeFilter(e.target.value)}
            className="ml-auto text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All types</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        {reportsLoading ? (
          <p className="p-5 text-sm text-gray-400">Loading…</p>
        ) : !reports || reports.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">No reports generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left px-5 py-3 font-medium">ID</th>
                  <th className="text-left px-5 py-3 font-medium">Type</th>
                  <th className="text-left px-5 py-3 font-medium">Agency</th>
                  <th className="text-left px-5 py-3 font-medium">Slack</th>
                  <th className="text-left px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-400 text-xs">{r.id}</td>
                    <td className="px-5 py-3">
                      <Badge label={r.report_type} tone={r.report_type === "weekly" ? "blue" : "gray"} />
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600">
                      {r.agency_id ? `Agency ${r.agency_id}` : "All"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge label={r.slack_sent ? "sent" : "not sent"} tone={r.slack_sent ? "green" : "gray"} />
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">{relativeDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
