// apps/web/src/components/AppShell.tsx
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_ITEMS = [
  { to: "/tickets", label: "Tickets" },
  { to: "/agencies", label: "Agencies" },
];

function NavLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`block px-3 py-2 rounded text-sm transition-colors ${
        active ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-700">
          <p className="text-white font-semibold text-sm leading-tight">GovEntry Support</p>
          <p className="text-gray-400 text-xs mt-0.5">Internal portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
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
