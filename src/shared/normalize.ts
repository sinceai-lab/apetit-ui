// Pure normalizers for broker keyValues entities and inference rows (contract §2, §3, §8).
import type { Cell, Farm, LngLat, Parcel, Prediction, Region } from "./types";

type Raw = Record<string, any>;

/** Swedish crop keys used on SE farms mapped to the canonical crop. */
export const CROP_ALIASES: Record<string, string> = { "ärt_frysärt": "pea" };
export const normCrop = (k: string): string => CROP_ALIASES[k] ?? k;

/** Number from a number or a decimal-comma string ("9,59"); null when not numeric. */
export function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim().replace(/\s/g, "").replace(",", ".");
    if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
    return parseFloat(s);
  }
  return null;
}

/** Normalize one survey value: decimal-comma numbers, ja/nej booleans, else as is. */
export function normValue(v: unknown): number | string | boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") {
    const low = v.trim().toLowerCase();
    if (low === "ja" || low === "yes" || low === "true") return true;
    if (low === "nej" || low === "no" || low === "false") return false;
    const n = toNum(v);
    return n ?? v;
  }
  return JSON.stringify(v);
}

/** Unwrap JSON-LD typed literals `{"@type","@value"}` (broker keyValues dates). */
export function unwrap<T = unknown>(v: unknown): T {
  if (v && typeof v === "object" && "@value" in (v as Raw)) return (v as Raw)["@value"] as T;
  return v as T;
}

/** Strip the URN prefix: "urn:ngsi-ld:Farm:F0001" -> "F0001". */
export const urnTail = (v: unknown): string | null => (typeof v === "string" ? (v.split(":").pop() ?? v) : null);

export function regionFromFarmId(farmId: string): Region {
  return farmId.startsWith("S") ? "SE_SKANE" : "FI_SW";
}

export const farmIdFromParcel = (parcelId: string): string => parcelId.split("-P")[0] ?? parcelId;

export function lngLat(loc: unknown): LngLat {
  const c = (loc as Raw | undefined)?.coordinates;
  return Array.isArray(c) && c.length >= 2 ? [Number(c[0]), Number(c[1])] : [NaN, NaN];
}

export interface PredictionIdParts {
  parcelId: string;
  crop: string;
  year: number;
  farmId: string;
  parcelUrn: string;
  farmUrn: string;
}

/** Parse `urn:ngsi-ld:YieldPrediction:<parcel>:<crop>:<year>`; refParcel points at the missing AgriParcel type. */
export function parsePredictionId(id: string): PredictionIdParts | null {
  const parts = id.split(":");
  if (parts.length !== 6 || parts[0] !== "urn" || parts[1] !== "ngsi-ld" || parts[2] !== "YieldPrediction") return null;
  const [, , , parcelId, crop, yearS] = parts as [string, string, string, string, string, string];
  const year = Number(yearS);
  if (!parcelId || !crop || !Number.isInteger(year)) return null;
  const farmId = farmIdFromParcel(parcelId);
  return { parcelId, crop, year, farmId, parcelUrn: `urn:ngsi-ld:Parcel:${parcelId}`, farmUrn: `urn:ngsi-ld:Farm:${farmId}` };
}

const FARM_SCALARS = new Set(["id", "type", "farm_id", "farm_segment", "region", "country", "organic_certified", "livestock", "joined_year", "contract_crops", "location"]);

export function normalizeFarm(e: Raw): Farm {
  const farmId = String(e.farm_id ?? urnTail(e.id));
  const perCrop: Farm["perCrop"] = {};
  for (const [attr, val] of Object.entries(e)) {
    if (FARM_SCALARS.has(attr) || attr.startsWith("fp_") || !val || typeof val !== "object" || Array.isArray(val)) continue;
    for (const [cropKey, v] of Object.entries(val as Raw)) {
      const crop = normCrop(cropKey);
      (perCrop[crop] ??= {})[attr] = normValue(v);
    }
  }
  const crops = typeof e.contract_crops === "string" ? e.contract_crops.split(";").map((s: string) => normCrop(s.trim())).filter(Boolean) : [];
  const region: Region = e.region === "SE_SKANE" || e.region === "FI_SW" ? e.region : regionFromFarmId(farmId);
  const joined = toNum(e.joined_year);
  return {
    id: String(e.id),
    farmId,
    region,
    country: e.country === "SE" ? "SE" : region === "SE_SKANE" ? "SE" : "FI",
    segment: String(e.farm_segment ?? ""),
    organic: normValue(e.organic_certified) === true,
    livestock: normValue(e.livestock) === true,
    joinedYear: joined,
    contractCrops: [...new Set(crops)],
    location: lngLat(e.location),
    perCrop,
  };
}

