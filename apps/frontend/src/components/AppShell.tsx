// apps/frontend/src/components/AppShell.tsx
import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

function NavLink({ to, label, badge, exact = false }: { to: string; label: string; badge?: number; exact?: boolean }) {
  const { pathname } = useLocation();
  const active = exact ? pathname === to : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
        active ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
      }`}
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-amber-500 text-white rounded-full">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function SubNavLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`flex items-center pl-6 pr-3 py-1.5 rounded text-xs transition-colors ${
        active ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-700 hover:text-white"
      }`}
    >
      <span className="mr-2 opacity-50">›</span>
      {label}
    </Link>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const { data: pendingApprovals } = useQuery({
    queryKey: ["approvals", "pending-count"],
    queryFn: () =>
      api.listApprovals(new URLSearchParams({ status: "pending", per_page: "1" })),
    refetchInterval: 30000,
  });

  const isAdmin = user?.role === "Admin";
  const kbActive = pathname.startsWith("/knowledge");
  const roadmapActive = pathname.startsWith("/roadmap");

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-700">
          <p className="text-white font-semibold text-sm leading-tight">GovEntry Support</p>
          <p className="text-gray-400 text-xs mt-0.5">Internal portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          <NavLink to="/tickets" label="Tickets" />
          <NavLink to="/agencies" label="Agencies" />

          {/* Roadmap with sub-nav */}
          <NavLink to="/roadmap" label="Roadmap" exact />
          {roadmapActive && (
            <div className="space-y-0.5 mt-0.5">
              <SubNavLink to="/roadmap/features" label="Feature Backlog" />
              <SubNavLink to="/roadmap" label="Kanban Board" />
            </div>
          )}

          <NavLink to="/approvals" label="Approvals" badge={pendingApprovals?.total} />

          {/* Knowledge Base with sub-nav */}
          <NavLink to="/knowledge" label="Knowledge Base" exact />
          {kbActive && (
            <div className="space-y-0.5 mt-0.5">
              <SubNavLink to="/knowledge/guides" label="User Guides" />
              <SubNavLink to="/knowledge/tickets" label="Resolved Tickets" />
            </div>
          )}

          {isAdmin && <NavLink to="/reports" label="Reports" />}
          {isAdmin && <NavLink to="/hermes" label="Hermes" />}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <p className="text-gray-200 text-sm font-medium truncate">{user?.name}</p>
          <p className="text-gray-400 text-xs">{user?.role ?? "—"}</p>
          <button
            onClick={logout}
            className="mt-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
