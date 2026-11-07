// Horizontal paired bars: one row per group, one bar per series (e.g. baseline vs our model), values as returned.
import { useState, type MouseEvent } from "react";
import { barPath, bandScale, linearScale, textWidth, useMeasure, Gridlines, XAxis, YAxis, ChartTooltip, VIZ, type TooltipData } from "../../charts";

export interface PairRow {
  key: string;
  label: string;
  values: (number | null)[];
}

export function PairedBars({ rows, series, format, ariaLabel, rowHeight = 40 }: { rows: PairRow[]; series: { label: string; color: string }[]; format: (v: number) => string; ariaLabel: string; rowHeight?: number }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipData | null>(null);
  const labelW = Math.min(170, Math.max(60, ...rows.map((r) => textWidth(r.label, 12) + 10)));
  const m = { t: 4, r: 52, b: 22, l: labelW };
  const H = rows.length * rowHeight + m.t + m.b;
  const iw = Math.max(0, width - m.l - m.r);
  const max = Math.max(0, ...rows.flatMap((r) => r.values.filter((v): v is number => v != null)));
  const x = linearScale([0, max || 1], [m.l, m.l + iw], { nice: true });
  const band = bandScale(rows.map((r) => r.key), [m.t, m.t + rows.length * rowHeight], { paddingInner: 0.25 });
  const sub = band.bandwidth / series.length;
  const ticks = x.ticks(Math.max(2, Math.floor(iw / 80))).map((t) => ({ px: x(t), label: format(t) }));

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          <Gridlines at={ticks.map((t) => t.px)} orientation="v" from={m.t} to={H - m.b} />
          {rows.map((r) => {
            const y0 = band(r.key);
            const show = (e: MouseEvent) => {
              const b = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
              setTip({ x: e.clientX - b.left, y: e.clientY - b.top, title: r.label, rows: series.map((s, i) => ({ label: s.label, value: r.values[i] == null ? "–" : format(r.values[i]!), color: s.color, shape: "rect" })) });
            };
            return (
              <g key={r.key} onMouseMove={show}>
                <rect x={m.l} y={y0} width={iw} height={band.bandwidth} fill="transparent" />
                {series.map((s, i) => {
                  const v = r.values[i];
                  if (v == null) return null;
                  const y = y0 + i * sub + 1;
                  return (
                    <g key={s.label}>
                      <path d={barPath(m.l, y, Math.max(0, x(v) - m.l), sub - 2, "right")} style={{ fill: s.color }} />
                      <text x={x(v) + 5} y={y + (sub - 2) / 2} dy="0.32em" style={{ fill: VIZ.muted, fontSize: 11 }}>
                        {format(v)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
          <line x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} style={{ stroke: VIZ.axis }} />
          <YAxis ticks={rows.map((r) => ({ px: band(r.key) + band.bandwidth / 2, label: r.label }))} x={m.l - 8} />
          <XAxis ticks={ticks} y={H - m.b} x1={m.l} x2={m.l + iw} line={false} />
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  );
}
