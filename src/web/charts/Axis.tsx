// SVG chart chrome: hairline gridlines, baseline, muted tick labels.
import { VIZ } from "./colors";
import { textWidth } from "./scales";

export type Tick = { px: number; label: string };
const tickText = { fill: VIZ.muted, fontSize: 11 } as const;

/** Drop tick labels that would collide. */
export function thinTicks(ticks: Tick[], minGap = 8): Tick[] {
  const out: Tick[] = [];
  let lastEnd = -Infinity;
  for (const t of ticks) {
    const w = textWidth(t.label);
    if (t.px - w / 2 >= lastEnd + minGap) {
      out.push(t);
      lastEnd = t.px + w / 2;
    }
  }
  return out;
}

export function XAxis({ ticks, y, x1, x2, line = true }: { ticks: Tick[]; y: number; x1: number; x2: number; line?: boolean }) {
  return (
    <g aria-hidden>
      {line && <line x1={x1} x2={x2} y1={y + 0.5} y2={y + 0.5} style={{ stroke: VIZ.axis }} />}
      {thinTicks(ticks).map((t) => {
        // Keep edge labels inside the plot instead of clipping at the SVG border.
        const w = textWidth(t.label);
        const anchor = t.px + w / 2 > x2 + 4 ? "end" : t.px - w / 2 < x1 - 24 ? "start" : "middle";
        return (
          <text key={`${t.px}-${t.label}`} x={anchor === "end" ? Math.min(t.px, x2 + 4) : t.px} y={y + 16} textAnchor={anchor} style={tickText}>
            {t.label}
          </text>
        );
      })}
    </g>
  );
}

export function YAxis({ ticks, x, anchor = "end" }: { ticks: Tick[]; x: number; anchor?: "end" | "start" }) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <text key={`${t.px}-${t.label}`} x={x} y={t.px} dy="0.32em" textAnchor={anchor} style={tickText}>
          {t.label}
        </text>
      ))}
    </g>
  );
}

export function Gridlines({ at, orientation = "h", from, to }: { at: number[]; orientation?: "h" | "v"; from: number; to: number }) {
  return (
    <g aria-hidden>
      {at.map((p) => {
        const q = Math.round(p) + 0.5;
        return orientation === "h" ? (
          <line key={p} x1={from} x2={to} y1={q} y2={q} style={{ stroke: VIZ.grid }} />
        ) : (
          <line key={p} y1={from} y2={to} x1={q} x2={q} style={{ stroke: VIZ.grid }} />
        );
      })}
    </g>
  );
}

export function Dot({ cx, cy, color, r = 4 }: { cx: number; cy: number; color: string; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} style={{ fill: color, stroke: VIZ.surface }} strokeWidth={2} />;
}
