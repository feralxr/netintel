import { Link, useRouterState } from "@tanstack/react-router";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: "◆" },
  { to: "/network", label: "Network", icon: "▤" },
  { to: "/domains", label: "Domains", icon: "◈" },
  { to: "/security", label: "Security", icon: "◉" },
  { to: "/performance", label: "Performance", icon: "▲" },
  { to: "/history", label: "History", icon: "▦" },
  { to: "/map", label: "Relationship Map", icon: "◎" },
  { to: "/explorer", label: "Explorer", icon: "⌕" },
  { to: "/dashboards", label: "Dashboards", icon: "▧" },
  { to: "/alerts", label: "Alerts", icon: "⚠" },
  { to: "/synthetics", label: "Synthetics", icon: "◍" },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex h-full w-14 flex-col items-center border-r border-border bg-surface py-4">
      <div className="mb-6 flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-bold text-bg">
        n
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to + "/"));
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={`flex h-10 w-10 items-center justify-center rounded text-lg transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-faint hover:bg-surface-2 hover:text-muted"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
