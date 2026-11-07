// Page-local SVG charts: paired story bars and a dot-and-range chart. Values are drawn as returned.
import { useState } from "react";
import type { Story } from "@/shared/insights";
import { ChartTooltip, Gridlines, Legend, VIZ, XAxis, bandScale, extent, linearScale, textWidth, useMeasure, type TooltipData } from "../../charts";
import { STORY_COLOR, STORY_LABEL } from "./kit";

export interface PairedRow {
  key: string;
  label: string;
  values: Partial<Record<Story, number | null>>;
}

const STORIES: Story[] = ["below_2c", "current_policies"];

/** Horizontal bars, one per climate story, for each category. */
export function StoryBars({ rows, format, axisFormat = format, ariaLabel, storyLabel = (s) => STORY_LABEL[s] }: { rows: PairedRow[]; format: (v: number) => string; axisFormat?: (v: number) => string; ariaLabel: string; storyLabel?: (s: Story) => string }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipData | null>(null);
  const narrow = width < 480;
  const labelW = narrow ? 0 : Math.min(200, Math.max(60, ...rows.map((r) => textWidth(r.label, 12) + 12)));
  const rowH = narrow ? 64 : 46;
  const m = { t: 4, r: 58, b: 22, l: narrow ? 46 : labelW + 4 };
  const H = rows.length * rowH + m.t + m.b;
  const iw = Math.max(0, width - m.l - m.r);
  const vals = rows.flatMap((r) => STORIES.map((s) => r.values[s] ?? null));
  const [lo, hi] = extent(vals);
  const x = linearScale([Math.min(0, lo), Math.max(0, hi)], [m.l, m.l + iw], { nice: true });
  const band = bandScale(rows.map((r) => r.key), [m.t, m.t + rows.length * rowH], { paddingInner: 0.2, paddingOuter: 0.05 });
  const ticks = x.ticks(Math.max(2, Math.floor(iw / 80))).map((t) => ({ px: x(t), label: axisFormat(t) }));
  const zero = x(0);
  const top = narrow ? 16 : 0;
  const bh = Math.max(6, (band.bandwidth - top - 4) / 2);

  return (
    <div className="flex flex-col gap-2">
      <Legend items={STORIES.map((s) => ({ label: storyLabel(s), color: STORY_COLOR[s] }))} />
      <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={ariaLabel}>
            <Gridlines at={ticks.map((t) => t.px)} orientation="v" from={m.t} to={H - m.b} />
            {rows.map((r) => {
              const y0 = band(r.key);
              return (
                <g key={r.key}>
                  <text x={narrow ? 0 : m.l - 8} y={narrow ? y0 + 10 : y0 + band.bandwidth / 2} dy={narrow ? 0 : "0.32em"} textAnchor={narrow ? "start" : "end"} style={{ fill: VIZ.ink, fontSize: 12 }}>
                    {r.label}
                  </text>
                  {STORIES.map((s, i) => {
                    const v = r.values[s];
                    if (v == null || !Number.isFinite(v)) return null;
                    const y = y0 + top + i * (bh + 2);
                    const px = x(v);
                    return (
                      <g
                        key={s}
                        onMouseMove={(e) => {
                          const b = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
                          setTip({ x: e.clientX - b.left, y: e.clientY - b.top, title: r.label, rows: STORIES.map((q) => ({ label: storyLabel(q), value: r.values[q] == null ? "–" : format(r.values[q]!), color: STORY_COLOR[q], shape: "rect" as const })) });
                        }}
                      >
                        <rect x={Math.min(px, zero)} y={y} width={Math.max(1, Math.abs(px - zero))} height={bh} rx={2} style={{ fill: STORY_COLOR[s] }} />
                        <text x={v >= 0 ? Math.max(px, zero) + 4 : Math.min(px, zero) - 4} y={y + bh / 2} dy="0.32em" textAnchor={v >= 0 ? "start" : "end"} className="tnum" style={{ fill: VIZ.muted, fontSize: 11 }}>
                          {format(v)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            <line x1={zero} x2={zero} y1={m.t} y2={H - m.b} style={{ stroke: VIZ.axis }} />
            <XAxis ticks={ticks} y={H - m.b} x1={m.l} x2={m.l + iw} line={false} />
          </svg>
        )}
        <ChartTooltip tip={tip} width={width} />
      </div>
    </div>
  );
}

export interface RangeRow {
  key: string;
  label: string;
  value: number | null;
  lo: number | null;
  hi: number | null;
  color: string;
  badge?: string;
  detail?: { label: string; value: string }[];
}

/** Dot (estimate) on a line (range), with a zero line for "no change". */
export function DotRange({ rows, format, ariaLabel, zeroLabel = "No change" }: { rows: RangeRow[]; format: (v: number) => string; ariaLabel: string; zeroLabel?: string }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipData | null>(null);
  const labelW = Math.min(170, Math.max(60, ...rows.map((r) => textWidth(r.label + (r.badge ? " ●" : ""), 12) + 12)));
  const rowH = 34;
  const m = { t: 18, r: 16, b: 22, l: labelW };
  const H = rows.length * rowH + m.t + m.b;
  const iw = Math.max(0, width - m.l - m.r);
  const [lo, hi] = extent(rows.flatMap((r) => [r.value, r.lo, r.hi]));
  const x = linearScale([Math.min(0, lo), Math.max(0, hi)], [m.l, m.l + iw], { nice: true });
  const ticks = x.ticks(Math.max(2, Math.floor(iw / 70))).map((t) => ({ px: x(t), label: format(t) }));
  const zero = x(0);

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          <Gridlines at={ticks.map((t) => t.px)} orientation="v" from={m.t} to={H - m.b} />
          <line x1={zero} x2={zero} y1={m.t - 6} y2={H - m.b} style={{ stroke: VIZ.muted }} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={zero} y={10} textAnchor="middle" style={{ fill: VIZ.muted, fontSize: 11 }}>
            {zeroLabel}
          </text>
          {rows.map((r, i) => {
            const cy = m.t + i * rowH + rowH / 2;
            return (
              <g
                key={r.key}
                onMouseMove={(e) => {
                  const b = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
                  setTip({
                    x: e.clientX - b.left,
                    y: e.clientY - b.top,
                    title: r.label,
                    rows: [
                      { label: "estimate", value: r.value == null ? "–" : format(r.value), color: r.color, shape: "dot" },
                      { label: "range, one season left out", value: r.lo == null || r.hi == null ? "–" : `${format(r.lo)} to ${format(r.hi)}` },
                      ...(r.detail ?? []),
                    ],
                    note: r.badge,
                  });
                }}
              >
                <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill="transparent" />
                <text x={m.l - 10} y={cy} dy="0.32em" textAnchor="end" style={{ fill: VIZ.ink, fontSize: 12 }}>
                  {r.label}
                  {r.badge && <tspan style={{ fill: "var(--status-degraded)" }}> ●</tspan>}
                </text>
                {r.lo != null && r.hi != null && <line x1={x(r.lo)} x2={x(r.hi)} y1={cy} y2={cy} style={{ stroke: VIZ.muted }} strokeWidth={3} strokeLinecap="round" opacity={0.55} />}
                {r.value != null && <circle cx={x(r.value)} cy={cy} r={7} style={{ fill: r.color, stroke: "var(--text)" }} strokeWidth={1} />}
              </g>
            );
          })}
          <XAxis ticks={ticks} y={H - m.b} x1={m.l} x2={m.l + iw} />
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  );
}
