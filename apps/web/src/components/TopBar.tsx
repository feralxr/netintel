import { StatusBadge } from "./StatusBadge";
import { useLiveFeed } from "../lib/use-live-feed";

export function TopBar({ title }: { title: string }) {
  const { connected } = useLiveFeed();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="text-faint">netintel</span>
        <span className="text-faint">/</span>
        <span className="text-text">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded border border-border px-2 py-1 text-[10px] text-faint">Ctrl/Cmd+K to search</span>
        <StatusBadge tone={connected ? "ok" : "neutral"}>{connected ? "live" : "connecting"}</StatusBadge>
      </div>
    </header>
  );
}
