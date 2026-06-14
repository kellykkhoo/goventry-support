// apps/frontend/src/pages/AgenciesPage.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import Badge from "../components/Badge";

function statusTone(status: string): string {
  switch (status) {
    case "Done":
      return "green";
    case "InProgress":
      return "blue";
    case "Cancelled":
      return "gray";
    default:
      return "amber";
  }
}

export default function AgenciesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["agencies"],
    queryFn: () => api.listAgencies(),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-sm text-gray-400 text-center">
        Loading agencies…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-sm text-red-600 text-center">
        {(error as Error)?.message ?? "Failed to load agencies."}
      </div>
    );
  }

  const { agencies, top_requests } = data;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Agencies</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {agencies.length} {agencies.length === 1 ? "agency" : "agencies"}
        </p>
      </div>

      {agencies.length === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center">
          No agencies found.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-8">
          {agencies.map((agency) => (
            <div
              key={agency.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-gray-900 text-sm">
                  {agency.code}
                </span>
                <span className="text-xs text-gray-400 truncate ml-2 max-w-[120px]">
                  {agency.name}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(agency.counts).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <p className="text-lg font-semibold text-gray-900">
                      {count}
                    </p>
                    <p className="text-xs text-gray-400">{status}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top requests */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Top requests across agencies
        </h2>
        {top_requests.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">
            No cross-agency requests yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Title
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Agencies affected
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {top_requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                      {req.title}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {req.distinct_agency_count}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={req.status} tone={statusTone(req.status)} />
                    </td>
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
