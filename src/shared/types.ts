// Domain + API response types shared by the server and the web app (contract §5.2, §5.3).

export type Region = "FI_SW" | "SE_SKANE";
export type RegionFilter = Region | "both";
export type Crop = "pea" | "turnip_rape" | "potato" | "carrot" | "spinach";
export const CROPS: Crop[] = ["pea", "turnip_rape", "potato", "carrot", "spinach"];
export const REGIONS: Region[] = ["FI_SW", "SE_SKANE"];
export type LngLat = [number, number];
export type Upstream = "broker" | "inference" | "backend" | "chatbot";

export interface Farm {
  id: string;
  farmId: string;
  region: Region;
  country: "FI" | "SE";
  segment: string;
  organic: boolean;
  livestock: boolean;
  joinedYear: number | null;
  contractCrops: string[];
  location: LngLat;
  perCrop: Record<string, Record<string, number | string | boolean | null>>;
}

export interface Parcel {
  id: string;
  parcelId: string;
  farmId: string;
  crop: string;
  areaHa: number;
  soil: string | null;
  drainage: string | null;
  catchmentId: string | null;
  location: LngLat;
}

/** Compact parcel from `/api/broker/parcels?fields=min`: [parcelId, farmId, crop, areaHa, lon, lat]. */
export type ParcelMin = [string, string, string, number, number, number];

export interface Cell {
  id: string;
  cellId: string;
  region: Region;
  elevationM: number;
  continentality: number;
  location: LngLat;
}

export interface Prediction {
  parcelId: string;
  farmId: string;
  cellId: string;
  region: Region;
  crop: Crop | string;
  year: number;
  asOfDate: string;
  areaHa: number;
  yieldTHa: number;
  baselineTHa: number | null;
  deltaPct: number | null;
  modelName: string;
  modelVersion: string;
  label: string;
  observedDays: number;
  filledGapDays: number;
  filledFutureDays: number;
  totalDays: number;
  outOfTrainingRange: string[];
  computedAt: string;
}

export type ServiceGroup = "pipeline" | "ai" | "tools" | "platform";
export type ServiceState = "up" | "down" | "degraded";

export interface ServiceStatus {
  id: string;
  name: string;
  group: ServiceGroup;
  status: ServiceState;
  latencyMs: number | null;
  detail: string | null;
  healthUrl: string;
  openUrl: string | null;
  embedUrl: string | null;
  checkedAt: string;
}

export interface CropSummary {
  region: Region;
  crop: string;
  parcels: number;
  farms: number;
  areaHa: number;
  estTHa: number;
  baseTHa: number | null;
  deltaPct: number | null;
  estTonnes: number;
  baseTonnes: number | null;
  belowBaselineShare: number;
  completeness: { observedDays: number; totalDays: number; filledFutureDays: number };
  outOfRangeShare: number;
  modelVersion: string;
  asOfDate: string;
}

export interface FarmSummary {
  farmId: string;
  region: Region;
  parcels: number;
  areaHa: number;
  estTHa: number;
  baseTHa: number | null;
  deltaPct: number | null;
  crops: string[];
}

export interface Pipeline {
  csv: { loadLogs: number; lastLoadAt: string | null; rowsRejected: number };
  broker: { up: boolean; entities: number; weatherObserved: number };
  stream: { subscriptions: number; lastNotification: string | null; allOk: boolean };
  inference: { up: boolean; notifications: number; readingsNew: number; lastNotificationAt: string | null; modelVersion: string | null };
  writeback: { enabled: boolean; written: number | null; pending: number; hasError: boolean; yieldPredictions: number };
  ui: { up: true };
}

export type PredictionSource = "backend" | "inference";

/** Common envelope fields on every data response. `errors` lists upstreams that failed for partial data. */
export interface Envelope {
  fetchedAt: string;
  cached?: boolean;
  stale?: boolean;
  errors?: Partial<Record<Upstream, string>>;
}

export interface ApiError {
  error: string;
  upstream?: Upstream;
}

export interface Counts {
  farms: number;
  parcels: number;
  cells: number;
  weatherObserved: number;
  yieldPredictions: number;
  loadLogs: number;
}

export interface SeasonInfo {
  year: number | null;
  asOfDate: string | null;
  lastWeatherDate: string | null;
  cellsReporting: number;
  cellsTotal: number;
}

