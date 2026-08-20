type BadgeTone = "ok" | "warn" | "crit" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  ok: "bg-ok/10 text-ok border-ok/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  crit: "bg-crit/10 text-crit border-crit/30",
  neutral: "bg-surface-2 text-muted border-border",
};

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${TONE_CLASSES[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
