import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

interface SearchResults {
  domains: { domain: string; queryCount: number }[];
  devices: { deviceId: string; hostname: string | null; currentIp: string | null; mac: string | null }[];
  savedQueries: { id: string; name: string; description: string | null }[];
}

async function search(q: string): Promise<SearchResults> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("search failed");
  return res.json();
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["global-search", query],
    queryFn: () => search(query),
    enabled: query.trim().length >= 2,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const goToDomain = (domain: string) => {
    setOpen(false);
    navigate({ to: "/domains/$domain", params: { domain } });
  };

  const hasResults = data && (data.domains.length > 0 || data.devices.length > 0 || data.savedQueries.length > 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search domains, devices, saved queries…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text outline-none placeholder:text-faint"
        />
        <div className="max-h-80 overflow-y-auto p-2">
          {query.trim().length >= 2 && !hasResults && <p className="px-2 py-3 text-center text-xs text-faint">No matches.</p>}

          {data && data.domains.length > 0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-faint">Domains</p>
              {data.domains.map((d) => (
                <button
                  key={d.domain}
                  onClick={() => goToDomain(d.domain)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-text hover:bg-surface-2"
                >
                  <span>{d.domain}</span>
                  <span className="text-xs text-faint">{d.queryCount} queries</span>
                </button>
              ))}
            </div>
          )}

          {data && data.devices.length > 0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-faint">Devices</p>
              {data.devices.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: "/network" });
                  }}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-text hover:bg-surface-2"
                >
                  <span>{d.hostname ?? d.currentIp ?? d.deviceId.slice(0, 8)}</span>
                  <span className="text-xs text-faint">{d.currentIp}</span>
                </button>
              ))}
            </div>
          )}

          {data && data.savedQueries.length > 0 && (
            <div>
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-faint">Saved queries</p>
              {data.savedQueries.map((sq) => (
                <div key={sq.id} className="rounded px-2 py-1.5 text-sm text-text">
                  <span>{sq.name}</span>
                  {sq.description && <span className="ml-2 text-xs text-faint">{sq.description}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-[10px] text-faint">
          <kbd className="rounded border border-border px-1">Esc</kbd> to close ·{" "}
          <kbd className="rounded border border-border px-1">Ctrl/Cmd+K</kbd> to toggle
        </div>
      </div>
    </div>
  );
}
