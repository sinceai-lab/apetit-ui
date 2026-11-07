import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** KPI tile: label, big tabular value with unit, optional delta/footnote. `source` becomes the hover title. */
export function Stat({ label, value, unit, delta, foot, source, className }: { label: ReactNode; value: ReactNode; unit?: ReactNode; delta?: ReactNode; foot?: ReactNode; source?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)} title={source}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tnum text-2xl font-semibold text-ink sm:text-[32px] sm:leading-none">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
        {delta && <span className="ml-1 text-sm">{delta}</span>}
      </div>
      {foot && <div className="mt-1 text-xs text-muted">{foot}</div>}
    </div>
  );
}
