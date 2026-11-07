// Pure response shaping for broker / inference payloads (tested against docs/samples).
import type {
  ClimateAttr,
  ClimatePoint,
  Counts,
  HistoryPoint,
  LiveHealth,
  LoadLogRow,
  ObservationSeason,
  Pipeline,
  Prediction,
  SeasonInfo,
  SubscriptionRow,
  WeatherDay,
} from "../shared/types";
import { toNum, unwrap } from "../shared/normalize";

type Raw = Record<string, any>;

/** Remove keys anywhere in a JSON value (e.g. storedPath, local paths). */
export function stripKeys<T>(v: T, keys: Set<string>): T {
  if (Array.isArray(v)) return v.map((x) => stripKeys(x, keys)) as T;
  if (v && typeof v === "object") {
    const o: Raw = {};
    for (const [k, x] of Object.entries(v)) if (!keys.has(k)) o[k] = stripKeys(x, keys);
    return o as T;
  }
  return v;
}

export function shapeWeather(rows: Raw[], from?: string | null, to?: string | null): { scenario: string; days: WeatherDay[] } {
  const days = rows
    .map((r) => ({
      date: String(unwrap(r.dateObserved) ?? ""),
      tMean: toNum(r.temperature),
      tMax: toNum(r.temperatureMax),
      tMin: toNum(r.temperatureMin),
      precip: toNum(r.precipitation),
      et0: toNum(r.referenceEvapotranspiration),
    }))
    .filter((d) => d.date && (!from || d.date >= from) && (!to || d.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date));
  const scenario = String(rows.find((r) => r.climateScenario)?.climateScenario ?? "ssp245");
  return { scenario, days };
}

/** temporalValues -> per attr monthly points; value is {historical} before 2027 and {ssp*} after. */
export function shapeClimate(t: Raw, attrs: readonly ClimateAttr[]): Partial<Record<ClimateAttr, ClimatePoint[]>> {
  const out: Partial<Record<ClimateAttr, ClimatePoint[]>> = {};
  for (const a of attrs) {
    const values: unknown[] = Array.isArray(t?.[a]?.values) ? t[a].values : [];
    const pts: ClimatePoint[] = [];
    for (const pair of values) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const [val, ts] = pair as [unknown, string];
      const p: ClimatePoint = { month: String(ts).slice(0, 7) };
      if (val && typeof val === "object") {
        for (const k of ["historical", "ssp126", "ssp245", "ssp585"] as const) {
          const n = toNum((val as Raw)[k]);
          if (n != null) p[k] = n;
        }
      } else {
        const n = toNum(val);
        if (n != null) p.value = n;
      }
      pts.push(p);
    }
    out[a] = pts.sort((x, y) => x.month.localeCompare(y.month));
  }
  return out;
}

export function shapeLoadLog(e: Raw): LoadLogRow {
  return {
    id: String(e.id),
    schema: String(e.schema ?? ""),
    file: String(e.originalName ?? ""),
    sha256: String(e.sha256 ?? ""),
    loadedBy: String(e.loadedBy ?? ""),
    loadedAt: String(unwrap(e.loadedAt) ?? ""),
    rowsRead: toNum(e.rowsRead) ?? 0,
    rowsLoaded: toNum(e.rowsLoaded) ?? 0,
    rowsDropped: toNum(e.rowsDropped) ?? 0,
    rowsRejected: toNum(e.rowsRejected) ?? 0,
    status: String(e.loadStatus ?? ""),
  };
}

export const shapeLoadLogs = (rows: Raw[]) => rows.map(shapeLoadLog).sort((a, b) => b.loadedAt.localeCompare(a.loadedAt));

export function shapeSubscription(s: Raw): SubscriptionRow {
  const n = s.notification ?? {};
  return {
    id: String(s.id),
    description: s.description ?? null,
    entityTypes: Array.isArray(s.entities) ? s.entities.map((e: Raw) => String(e.type)) : [],
    endpoint: n.endpoint?.uri ?? null,
    status: String(s.status ?? ""),
    notificationStatus: n.status ?? null,
    timesSent: toNum(n.timesSent) ?? 0,
    lastNotification: n.lastNotification ?? null,
    lastSuccess: n.lastSuccess ?? null,
  };
}

