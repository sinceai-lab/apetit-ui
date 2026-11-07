// Pure aggregation over predictions; used by the server (summary, overview) and by pages.
import type { CropSummary, FarmSummary, Prediction, Region, RegionFilter } from "./types";
import { deltaPct } from "./normalize";

/** Below this Δ% a parcel counts as "below baseline" (contract §5.3). */
export const BELOW_BASELINE_PCT = -5;

export function weightedMean(rows: { v: number | null; w: number }[]): number | null {
  let s = 0;
  let ws = 0;
  for (const { v, w } of rows) {
    if (v == null || !Number.isFinite(v) || !(w > 0)) continue;
    s += v * w;
    ws += w;
  }
  return ws > 0 ? s / ws : null;
}

/** Most frequent value (ties -> the larger value); 0 for empty input. */
export function mode(values: number[]): number {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  let best = 0;
  let bc = -1;
  for (const [v, c] of m) if (c > bc || (c === bc && v > best)) [best, bc] = [v, c];
  return best;
}

export interface PredictionFilter {
  crop?: string | null;
  region?: RegionFilter | null;
  farm?: string | null;
  cell?: string | null;
}

export function filterPredictions(rows: Prediction[], f: PredictionFilter): Prediction[] {
  return rows.filter(
    (p) =>
      (!f.crop || p.crop === f.crop) &&
      (!f.region || f.region === "both" || p.region === f.region) &&
      (!f.farm || p.farmId === f.farm) &&
      (!f.cell || p.cellId === f.cell),
  );
}

export function latestAsOf(rows: Prediction[]): string | null {
  let best: string | null = null;
  for (const p of rows) if (p.asOfDate && (!best || p.asOfDate > best)) best = p.asOfDate;
  return best;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    let arr = m.get(k);
    if (!arr) m.set(k, (arr = []));
    arr.push(r);
  }
  return m;
}

/** One summary per region × crop. Regions are never pooled. Sorted by region, then area desc. */
export function cropSummaries(rows: Prediction[]): CropSummary[] {
  const out: CropSummary[] = [];
  for (const [, g] of groupBy(rows, (p) => `${p.region}|${p.crop}`)) {
    const first = g[0]!;
    const areaHa = g.reduce((s, p) => s + p.areaHa, 0);
    const withBase = g.filter((p) => p.baselineTHa != null);
    const estTHa = weightedMean(g.map((p) => ({ v: p.yieldTHa, w: p.areaHa }))) ?? 0;
    const baseTHa = weightedMean(withBase.map((p) => ({ v: p.baselineTHa, w: p.areaHa })));
    const estTonnes = g.reduce((s, p) => s + (Number.isFinite(p.yieldTHa) ? p.yieldTHa * p.areaHa : 0), 0);
    const baseTonnes = withBase.length ? withBase.reduce((s, p) => s + p.baselineTHa! * p.areaHa, 0) : null;
    const belowArea = g.reduce((s, p) => s + (p.deltaPct != null && p.deltaPct < BELOW_BASELINE_PCT ? p.areaHa : 0), 0);
    const versions = groupBy(g, (p) => p.modelVersion);
    const modelVersion = [...versions.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "";
    // Δ compares like with like: estimate vs baseline over the rows that have a baseline.
    const estOnBase = weightedMean(withBase.map((p) => ({ v: p.yieldTHa, w: p.areaHa })));
    out.push({
      region: first.region,
      crop: first.crop,
      parcels: g.length,
      farms: new Set(g.map((p) => p.farmId)).size,
      areaHa,
      estTHa,
      baseTHa,
      deltaPct: deltaPct(estOnBase, baseTHa),
      estTonnes,
      baseTonnes,
      belowBaselineShare: areaHa > 0 ? belowArea / areaHa : 0,
      completeness: {
        observedDays: mode(g.map((p) => p.observedDays)),
        totalDays: mode(g.map((p) => p.totalDays)),
        filledFutureDays: mode(g.map((p) => p.filledFutureDays)),
      },
      outOfRangeShare: g.filter((p) => p.outOfTrainingRange.length > 0).length / g.length,
      modelVersion,
      asOfDate: latestAsOf(g) ?? "",
    });
  }
  return out.sort((a, b) => a.region.localeCompare(b.region) || b.areaHa - a.areaHa);
}

/** One row per farm: area-weighted est/base/Δ over its predicted parcels. */
export function farmSummaries(rows: Prediction[]): FarmSummary[] {
  const out: FarmSummary[] = [];
  for (const [farmId, g] of groupBy(rows, (p) => p.farmId)) {
    const withBase = g.filter((p) => p.baselineTHa != null);
    const baseTHa = weightedMean(withBase.map((p) => ({ v: p.baselineTHa, w: p.areaHa })));
    const estOnBase = weightedMean(withBase.map((p) => ({ v: p.yieldTHa, w: p.areaHa })));
    out.push({
      farmId,
      region: g[0]!.region,
      parcels: g.length,
      areaHa: g.reduce((s, p) => s + p.areaHa, 0),
      estTHa: weightedMean(g.map((p) => ({ v: p.yieldTHa, w: p.areaHa }))) ?? 0,
      baseTHa,
      deltaPct: deltaPct(estOnBase, baseTHa),
      crops: [...new Set(g.map((p) => p.crop))],
    });
  }
  return out.sort((a, b) => a.farmId.localeCompare(b.farmId));
}

/** Farms furthest below baseline (most negative Δ first). */
export function needsAttention(rows: Prediction[], n = 5): FarmSummary[] {
  return farmSummaries(rows)
    .filter((f) => f.deltaPct != null && f.deltaPct < 0)
    .sort((a, b) => a.deltaPct! - b.deltaPct!)
    .slice(0, n);
}

export const regionOf = (r: Region) => (r === "FI_SW" ? "Finland" : "Sweden");
