interface Column<T> {
  key: keyof T;
  label: string;
  format?: (value: T[keyof T], row: T) => string;
}

/**
 * Renders any array of flat objects as a dense table matching the app's
 * existing style (used by Performance.tsx etc.), without hand-writing the
 * same <table>/<thead>/<tbody> markup for every one of the new metrics.
 * Pass explicit columns for control over order/formatting; falls back to
 * every key on the first row if omitted.
 */
export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  emptyMessage = "No data yet.",
  keyField,
}: {
  rows: T[] | undefined;
  columns?: Column<T>[];
  emptyMessage?: string;
  keyField?: keyof T;
}) {
  const cols: Column<T>[] = columns ?? (rows && rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k as keyof T, label: k })) : []);

  return (
    <div className="overflow-hidden rounded border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
          <tr>
            {cols.map((col) => (
              <th key={String(col.key)} className="px-4 py-2 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row, i) => (
            <tr key={keyField ? String(row[keyField]) : i} className="border-t border-border-subtle">
              {cols.map((col) => {
                const raw = row[col.key];
                const display = col.format ? col.format(raw, row) : formatCell(raw);
                return (
                  <td key={String(col.key)} className="px-4 py-2 text-muted">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
          {(!rows || rows.length === 0) && (
            <tr>
              <td colSpan={Math.max(cols.length, 1)} className="px-4 py-6 text-center text-faint">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}
