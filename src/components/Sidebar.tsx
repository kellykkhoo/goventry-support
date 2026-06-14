"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Issues", icon: "◫" },
  { href: "/board", label: "Board", icon: "▥" },
  { href: "/agencies", label: "Agencies", icon: "🏛" },
  { href: "/team", label: "Team", icon: "👥" },
  { href: "/knowledge", label: "Knowledge", icon: "📚" },
  { href: "/support", label: "Support Form", icon: "✉" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-border bg-panel px-3 py-5">
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold text-white">GovEntry Support</div>
        <div className="text-xs text-muted">GovEntry · GovSupply · GovRewards</div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                active ? "bg-card text-white" : "text-muted hover:bg-card hover:text-zinc-200"
              }`}
            >
              <span className="w-4 text-center text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 text-[11px] leading-relaxed text-muted">
        Intake: web · FormSG · GovEntry
        <br />
        AI triage: human-approved replies
      </div>
    </aside>
  );
}
