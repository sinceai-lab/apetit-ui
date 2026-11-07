// Read-only Coraine broker access (GET only) with paging and the server-side cache.
import type { Cell, ClimateAttr, Farm, FootprintRow, Parcel, Region, SubscriptionRow, LoadLogRow } from "../shared/types";
import { normalizeCell, normalizeFarm, normalizeParcel } from "../shared/normalize";
import { ngsi } from "./config";
import { cache, TTL, type Cached } from "./cache";
import { upstreamGet, upstreamJson } from "./http";
import { shapeClimate, shapeLoadLogs, shapeSubscription, shapeWeather } from "./shape";

type Raw = Record<string, any>;
const PAGE = 5000;

const qs = (p: Record<string, string | number | undefined>) =>
  Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

export async function brokerJson<T = any>(path: string, params: Record<string, string | number | undefined> = {}, timeoutMs = 10_000): Promise<T> {
  const q = qs(params);
  return upstreamJson<T>("broker", ngsi(path) + (q ? `?${q}` : ""), { timeoutMs });
}

/** Fetch every entity of a type, paging with offset/limit (results are unsorted upstream). */
export async function listAll(type: string, params: Record<string, string | undefined> = {}, pageSize = PAGE): Promise<Raw[]> {
  const out: Raw[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await upstreamGet("broker", ngsi("/entities") + "?" + qs({ type, options: "keyValues", ...params, limit: pageSize, offset, count: "true" }), { timeoutMs: 20_000 });
    const page = (await res.json()) as Raw[];
    out.push(...page);
    const total = Number(res.headers.get("NGSILD-Results-Count") ?? NaN);
    if (page.length < pageSize || (Number.isFinite(total) && out.length >= total)) break;
  }
  return out;
}

export async function countType(type: string): Promise<number> {
  const res = await upstreamGet("broker", ngsi("/entities") + "?" + qs({ type, limit: 0, count: "true" }), { timeoutMs: 5000 });
  await res.body?.cancel();
  return Number(res.headers.get("NGSILD-Results-Count") ?? 0);
}

export function getFarms(): Promise<Cached<Farm[]>> {
  return cache.get("farms", TTL.master, async () => (await listAll("Farm", {}, 1000)).map(normalizeFarm).sort((a, b) => a.farmId.localeCompare(b.farmId)));
}

const PARCEL_ATTRS = "parcel_id,farm_id,crop,area_ha,soil_class_soilmap,drainage,catchment_id,location";
export function getParcels(): Promise<Cached<Parcel[]>> {
  return cache.get("parcels", TTL.master, async () => (await listAll("Parcel", { attrs: PARCEL_ATTRS })).map(normalizeParcel).sort((a, b) => a.parcelId.localeCompare(b.parcelId)));
}

export function getCells(): Promise<Cached<Cell[]>> {
  return cache.get("cells", TTL.master, async () =>
    (await listAll("ClimateGridCell", { attrs: "cell_id,region,elevation_m,continentality,location" })).map(normalizeCell).sort((a, b) => a.cellId.localeCompare(b.cellId)),
  );
}

/** cellId -> region; empty map when the broker is down (callers fall back to the farm id prefix). */
export async function cellRegions(): Promise<Map<string, Region>> {
  try {
    return new Map((await getCells()).value.map((c) => [c.cellId, c.region]));
  } catch {
    return new Map();
  }
}

export function getTypeCounts(): Promise<Cached<{ type: string; count: number | null }[]>> {
  return cache.get("counts", TTL.counts, async () => {
    const t = await brokerJson<{ typeList?: string[] }>("/types", {}, 5000);
    const types = t.typeList ?? [];
    const counts = await Promise.all(types.map((ty) => countType(ty).catch(() => null)));
    return types.map((type, i) => ({ type, count: counts[i] ?? null }));
  });
}

export function getLoadLogs(): Promise<Cached<LoadLogRow[]>> {
  return cache.get("loadlogs", TTL.loadLogs, async () => shapeLoadLogs(await listAll("LoadLog", {}, 1000)));
}

