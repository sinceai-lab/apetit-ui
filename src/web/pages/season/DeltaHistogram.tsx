// Distribution of parcel Δ % vs usual yield, 5-point bins, coloured on the diverging scale.
import { useMemo, useState } from "react";
import type { Prediction } from "@/shared/types";
import { ChartTooltip, deltaColor, linearScale, useMeasure, VIZ, type TooltipData } from "../../charts";
import { fmtHa, fmtNum } from "../../lib/format";
import { useIsDark } from "../../lib/prefs";

const STEP = 5;
const LIMIT = 40;

export interface Bin {
  key: string;
  label: string;
  lo: number;
  hi: number;
  mid: number;
  count: number;
  areaHa: number;
}

export function binDeltas(rows: Prediction[]): Bin[] {
  const bins: Bin[] = [];
  bins.push({ key: "lo", label: `below −${LIMIT} %`, lo: -Infinity, hi: -LIMIT, mid: -LIMIT - STEP / 2, count: 0, areaHa: 0 });
  for (let a = -LIMIT; a < LIMIT; a += STEP) {
    const s = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
    bins.push({ key: String(a), label: `${s(a)} to ${s(a + STEP)} %`, lo: a, hi: a + STEP, mid: a + STEP / 2, count: 0, areaHa: 0 });
  }
  bins.push({ key: "hi", label: `above +${LIMIT} %`, lo: LIMIT, hi: Infinity, mid: LIMIT + STEP / 2, count: 0, areaHa: 0 });
  for (const p of rows) {
    if (p.deltaPct == null || !Number.isFinite(p.deltaPct)) continue;
    const b = bins.find((x) => p.deltaPct! >= x.lo && p.deltaPct! < x.hi) ?? bins[bins.length - 1]!;
    b.count++;
    b.areaHa += p.areaHa;
  }
  return bins;
}

export function DeltaHistogram({ bins, height = 150, ariaLabel }: { bins: Bin[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const dark = useIsDark();
  const [tip, setTip] = useState<TooltipData | null>(null);
  const m = { t: 8, r: 6, b: 30, l: 30 };
  const iw = Math.max(0, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const y = useMemo(() => linearScale([0, max], [m.t + ih, m.t], { nice: true }), [max, ih]);
  const bw = iw / bins.length;
  const xOf = (i: number) => m.l + i * bw;
  const zeroI = bins.findIndex((b) => b.lo === 0);
  const ticks = y.ticks(3);
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} style={{ stroke: VIZ.grid }} />
              <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" style={{ fill: VIZ.muted, fontSize: 11 }}>
                {fmtNum(t)}
              </text>
            </g>
          ))}
          {bins.map((b, i) => {
            const h = m.t + ih - y(b.count);
            return (
              <g
                key={b.key}
                onMouseMove={(e) => {
                  const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title: b.label, rows: [{ label: "Parcels", value: fmtNum(b.count), color: deltaColor(b.mid, dark), shape: "rect" }, { label: "Area", value: fmtHa(b.areaHa) }] });
                }}
              >
                <rect x={xOf(i)} y={m.t} width={bw} height={ih} fill="transparent" />
                {b.count > 0 && <rect x={xOf(i) + 1} y={y(b.count)} width={Math.max(1, bw - 2)} height={h} rx={2} style={{ fill: deltaColor(b.mid, dark), stroke: dark ? "none" : "rgb(0 0 0 / 0.08)" }} />}
              </g>
            );
          })}
          {zeroI >= 0 && (
            <>
              <line x1={xOf(zeroI)} x2={xOf(zeroI)} y1={m.t - 4} y2={m.t + ih + 4} style={{ stroke: VIZ.ink }} strokeWidth={1.5} strokeDasharray="3 2" />
              <text x={xOf(zeroI)} y={height - 4} textAnchor="middle" style={{ fill: VIZ.ink, fontSize: 11, fontWeight: 600 }}>
                usual
              </text>
            </>
          )}
          <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} style={{ stroke: VIZ.axis }} />
          {[-LIMIT, -20, 20, LIMIT].map((v) => {
            const i = bins.findIndex((b) => b.lo === v);
            return (
              <text key={v} x={xOf(i)} y={m.t + ih + 14} textAnchor="middle" style={{ fill: VIZ.muted, fontSize: 11 }}>
                {v > 0 ? `+${v}` : `−${-v}`} %
              </text>
            );
          })}
          <text x={m.l} y={height - 4} style={{ fill: VIZ.muted, fontSize: 11 }}>
            ◀ below
          </text>
          <text x={m.l + iw} y={height - 4} textAnchor="end" style={{ fill: VIZ.muted, fontSize: 11 }}>
            above ▶
          </text>
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  );
}