export function normalizeParcel(e: Raw): Parcel {
  const parcelId = String(e.parcel_id ?? urnTail(e.id));
  return {
    id: String(e.id),
    parcelId,
    farmId: urnTail(e.farm_id) ?? farmIdFromParcel(parcelId),
    crop: String(e.crop ?? ""),
    areaHa: toNum(e.area_ha) ?? 0,
    soil: e.soil_class_soilmap ?? null,
    drainage: e.drainage ?? null,
    catchmentId: urnTail(e.catchment_id),
    location: lngLat(e.location),
  };
}

export function normalizeCell(e: Raw): Cell {
  const cellId = String(e.cell_id ?? urnTail(e.id));
  return {
    id: String(e.id),
    cellId,
    region: e.region === "SE_SKANE" ? "SE_SKANE" : "FI_SW",
    elevationM: toNum(e.elevation_m) ?? 0,
    continentality: toNum(e.continentality) ?? 0,
    location: lngLat(e.location),
  };
}

export function deltaPct(est: number | null | undefined, base: number | null | undefined): number | null {
  if (est == null || base == null || !Number.isFinite(est) || !Number.isFinite(base) || base === 0) return null;
  return ((est - base) / base) * 100;
}

/** Inference/backend prediction row -> Prediction. Region comes from the cell map, else the farm id prefix. */
export function predictionFromInference(r: Raw, cellRegion?: Map<string, Region>): Prediction {
  const parcelId = String(r.parcel_id);
  const farmId = String(r.farm_id ?? farmIdFromParcel(parcelId));
  const cellId = String(r.cell_id ?? "");
  const yieldTHa = toNum(r.yield_t_ha) ?? NaN;
  const baselineTHa = toNum(r.baseline_t_ha);
  return {
    parcelId,
    farmId,
    cellId,
    region: cellRegion?.get(cellId) ?? regionFromFarmId(farmId),
    crop: String(r.crop),
    year: Number(r.year),
    asOfDate: String(unwrap(r.as_of_date) ?? ""),
    areaHa: toNum(r.area_ha) ?? 0,
    yieldTHa,
    baselineTHa,
    deltaPct: deltaPct(yieldTHa, baselineTHa),
    modelName: String(r.model_name ?? ""),
    modelVersion: String(r.model_version ?? ""),
    label: String(r.label ?? "estimate"),
    observedDays: toNum(r.observed_days) ?? 0,
    filledGapDays: toNum(r.filled_gap_days) ?? 0,
    filledFutureDays: toNum(r.filled_future_days) ?? 0,
    totalDays: toNum(r.total_days) ?? 0,
    outOfTrainingRange: Array.isArray(r.out_of_training_range) ? r.out_of_training_range.map(String) : [],
    computedAt: String(unwrap(r.computed_at) ?? ""),
  };
}

/** Broker YieldPrediction (keyValues) -> Prediction, joined to parcels by the id (area, farm). */
export function predictionFromBroker(e: Raw, parcels?: Map<string, Parcel>, cellRegion?: Map<string, Region>): Prediction | null {
  const p = parsePredictionId(String(e.id));
  if (!p) return null;
  const parcel = parcels?.get(p.parcelId);
  const cellId = urnTail(e.refGridCell) ?? "";
  const yieldTHa = toNum(e.estimatedYield) ?? NaN;
  const baselineTHa = toNum(e.baselineYield);
  const observedDays = toNum(e.observedDays) ?? 0;
  const gap = toNum(e.filledGapDays) ?? 0;
  const fut = toNum(e.filledFutureDays) ?? 0;
  return {
    parcelId: p.parcelId,
    farmId: parcel?.farmId ?? p.farmId,
    cellId,
    region: cellRegion?.get(cellId) ?? regionFromFarmId(p.farmId),
    crop: String(e.cropName ?? p.crop),
    year: toNum(e.seasonYear) ?? p.year,
    asOfDate: String(unwrap(e.asOfDate) ?? ""),
    areaHa: parcel?.areaHa ?? 0,
    yieldTHa,
    baselineTHa,
    deltaPct: deltaPct(yieldTHa, baselineTHa),
    modelName: String(e.modelName ?? ""),
    modelVersion: String(e.modelVersion ?? ""),
    label: String(e.predictionLabel ?? "estimate"),
    observedDays,
    filledGapDays: gap,
    filledFutureDays: fut,
    totalDays: observedDays + (toNum(e.filledDays) ?? 0),
    outOfTrainingRange: [],
    computedAt: String(unwrap(e.computedAt) ?? ""),
  };
}
