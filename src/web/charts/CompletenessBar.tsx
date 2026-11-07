// Season completeness: observed days, gap-filled days, days filled ahead (hatched) out of the total.
import { cn } from "../lib/cn";
import { fmtNum } from "../lib/format";

export interface CompletenessProps {
  observed: number;
  filledGap?: number;
  filledAhead?: number;
  total: number;
  showLegend?: boolean;
  className?: string;
}

export function CompletenessBar({ observed, filledGap = 0, filledAhead = 0, total, showLegend = true, className }: CompletenessProps) {
  const t = Math.max(total, observed + filledGap + filledAhead, 1);
  const pct = (v: number) => `${(Math.max(0, v) / t) * 100}%`;
  const label = `${fmtNum(observed)} of ${fmtNum(total)} days observed${filledGap ? `, ${fmtNum(filledGap)} gap-filled` : ""}${filledAhead ? `, ${fmtNum(filledAhead)} filled ahead` : ""}`;
  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={label}>
        <div style={{ width: pct(observed), background: "var(--viz-observed)" }} />
        <div style={{ width: pct(filledGap), background: "var(--viz-filled-gap)" }} />
        <div className="hatch" style={{ width: pct(filledAhead) }} />
      </div>
      {showLegend && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="tnum">
            <b className="font-semibold text-ink">{fmtNum(observed)}</b> of {fmtNum(total)} days observed
          </span>
          {filledGap > 0 && <span className="tnum">{fmtNum(filledGap)} gap-filled</span>}
          {filledAhead > 0 && <span className="tnum">{fmtNum(filledAhead)} filled ahead</span>}
        </div>
      )}
    </div>
  );
}
