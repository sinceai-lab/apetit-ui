// Typed client for the app server's /api routes (the browser never calls upstreams directly).
import type {
  CellsResponse,
  ClimateAttr,
  ClimateResponse,
  EntityResponse,
  FarmDetailResponse,
  FarmFootprintResponse,
  FarmsResponse,
  HistoryResponse,
  LiveHealthResponse,
  LoadLogsResponse,
  ObservationsResponse,
  OverviewResponse,
  ParcelsMinResponse,
  ParcelsResponse,
  PredictionsResponse,
  RegionFilter,
  ServicesResponse,
  SubscriptionsResponse,
  SummaryResponse,
  TypesResponse,
  Upstream,
  WeatherResponse,
} from "@/shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public upstream?: Upstream,
  ) {
    super(message);
  }
}

type Q = Record<string, string | number | null | undefined>;
const qs = (q: Q = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v != null && v !== "" && v !== "both") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export async function getJson<T>(path: string, q?: Q, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path + qs(q), { signal, headers: { accept: "application/json" } });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "App server unreachable");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`, body?.upstream);
  return body as T;
}

type S = AbortSignal | undefined;

export const api = {
  services: (s?: S) => getJson<ServicesResponse>("/api/services", undefined, s),
  overview: (s?: S) => getJson<OverviewResponse>("/api/overview", undefined, s),
  types: (s?: S) => getJson<TypesResponse>("/api/broker/types", undefined, s),
  farms: (region?: RegionFilter, s?: S) => getJson<FarmsResponse>("/api/broker/farms", { region }, s),
  farm: (farmId: string, s?: S) => getJson<FarmDetailResponse>(`/api/broker/farms/${encodeURIComponent(farmId)}`, undefined, s),
  farmFootprint: (farmId: string, s?: S) => getJson<FarmFootprintResponse>(`/api/broker/farms/${encodeURIComponent(farmId)}/footprint`, undefined, s),
  parcels: (q: { region?: RegionFilter; crop?: string; farm?: string } = {}, s?: S) => getJson<ParcelsResponse>("/api/broker/parcels", q, s),
  parcelsMin: (q: { region?: RegionFilter; crop?: string; farm?: string } = {}, s?: S) =>
    getJson<ParcelsMinResponse>("/api/broker/parcels", { ...q, fields: "min" }, s),
  cells: (region?: RegionFilter, s?: S) => getJson<CellsResponse>("/api/broker/cells", { region }, s),
  weather: (cellId: string, q: { from?: string; to?: string } = {}, s?: S) =>
    getJson<WeatherResponse>(`/api/broker/weather/${encodeURIComponent(cellId)}`, q, s),
  climate: (cellId: string, attrs: ClimateAttr[], q: { from?: string; to?: string } = {}, s?: S) =>
    getJson<ClimateResponse>(`/api/broker/climate/${encodeURIComponent(cellId)}`, { attrs: attrs.join(","), ...q }, s),
  loadLogs: (s?: S) => getJson<LoadLogsResponse>("/api/broker/loadlogs", undefined, s),
  subscriptions: (s?: S) => getJson<SubscriptionsResponse>("/api/broker/subscriptions", undefined, s),
  entity: (id: string, options: "normalized" | "keyValues" = "normalized", s?: S) =>
    getJson<EntityResponse>(`/api/broker/entity/${encodeURIComponent(id)}`, { options }, s),
  liveHealth: (s?: S) => getJson<LiveHealthResponse>("/api/live/health", undefined, s),
  predictions: (q: { crop?: string; region?: RegionFilter; farm?: string; cell?: string } = {}, s?: S) =>
    getJson<PredictionsResponse>("/api/live/predictions", q, s),
  history: (parcel: string, s?: S) => getJson<HistoryResponse>("/api/live/history", { parcel }, s),
  summary: (region?: RegionFilter, s?: S) => getJson<SummaryResponse>("/api/live/summary", { region }, s),
  observations: (q: { cell?: string; year?: number } = {}, s?: S) => getJson<ObservationsResponse>("/api/live/observations", q, s),
};
