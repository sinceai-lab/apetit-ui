// Categorical bar chart (horizontal or vertical), supports negative values around a zero line.
import { useState, type MouseEvent } from "react";
import { barPath, extent, linearScale, bandScale, textWidth } from "./scales";
import { useMeasure } from "./useMeasure";
import { Gridlines, XAxis, YAxis } from "./Axis";
import { ChartTooltip, type TooltipData } from "./Tooltip";
import { VIZ } from "./colors";

export interface BarDatum {
  key: string;
  label: string;
  value: number | null;
  color?: string;
  /** Extra tooltip lines. */
  detail?: { label: string; value: string }[];
}

export interface BarChartProps {
  data: BarDatum[];
  orientation?: "horizontal" | "vertical";
  /** Total height for vertical charts; horizontal height = rows × rowHeight. */
  height?: number;
  rowHeight?: number;
  format?: (v: number) => string;
  color?: string;
  domain?: [number, number];
  showValues?: boolean;
  onSelect?: (d: BarDatum) => void;
  ariaLabel: string;
}

export function BarChart({ data, orientation = "horizontal", height = 220, rowHeight = 28, format = (v) => v.toFixed(1), color = VIZ.estimate, domain, showValues = true, onSelect, ariaLabel }: BarChartProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipData | null>(null);
  const [lo, hi] = domain ?? extent(data.map((d) => d.value));
  const d0 = Math.min(0, lo);
  const d1 = Math.max(0, hi);
  const horiz = orientation === "horizontal";
  const labelW = horiz ? Math.min(160, Math.max(40, ...data.map((d) => textWidth(d.label, 12) + 8))) : 0;
  const valW = showValues && horiz ? 56 : 0;
  const m = horiz ? { t: 4, r: valW, b: 22, l: labelW } : { t: 16, r: 8, b: 28, l: 40 };
  const H = horiz ? data.length * rowHeight + m.t + m.b : height;
  const iw = Math.max(0, width - m.l - m.r);
  const ih = Math.max(0, H - m.t - m.b);
  const v = linearScale([d0, d1], horiz ? [m.l, m.l + iw] : [m.t + ih, m.t], { nice: true });
  const band = bandScale(data.map((d) => d.key), horiz ? [m.t, m.t + ih] : [m.l, m.l + iw], { paddingInner: 0.3 });
  const zero = v(0);
  const ticks = v.ticks(horiz ? Math.max(2, Math.floor(iw / 80)) : 4).map((t) => ({ px: v(t), label: format(t) }));

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          <Gridlines at={ticks.map((t) => t.px)} orientation={horiz ? "v" : "h"} from={horiz ? m.t : m.l} to={horiz ? m.t + ih : m.l + iw} />
          {data.map((d) => {
            if (d.value == null || !Number.isFinite(d.value)) return null;
            const p = v(d.value);
            const b = band(d.key);
            const neg = d.value < 0;
            const path = horiz
              ? barPath(Math.min(zero, p), b, Math.abs(p - zero), band.bandwidth, neg ? "left" : "right")
              : barPath(b, Math.min(zero, p), band.bandwidth, Math.abs(p - zero), neg ? "bottom" : "top");
            const show = (e: MouseEvent) => {
              const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
              setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title: d.label, rows: [{ label: "", value: format(d.value!), color: d.color ?? color, shape: "rect" }, ...(d.detail ?? []).map((x) => ({ ...x }))] });
            };
            return (
              <g key={d.key} onMouseMove={show} onClick={onSelect ? () => onSelect(d) : undefined} style={{ cursor: onSelect ? "pointer" : undefined }}>
                <rect x={horiz ? m.l : b} y={horiz ? b : m.t} width={horiz ? iw : band.bandwidth} height={horiz ? band.bandwidth : ih} fill="transparent" />
                <path d={path} style={{ fill: d.color ?? color }} />
                {showValues && horiz && (
                  <text x={m.l + iw + 6} y={b + band.bandwidth / 2} dy="0.32em" style={{ fill: VIZ.ink, fontSize: 12 }}>
                    {format(d.value)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={horiz ? zero : m.l} x2={horiz ? zero : m.l + iw} y1={horiz ? m.t : zero} y2={horiz ? m.t + ih : zero} style={{ stroke: VIZ.axis }} />
          {horiz ? (
            <>
              <YAxis ticks={data.map((d) => ({ px: band(d.key) + band.bandwidth / 2, label: d.label }))} x={m.l - 8} />
              <XAxis ticks={ticks} y={m.t + ih} x1={m.l} x2={m.l + iw} line={false} />
            </>
          ) : (
            <>
              <YAxis ticks={ticks} x={m.l - 6} />
              <XAxis ticks={data.map((d) => ({ px: band(d.key) + band.bandwidth / 2, label: d.label }))} y={m.t + ih} x1={m.l} x2={m.l + iw} line={false} />
            </>
          )}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  );
}
