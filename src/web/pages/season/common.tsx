// Page-local helpers shared by Overview, Season, Map and Farm (agent A pages only).
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Info, Minus } from "lucide-react";
import { REGIONS, type Prediction, type Region, type RegionFilter } from "@/shared/types";
import { cn } from "../../lib/cn";
import { fmtDate, fmtDateTime, fmtDelta, fmtNum } from "../../lib/format";
import { useIsDark } from "../../lib/prefs";

/** Within ±2 % counts as "about usual". */
export const NEUTRAL_BAND = 2;

export const regionsFor = (r: RegionFilter): Region[] => (r === "both" ? REGIONS : [r]);
export const regionFlag = (r: Region) => (r === "FI_SW" ? "Finland · South-West" : "Sweden · Skåne");

/** Text colours on the earthy diverging scale, darkened for text contrast. */
export function deltaTextColor(v: number | null | undefined, dark: boolean): string {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < NEUTRAL_BAND) return "var(--muted)";
  if (v < 0) return dark ? "#E0B86A" : "#8A4F12";
  return dark ? "#80CDC1" : "#01665E";
}

/** Signed Δ % with an arrow shape, so direction never relies on colour alone. */
export function Delta({ value, className, suffix, size = "sm" }: { value: number | null | undefined; className?: string; suffix?: ReactNode; size?: "sm" | "lg" | "xl" }) {
  const dark = useIsDark();
  const ok = value != null && Number.isFinite(value);
  const Icon = !ok || Math.abs(value) < NEUTRAL_BAND ? Minus : value < 0 ? ArrowDown : ArrowUp;
  const word = !ok ? "no usual yield to compare" : Math.abs(value) < NEUTRAL_BAND ? "about usual" : value < 0 ? "below usual" : "above usual";
  return (
    <span className={cn("tnum inline-flex items-center gap-0.5 whitespace-nowrap font-semibold", size === "xl" ? "text-2xl sm:text-[28px]" : size === "lg" ? "text-base" : "text-sm", className)} style={{ color: deltaTextColor(value, dark) }} title={`${fmtDelta(value)} vs usual yield (${word})`}>
      <Icon className={size === "xl" ? "size-6" : size === "lg" ? "size-4" : "size-3.5"} aria-hidden strokeWidth={2.5} />
      {fmtDelta(value)}
      <span className="sr-only"> {word}</span>
      {suffix}
    </span>
  );
}

export const shortModel = (v: string | null | undefined) => (v ? v.slice(0, 8) : "–");

/** Hover text for a prediction-derived number (contract §7.3). */
export function predictionSource(rows: Pick<Prediction, "computedAt" | "modelVersion" | "asOfDate">[]): string {
  const latest = rows.reduce<string | null>((m, r) => (!m || r.computedAt > m ? r.computedAt : m), null);
  const asOf = rows.reduce<string | null>((m, r) => (!m || r.asOfDate > m ? r.asOfDate : m), null);
  const model = rows[0]?.modelVersion;
  return `YieldPrediction · data as of ${fmtDate(asOf)} · computed ${fmtDateTime(latest)} (clock time) · model ${shortModel(model)}`;
}

export const isEarlySeason = (asOf: string | null | undefined) => !!asOf && asOf.slice(5, 10) < "06-15";

/** "Live estimate · data as of 27 Oct 2027 · 241 of 241 days of weather". */
export function LiveNote({ asOfDate, observed, total, filledAhead, className }: { asOfDate: string | null | undefined; observed?: number; total?: number; filledAhead?: number; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 text-xs text-muted", className)}>
      <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-2 py-0.5 font-medium text-brand-strong">
        <span aria-hidden className="size-1.5 rounded-full bg-brand-vivid" />
        Live estimate
      </span>
      <span>data as of {fmtDate(asOfDate)}</span>
      {total != null && total > 0 && (
        <span className="tnum">
          · {fmtNum(observed)} of {fmtNum(total)} days of weather observed
          {filledAhead ? `, ${fmtNum(filledAhead)} filled ahead with normals` : ""}
        </span>
      )}
    </span>
  );
}

export function EarlySeasonNote({ asOfDate }: { asOfDate: string | null | undefined }) {
  if (!isEarlySeason(asOfDate)) return null;
  return (
    <Callout>
      <b className="font-semibold">Early season:</b> the estimate is not yet better than the farm average. It firms up as more of the summer's weather comes in.
    </Callout>
  );
}

export function Callout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg bg-rapeseed-soft px-3 py-2 text-[13px] text-ink", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-degraded" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function CropDot({ crop, className }: { crop: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: crop in CROP_SET ? `var(--viz-${crop})` : "var(--viz-other)" }} />;
}
const CROP_SET: Record<string, true> = { pea: true, turnip_rape: true, potato: true, carrot: true, spinach: true };

/** Modal value of a numeric field (season completeness is shared across a crop). */
export function modeOf(values: number[]): number {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  let best = 0;
  let bc = -1;
  for (const [v, c] of m) if (c > bc || (c === bc && v > best)) [best, bc] = [v, c];
  return best;
}

/** Area-weighted Δ of estimate vs usual, over rows that have a usual yield. */
export function weightedDelta(rows: Prediction[]): number | null {
  let e = 0;
  let b = 0;
  for (const p of rows) {
    if (p.baselineTHa == null || !Number.isFinite(p.yieldTHa)) continue;
    e += p.yieldTHa * p.areaHa;
    b += p.baselineTHa * p.areaHa;
  }
  return b > 0 ? ((e - b) / b) * 100 : null;
}