export function getSubscriptions(): Promise<Cached<SubscriptionRow[]>> {
  return cache.get("subscriptions", TTL.subscriptions, async () => {
    const subs = await brokerJson<Raw[]>("/subscriptions", { limit: 100 }, 5000);
    return (Array.isArray(subs) ? subs : []).map(shapeSubscription);
  });
}

export function getWeather(cellId: string, from?: string | null, to?: string | null) {
  return cache
    .get(`weather:${cellId}`, TTL.weather, async () => (await listAll("WeatherObserved", { q: `cellId=="${cellId}"` }, 1000)))
    .then((c) => ({ ...c, value: shapeWeather(c.value, from, to) }));
}

const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

export function getClimate(cellId: string, attrs: ClimateAttr[], from: string, to: string) {
  return cache.get(`climate:${cellId}:${attrs.join(",")}:${from}:${to}`, TTL.climate, async () => {
    const t = await brokerJson(
      `/temporal/entities/${encodeURIComponent(`urn:ngsi-ld:ClimateGridCell:${cellId}`)}`,
      { attrs: attrs.join(","), options: "temporalValues", timerel: "between", timeAt: `${from}-01T00:00:00Z`, endTimeAt: `${nextMonth(to)}-01T00:00:00Z` },
      20_000,
    );
    return shapeClimate(t, attrs);
  });
}

// FarmFootprint observations on Farm: one temporal instance per year, each value keyed by crop.
const FP_ATTRS: Record<Exclude<keyof FootprintRow, "crop" | "year">, string> = {
  method: "fp_method", areaHa: "fp_area_ha", yieldTHa: "fp_yield_t_ha", organicShare: "fp_organic_share",
  fertiliserKgHa: "fp_fertiliser_kg_ha", n2oDirectKgHa: "fp_n2o_direct_kg_ha", n2oIndirectKgHa: "fp_n2o_indirect_kg_ha",
  dieselKgHa: "fp_diesel_kg_ha", limeKgHa: "fp_lime_kg_ha", spraysKgHa: "fp_sprays_kg_ha", electricityKgHa: "fp_electricity_kg_ha",
  organicSoilKgHa: "fp_organic_soil_kg_ha", totalKgHa: "fp_total_kg_ha", flagKgHa: "fp_flag_kg_ha", kgPerKg: "fp_kgco2e_per_kg",
  mineralOnlyKgPerKg: "fp_mineral_only_kgco2e_per_kg", currentCalcKgPerKg: "fp_current_calc_kgco2e_per_kg", farmTco2e: "fp_farm_tco2e",
};

export function getFarmFootprint(farmId: string): Promise<Cached<FootprintRow[]>> {
  return cache.get(`footprint:${farmId}`, TTL.master, async () => {
    let t: Raw;
    try {
      t = await brokerJson(
        `/temporal/entities/${encodeURIComponent(`urn:ngsi-ld:Farm:${farmId}`)}`,
        { attrs: Object.values(FP_ATTRS).join(","), options: "temporalValues", timerel: "after", timeAt: "1900-01-01T00:00:00Z" },
        15_000,
      );
    } catch (e) {
      if ((e as { status?: number }).status === 404) return [];
      throw e;
    }
    const rows = new Map<string, Record<string, unknown>>();
    for (const [key, attr] of Object.entries(FP_ATTRS)) {
      for (const [val, at] of (t[attr]?.values ?? []) as [Record<string, unknown>, string][]) {
        const year = Number(String(at).slice(0, 4));
        for (const [crop, v] of Object.entries(val ?? {})) {
          const r = rows.get(`${crop}|${year}`) ?? { crop, year, currentCalcKgPerKg: null };
          r[key] = v;
          rows.set(`${crop}|${year}`, r);
        }
      }
    }
    return [...rows.values()].filter((r) => typeof r.totalKgHa === "number").sort((a, b) => String(a.crop).localeCompare(String(b.crop)) || Number(a.year) - Number(b.year)) as unknown as FootprintRow[];
  });
}

export async function getEntity(id: string, options: "normalized" | "keyValues"): Promise<Raw> {
  return brokerJson(`/entities/${encodeURIComponent(id)}`, options === "keyValues" ? { options: "keyValues" } : {}, 8000);
}
