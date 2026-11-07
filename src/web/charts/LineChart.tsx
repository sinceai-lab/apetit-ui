// Multi-series chart over a numeric/time x axis: lines, dashed lines, min–max bands and column bars.
import { useMemo, useState } from "react";
import { bandPath, extent, linePath, linearScale, nearestIndex, padDomain, timeTicks } from "./scales";
import { useMeasure } from "./useMeasure";
import { Gridlines, XAxis, YAxis } from "./Axis";
import { ChartTooltip, type TooltipData } from "./Tooltip";
import { VIZ } from "./colors";

export interface XYPoint {
  x: number;
  y: number | null;
  lo?: number | null;
  hi?: number | null;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  points: XYPoint[];
  kind?: "line" | "band" | "bars";
  dashed?: boolean;
  width?: number;
  /** Excluded from the tooltip. */
  quiet?: boolean;
}

export interface LineChartProps {
  series: Series[];
  height?: number;
  xType?: "time" | "number";
  formatX?: (x: number) => string;
  formatY?: (y: number) => string;
  yDomain?: [number, number];
  includeZero?: boolean;
  /** Vertical marker lines, e.g. "today" in data time. */
  markers?: { x: number; label: string }[];
  ariaLabel: string;
}

const defaultTimeFmt = (x: number) => new Date(x).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export function LineChart({ series, height = 240, xType = "number", formatX, formatY = (y) => String(Math.round(y * 10) / 10), yDomain, includeZero, markers = [], ariaLabel }: LineChartProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const fx = formatX ?? (xType === "time" ? defaultTimeFmt : (x: number) => String(x));
  const m = { t: 12, r: 12, b: 26, l: 44 };
  const iw = Math.max(0, width - m.l - m.r);
  const ih = Math.max(0, height - m.t - m.b);

  const { x, y } = useMemo(() => {
    const xs = series.flatMap((s) => s.points.map((p) => p.x));
    const ys = series.flatMap((s) => s.points.flatMap((p) => [p.y, p.lo, p.hi]));
    if (includeZero || series.some((s) => s.kind === "bars")) ys.push(0);
    const yd = yDomain ?? padDomain(extent(ys), 0.04);
    return { x: linearScale(extent(xs), [m.l, m.l + iw]), y: linearScale(yd, [m.t + ih, m.t], { nice: true }) };
  }, [series, iw, ih, yDomain, includeZero]);

  const xTicks = useMemo(() => {
    const [a, b] = x.domain;
    const n = Math.max(2, Math.floor(iw / 90));
    const cal = xType === "time" ? timeTicks(a, b, n + 1) : [];
    const vals = xType !== "time" ? x.ticks(n) : cal.length >= 2 ? cal : Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
    return vals.map((v) => ({ px: x(v), label: fx(v) }));
  }, [x, iw, xType]);
  const yTicks = y.ticks(Math.max(2, Math.floor(ih / 50))).map((t) => ({ px: y(t), label: formatY(t) }));

  let tip: TooltipData | null = null;
  if (hoverX != null) {
    const rows = series
      .filter((s) => !s.quiet && s.points.length)
      .map((s) => {
        const p = s.points[nearestIndex(s.points.map((q) => q.x), hoverX)]!;
        const v = s.kind === "band" ? (p.lo != null && p.hi != null ? `${formatY(p.lo)}–${formatY(p.hi)}` : "–") : p.y != null ? formatY(p.y) : "–";
        return { label: s.label, value: v, color: s.color, shape: s.kind === "bars" ? ("rect" as const) : s.dashed ? ("dash" as const) : ("line" as const) };
      });
    tip = { x: x(hoverX), y: m.t + 8, title: fx(hoverX), rows };
  }

  return (
    <div
      ref={ref}
      className="relative w-full touch-pan-y"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - r.left;
        setHoverX(px >= m.l && px <= m.l + iw ? x.invert(px) : null);
      }}
      onPointerLeave={() => setHoverX(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <Gridlines at={yTicks.map((t) => t.px)} from={m.l} to={m.l + iw} />
          {series.map((s) => {
            const xs = s.points.map((p) => x(p.x));
            if (s.kind === "band")
              return <path key={s.id} d={bandPath(xs, s.points.map((p) => (p.lo == null ? null : y(p.lo))), s.points.map((p) => (p.hi == null ? null : y(p.hi))))} style={{ fill: s.color, opacity: 0.18 }} />;
            if (s.kind === "bars") {
              const bw = Math.max(1, (iw / Math.max(1, s.points.length)) * 0.7);
              return (
                <g key={s.id} style={{ fill: s.color }}>
                  {s.points.map((p, i) => (p.y == null ? null : <rect key={i} x={xs[i]! - bw / 2} y={Math.min(y(0), y(p.y))} width={bw} height={Math.abs(y(p.y) - y(0))} />))}
                </g>
              );
            }
            return (
              <path
                key={s.id}
                d={linePath(xs, s.points.map((p) => (p.y == null ? null : y(p.y))))}
                fill="none"
                style={{ stroke: s.color }}
                strokeWidth={s.width ?? 2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
          {markers.map((mk) => (
            <g key={mk.label} aria-hidden>
              <line x1={x(mk.x)} x2={x(mk.x)} y1={m.t} y2={m.t + ih} style={{ stroke: VIZ.muted }} strokeDasharray="2 3" />
              <text x={x(mk.x) + 4} y={m.t + 10} style={{ fill: VIZ.muted, fontSize: 11 }}>
                {mk.label}
              </text>
            </g>
          ))}
          {hoverX != null && <line x1={x(hoverX)} x2={x(hoverX)} y1={m.t} y2={m.t + ih} style={{ stroke: VIZ.axis }} />}
          <YAxis ticks={yTicks} x={m.l - 6} />
          <XAxis ticks={xTicks} y={m.t + ih} x1={m.l} x2={m.l + iw} />
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  );
}

/** "2027-06-01" -> epoch ms (UTC) for time axes. */
export const dateX = (s: string) => Date.parse(s.length === 7 ? `${s}-01T00:00:00Z` : `${s}T00:00:00Z`);