export interface WeatherDay {
  date: string;
  tMean: number | null;
  tMax: number | null;
  tMin: number | null;
  precip: number | null;
  et0: number | null;
}

export interface ClimatePoint {
  month: string;
  historical?: number;
  ssp126?: number;
  ssp245?: number;
  ssp585?: number;
  value?: number;
}

export const CLIMATE_ATTRS = ["tmean_c", "tmax_c_max", "precip_mm", "pet_mm", "hot_days_tmax_ge_27"] as const;
export type ClimateAttr = (typeof CLIMATE_ATTRS)[number];

export interface LoadLogRow {
  id: string;
  schema: string;
  file: string;
  sha256: string;
  loadedBy: string;
  loadedAt: string;
  rowsRead: number;
  rowsLoaded: number;
  rowsDropped: number;
  rowsRejected: number;
  status: string;
}

export interface SubscriptionRow {
  id: string;
  description: string | null;
  entityTypes: string[];
  endpoint: string | null;
  status: string;
  notificationStatus: string | null;
  timesSent: number;
  lastNotification: string | null;
  lastSuccess: string | null;
}

export interface HistoryPoint {
  asOfDate: string;
  yieldTHa: number;
  baselineTHa: number | null;
  observedDays: number;
  filledFutureDays: number;
}

/** Sanitized inference health (no local paths or URLs). */
export interface LiveHealth {
  status: string;
  started_at?: string;
  models?: { version?: string; crops?: string[]; load_error?: string | null };
  store?: { observations?: number; predictions?: number; rejected?: number };
  counters?: { notifications?: number; readings_new?: number; readings_out_of_season?: number; readings_duplicate?: number };
  last_notification?: { id?: string; subscription_id?: string; notified_at?: string; received_at?: string } | null;
  writeback?: { enabled: boolean; pending: number; has_error: boolean; written?: number | null };
}

export interface ObservationSeason {
  cell_id: string;
  year: number;
  stored_days: number;
  in_window_days: number;
  first_date: string | null;
  last_date: string | null;
  duplicates: number;
  corrections: number;
  pet_derived_days: number;
  last_received_at: string | null;
  observed_days: number;
  partial_days: number;
  filled_days: number;
  filled_gap_days: number;
  filled_future_days: number;
  total_days: number;
  last_observed_doy: number | null;
  label: string;
  missing_doys_before_last: number[];
  contract_parcels: number;
}

// ---- Route response types (GET unless noted) ----

export interface ServicesResponse { services: ServiceStatus[]; pipeline: Pipeline; checkedAt: string; errors?: Envelope["errors"] }
export interface OverviewResponse extends Envelope { counts: Counts; season: SeasonInfo; kpis: CropSummary[]; pipeline: Pipeline; source: PredictionSource | null }
export interface TypesResponse extends Envelope { types: { type: string; count: number | null }[] }
export interface FarmsResponse extends Envelope { farms: Farm[] }
export interface FarmDetailResponse extends Envelope { farm: Farm; parcels: Parcel[]; predictions: Prediction[]; cell: Cell | null }
export interface ParcelsResponse extends Envelope { parcels: Parcel[] }
export interface ParcelsMinResponse extends Envelope { parcels: ParcelMin[] }
export interface CellsResponse extends Envelope { cells: Cell[] }
export interface WeatherResponse extends Envelope { cellId: string; scenario: string; days: WeatherDay[] }
export interface ClimateResponse extends Envelope { cellId: string; attrs: Partial<Record<ClimateAttr, ClimatePoint[]>> }
export interface LoadLogsResponse extends Envelope { loadLogs: LoadLogRow[] }
export interface SubscriptionsResponse extends Envelope { subscriptions: SubscriptionRow[] }
export type EntityResponse = Record<string, unknown> & { id: string; type: string };
export interface LiveHealthResponse extends Envelope { source: PredictionSource; health: LiveHealth }
export interface PredictionsResponse extends Envelope { source: PredictionSource; count: number; asOfDate: string | null; predictions: Prediction[] }
export interface HistoryResponse extends Envelope { parcelId: string; points: HistoryPoint[] }
export interface SummaryResponse extends Envelope { source: PredictionSource; asOfDate: string | null; crops: CropSummary[] }
export interface ObservationsResponse extends Envelope {
  source: "inference";
  seasons: ObservationSeason[];
  recent_rejected: unknown[];
  counters: Record<string, number>;
}
