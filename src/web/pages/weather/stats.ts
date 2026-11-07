// Pure weather summaries: season totals, monthly roll-up, cumulative water balance, annual climate.
import type { ClimateAttr, ClimatePoint, WeatherDay } from "@/shared/types";

const num = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (num(v) ? v : 0), 0);
const mean = (xs: (number | null)[]) => {
  const v = xs.filter(num);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export interface SeasonStats {
  days: number;
  from: string | null;
  to: string | null;
  tMean: number | null;
  rain: number;
  et0: number;
  balance: number;
  rainDays: number;
  hotDays: number;
  frostDays: number;
  wettest: WeatherDay | null;
  warmest: WeatherDay | null;
}

export function seasonStats(days: WeatherDay[]): SeasonStats {
  const rain = sum(days.map((d) => d.precip));
  const et0 = sum(days.map((d) => d.et0));
  const by = (f: (d: WeatherDay) => number | null) => days.reduce<WeatherDay | null>((best, d) => (num(f(d)) && (!best || f(d)! > f(best)!) ? d : best), null);
  return {
    days: days.length,
    from: days[0]?.date ?? null,
    to: days[days.length - 1]?.date ?? null,
    tMean: mean(days.map((d) => d.tMean)),
    rain,
    et0,
    balance: rain - et0,
    rainDays: days.filter((d) => (d.precip ?? 0) >= 1).length,
    hotDays: days.filter((d) => (d.tMax ?? -99) >= 27).length,
    frostDays: days.filter((d) => (d.tMin ?? 99) < 0).length,
    wettest: by((d) => d.precip),
    warmest: by((d) => d.tMax),
  };
}

export interface MonthRow {
  month: string;
  days: number;
  tMean: number | null;
  tMax: number | null;
  tMin: number | null;
  rain: number;
  et0: number;
  balance: number;
}

export function monthly(days: WeatherDay[]): MonthRow[] {
  const m = new Map<string, WeatherDay[]>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    const arr = m.get(k);
    if (arr) arr.push(d);
    else m.set(k, [d]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ds]) => {
      const rain = sum(ds.map((d) => d.precip));
      const et0 = sum(ds.map((d) => d.et0));
      const hi = ds.map((d) => d.tMax).filter(num);
      const lo = ds.map((d) => d.tMin).filter(num);
      return { month, days: ds.length, tMean: mean(ds.map((d) => d.tMean)), tMax: hi.length ? Math.max(...hi) : null, tMin: lo.length ? Math.min(...lo) : null, rain, et0, balance: rain - et0 };
    });
}

export function cumulative(days: WeatherDay[]): { date: string; rain: number; et0: number }[] {
  let r = 0;
  let e = 0;
  return days.map((d) => {
    r += num(d.precip) ? d.precip : 0;
    e += num(d.et0) ? d.et0 : 0;
    return { date: d.date, rain: r, et0: e };
  });
}

export const SCENARIOS = ["historical", "ssp126", "ssp245", "ssp585"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface ClimateAttrInfo {
  label: string;
  short: string;
  unit: string;
  agg: "mean" | "sum" | "max";
  annualLabel: string;
}
export const CLIMATE_INFO: Record<ClimateAttr, ClimateAttrInfo> = {
  tmean_c: { label: "Mean temperature", short: "Temperature", unit: "°C", agg: "mean", annualLabel: "yearly mean" },
  precip_mm: { label: "Precipitation", short: "Rain", unit: "mm", agg: "sum", annualLabel: "yearly total" },
  pet_mm: { label: "Potential evapotranspiration", short: "Evaporation", unit: "mm", agg: "sum", annualLabel: "yearly total" },
  hot_days_tmax_ge_27: { label: "Hot days (max ≥ 27 °C)", short: "Hot days", unit: "days", agg: "sum", annualLabel: "days per year" },
  tmax_c_max: { label: "Hottest day of the year", short: "Hottest day", unit: "°C", agg: "max", annualLabel: "yearly maximum" },
};

export type AnnualRow = { year: number } & Partial<Record<Scenario, number>>;

/** Monthly points -> one value per year and scenario; only years with all 12 months count. */
export function annual(points: ClimatePoint[], agg: ClimateAttrInfo["agg"]): AnnualRow[] {
  const acc = new Map<number, Partial<Record<Scenario, number[]>>>();
  for (const p of points) {
    const y = Number(p.month.slice(0, 4));
    const row = acc.get(y) ?? {};
    for (const s of SCENARIOS) {
      const v = p[s];
      if (num(v)) (row[s] ??= []).push(v);
    }
    acc.set(y, row);
  }
  const out: AnnualRow[] = [];
  for (const [year, row] of [...acc.entries()].sort((a, b) => a[0] - b[0])) {
    const r: AnnualRow = { year };
    for (const s of SCENARIOS) {
      const v = row[s];
      if (!v || v.length < 12) continue;
      r[s] = agg === "sum" ? v.reduce((a, b) => a + b, 0) : agg === "max" ? Math.max(...v) : v.reduce((a, b) => a + b, 0) / v.length;
    }
    out.push(r);
  }
  return out;
}

/** Mean of a scenario over an inclusive year range. */
export function periodMean(rows: AnnualRow[], s: Scenario, from: number, to: number): number | null {
  return mean(rows.filter((r) => r.year >= from && r.year <= to).map((r) => r[s] ?? null));
}

/** Monthly climate value for one calendar month (e.g. June), averaged over a year range and scenario. */
export function monthNormal(points: ClimatePoint[], mm: string, s: Scenario, from: number, to: number): number | null {
  return mean(points.filter((p) => p.month.endsWith(`-${mm}`) && +p.month.slice(0, 4) >= from && +p.month.slice(0, 4) <= to).map((p) => p[s] ?? null));
}
