// Estimate vs baseline bullet: estimate bar coloured by Δ, baseline as a tick, both on a shared t/ha scale.
import { useIsDark } from "../lib/prefs";
import { fmtDelta, fmtTHa } from "../lib/format";
import { deltaColor, VIZ } from "./colors";
import { useMeasure } from "./useMeasure";

export interface BulletBarProps {
  estimate: number | null;
  baseline: number | null;
  /** Shared max so several bullets are comparable. */
  max: number;
  label?: string;
  height?: number;
}

export function BulletBar({ estimate, baseline, max, label, height = 14 }: BulletBarProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const dark = useIsDark();
  const d = estimate != null && baseline ? ((estimate - baseline) / baseline) * 100 : null;
  const x = (v: number) => (Math.max(0, Math.min(v, max)) / (max || 1)) * width;
  const aria = `${label ? label + ": " : ""}estimate ${fmtTHa(estimate)}, usual ${fmtTHa(baseline)}${d != null ? ` (${fmtDelta(d)})` : ""}`;
  return (
    <div ref={ref} className="w-full" title={aria}>
      {width > 0 && (
        <svg width={width} height={height + 6} role="img" aria-label={aria}>
          <rect x={0} y={3} width={width} height={height} rx={3} style={{ fill: "var(--surface-2)" }} />
          {/* Solid Δ-coloured bar; the faint outline keeps near-usual (pale neutral) bars visible on the track. */}
          {estimate != null && (
            <rect
              x={0.5}
              y={3.5}
              width={Math.max(0, x(estimate) - 1)}
              height={height - 1}
              rx={2.5}
              style={{ fill: d != null ? deltaColor(d, dark) : VIZ.estimate, stroke: VIZ.baseline, strokeOpacity: 0.45 }}
              strokeWidth={1}
            />
          )}
          {baseline != null && <line x1={x(baseline)} x2={x(baseline)} y1={0} y2={height + 6} style={{ stroke: VIZ.ink }} strokeWidth={2} />}
        </svg>
      )}
    </div>
  );
}

/** Horizontal legend for the diverging Δ% scale (brown below, teal above). */
export function DeltaLegend({ className }: { className?: string }) {
  const dark = useIsDark();
  const stops = [-25, -12.5, 0, 12.5, 25];
  return (
    <div className={className}>
      <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${stops.map((s) => deltaColor(s, dark)).join(",")})` }} />
      <div className="mt-0.5 flex w-40 justify-between text-[11px] text-muted tnum">
        <span>−25 %</span>
        <span>usual</span>
        <span>+25 %</span>
      </div>
    </div>
  );
}
