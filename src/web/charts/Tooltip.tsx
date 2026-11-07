// Chart tooltip box and series key swatch.
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type KeyShape = "line" | "rect" | "dot" | "dash";
export type TooltipRow = { label: string; value: string; color?: string; shape?: KeyShape };
export type TooltipData = { x: number; y: number; title?: ReactNode; rows: TooltipRow[]; note?: ReactNode };

export function Key({ color, shape = "rect", className }: { color: string; shape?: KeyShape; className?: string }) {
  if (shape === "line") return <span aria-hidden className={cn("inline-block h-0.5 w-3 shrink-0 rounded-full", className)} style={{ background: color }} />;
  if (shape === "dash") return <span aria-hidden className={cn("inline-block w-3 shrink-0 border-t-2 border-dashed", className)} style={{ borderColor: color }} />;
  if (shape === "dot") return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", className)} style={{ background: color }} />;
}

/** Positioned inside a `relative` chart container; flips left near the right edge. */
export function ChartTooltip({ tip, width }: { tip: TooltipData | null; width: number }) {
  if (!tip) return null;
  const flip = tip.x > width - 200;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute z-20 min-w-36 max-w-64 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left: flip ? undefined : tip.x + 14, right: flip ? Math.max(0, width - tip.x + 14) : undefined, top: Math.max(0, tip.y - 8) }}
    >
      {tip.title != null && <div className="mb-1 font-medium text-ink">{tip.title}</div>}
      <ul className="flex flex-col gap-1">
        {tip.rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            {r.color && <Key color={r.color} shape={r.shape ?? "line"} />}
            <span className="tnum font-medium text-ink">{r.value}</span>
            <span className="truncate text-muted">{r.label}</span>
          </li>
        ))}
      </ul>
      {tip.note != null && <div className="mt-1 text-muted">{tip.note}</div>}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; shape?: KeyShape }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Key color={i.color} shape={i.shape} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
