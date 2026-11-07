// Data table with optional click-to-sort columns; numeric columns right-aligned with tabular figures.
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface Column<R> {
  key: string;
  header: ReactNode;
  render: (row: R, i: number) => ReactNode;
  align?: "left" | "right";
  /** Provide to make the column sortable. */
  sortValue?: (row: R) => number | string | null;
  className?: string;
}

export interface TableProps<R> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string;
  caption?: string;
  onRowClick?: (row: R) => void;
  initialSort?: { key: string; dir: "asc" | "desc" };
  maxHeight?: number;
  empty?: ReactNode;
  className?: string;
  dense?: boolean;
}

export function Table<R>({ columns, rows, rowKey, caption, onRowClick, initialSort, maxHeight, empty, className, dense }: TableProps<R>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const f = col.sortValue;
    const dir = sort!.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, sort, columns]);

  if (!rows.length && empty) return <>{empty}</>;
  const pad = dense ? "px-2.5 py-1.5" : "px-3 py-2";
  return (
    <div className={cn("relative w-full overflow-x-auto rounded-card border border-border", className)} style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10 bg-surface-2 text-left font-heading text-xs text-heading">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const label = c.sortValue ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium hover:text-ink"
                  onClick={() => setSort({ key: c.key, dir: active && sort!.dir === "desc" ? "asc" : "desc" })}
                >
                  {c.header}
                  <span aria-hidden className="text-[10px]">{active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                </button>
              ) : (
                c.header
              );
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined} className={cn(pad, "whitespace-nowrap font-medium", c.align === "right" && "text-right", c.className)}>
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={rowKey(r, i)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn("border-t border-border even:bg-surface-2", onRowClick && "cursor-pointer hover:bg-brand-soft")}
            >
              {columns.map((c, ci) => (
                <td key={c.key} className={cn(pad, c.align === "right" && "tnum whitespace-nowrap text-right", ci === 0 && "whitespace-nowrap", c.className)}>
                  {c.render(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
