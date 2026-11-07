// Part-to-whole donut: one slice per item in the given (fixed) order, 2px surface gaps between slices,
// a centre total and a per-slice hover tooltip. Identity is never colour alone: pair it with a legend that names
// every slice and its figures (see LandUse on the farm page), and wrap it in a TableToggle.
import { useState, type ReactNode } from "react";
import { ChartTooltip, type TooltipData } from "./Tooltip";
import { VIZ } from "./colors";

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  color: string;
}

const TAU = Math.PI * 2;
const pt = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;

/** Ring segment from angle a0 to a1 (radians, clockwise from 12 o'clock). */
function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(cx, cy, r1, a0);
  const [x1, y1] = pt(cx, cy, r1, a1);
  const [x2, y2] = pt(cx, cy, r0, a1);
  const [x3, y3] = pt(cx, cy, r0, a0);
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

export function DonutChart({
  data,
  size = 200,
  ariaLabel,
  center,
  tooltip,
  active,
  onActive,
}: {
  data: DonutDatum[];
  size?: number;
  ariaLabel: string;
  /** Text in the hole, e.g. the total. */
  center?: ReactNode;
  /** Tooltip rows for a slice; defaults to the value. */
  tooltip?: (d: DonutDatum, share: number) => Omit<TooltipData, "x" | "y">;
  /** Key of the slice to emphasise (e.g. the hovered legend row). */
  active?: string | null;
  onActive?: (key: string | null) => void;
}) {
  const [tip, setTip] = useState<TooltipData | null>(null);
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  const c = size / 2;
  const r1 = c - 4; // room for the hovered slice to grow
  const r0 = r1 * 0.62;

  let a = 0;
  const slices = items.map((d) => {
    const share = total ? d.value / total : 0;
    const s = { d, share, a0: a, a1: a + share * TAU };
    a = s.a1;
    return s;
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} onMouseLeave={() => { setTip(null); onActive?.(null); }}>
      <svg width={size} height={size} role="img" aria-label={ariaLabel}>
        {slices.length === 1 ? (
          <circle cx={c} cy={c} r={(r0 + r1) / 2} fill="none" strokeWidth={r1 - r0} style={{ stroke: slices[0]!.d.color }} />
        ) : (
          slices.map(({ d, share, a0, a1 }) => {
            const on = active === d.key;
            const dim = active != null && !on;
            return (
              <path
                key={d.key}
                d={arcPath(c, c, r0, on ? r1 + 3 : r1, a0, a1)}
                style={{ fill: d.color, stroke: VIZ.surface, opacity: dim ? 0.45 : 1, transition: "opacity 120ms" }}
                strokeWidth={2}
                strokeLinejoin="round"
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  const t = tooltip ? tooltip(d, share) : { rows: [{ label: d.label, value: String(d.value), color: d.color, shape: "rect" as const }] };
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, ...t });
                  onActive?.(d.key);
                }}
              />
            );
          })
        )}
      </svg>
      {center != null && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div>}
      <ChartTooltip tip={tip} width={size} />
    </div>
  );
}