/** Inference /health without local paths and URLs; same shape as backend /api/live/health. */
export function sanitizeHealth(h: Raw): LiveHealth {
  const wb = h.writeback ?? {};
  const models = h.models ? { version: h.models.version, crops: h.models.crops, load_error: h.models.load_error ?? null } : undefined;
  const store = h.store ? { observations: h.store.observations, predictions: h.store.predictions, rejected: h.store.rejected } : undefined;
  return {
    status: String(h.status ?? "unknown"),
    started_at: h.started_at,
    models,
    store,
    counters: h.counters,
    last_notification: h.last_notification ? stripKeys(h.last_notification, new Set(["context", "url", "path"])) : null,
    writeback: {
      enabled: !!wb.enabled,
      pending: toNum(wb.pending) ?? 0,
      has_error: wb.has_error ?? !!wb.last_error,
      written: toNum(wb.written),
    },
  };
}

export function historyPoints(rows: Raw[]): HistoryPoint[] {
  return rows
    .map((r) => ({
      asOfDate: String(unwrap(r.as_of_date) ?? ""),
      yieldTHa: toNum(r.yield_t_ha) ?? NaN,
      baselineTHa: toNum(r.baseline_t_ha),
      observedDays: toNum(r.observed_days) ?? 0,
      filledFutureDays: toNum(r.filled_future_days) ?? 0,
    }))
    .filter((p) => p.asOfDate && Number.isFinite(p.yieldTHa))
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}

export function seasonInfo(preds: Prediction[], seasons: ObservationSeason[] | null, cellsTotal: number): SeasonInfo {
  let asOf: string | null = null;
  let year: number | null = null;
  for (const p of preds) {
    if (p.asOfDate && (!asOf || p.asOfDate > asOf)) asOf = p.asOfDate;
    if (Number.isFinite(p.year) && (year == null || p.year > year)) year = p.year;
  }
  let lastWeather: string | null = null;
  let reporting = 0;
  for (const s of seasons ?? []) {
    if (year == null || s.year === year) {
      if (s.stored_days > 0) reporting++;
      if (s.last_date && (!lastWeather || s.last_date > lastWeather)) lastWeather = s.last_date;
    }
    if (year == null && Number.isFinite(s.year)) year = s.year;
  }
  return { year, asOfDate: asOf, lastWeatherDate: lastWeather, cellsReporting: reporting, cellsTotal };
}

export interface PipelineInputs {
  loadLogs: LoadLogRow[] | null;
  typeCounts: { type: string; count: number | null }[] | null;
  subscriptions: SubscriptionRow[] | null;
  health: LiveHealth | null;
}

export function buildPipeline(i: PipelineInputs): Pipeline {
  const count = (t: string) => i.typeCounts?.find((c) => c.type === t)?.count ?? 0;
  const subs = i.subscriptions ?? [];
  const lastSub = subs.map((s) => s.lastNotification).filter(Boolean).sort().pop() ?? null;
  const h = i.health;
  return {
    csv: {
      loadLogs: i.loadLogs?.length ?? 0,
      lastLoadAt: i.loadLogs?.map((l) => l.loadedAt).sort().pop() ?? null,
      rowsRejected: i.loadLogs?.reduce((s, l) => s + l.rowsRejected, 0) ?? 0,
    },
    broker: { up: i.typeCounts != null, entities: i.typeCounts?.reduce((s, c) => s + (c.count ?? 0), 0) ?? 0, weatherObserved: count("WeatherObserved") },
    stream: { subscriptions: subs.length, lastNotification: lastSub, allOk: subs.length > 0 && subs.every((s) => s.status === "active" && s.notificationStatus === "ok") },
    inference: {
      up: h != null && h.status === "ok",
      notifications: h?.counters?.notifications ?? 0,
      readingsNew: h?.counters?.readings_new ?? 0,
      lastNotificationAt: h?.last_notification?.received_at ?? h?.last_notification?.notified_at ?? null,
      modelVersion: h?.models?.version ?? null,
    },
    writeback: {
      enabled: h?.writeback?.enabled ?? false,
      written: h?.writeback?.written ?? null,
      pending: h?.writeback?.pending ?? 0,
      hasError: h?.writeback?.has_error ?? false,
      yieldPredictions: count("YieldPrediction"),
    },
    ui: { up: true },
  };
}

export function countsFrom(typeCounts: { type: string; count: number | null }[] | null): Counts {
  const c = (t: string) => typeCounts?.find((x) => x.type === t)?.count ?? 0;
  return { farms: c("Farm"), parcels: c("Parcel"), cells: c("ClimateGridCell"), weatherObserved: c("WeatherObserved"), yieldPredictions: c("YieldPrediction"), loadLogs: c("LoadLog") };
}
