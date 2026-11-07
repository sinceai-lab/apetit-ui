// Live season data: backend (token, server-side) first, inference direct as fallback; GET only.
import type { LiveHealth, ObservationSeason, Prediction, PredictionSource } from "../shared/types";
import { predictionFromInference } from "../shared/normalize";
import { config } from "./config";
import { cache, TTL, type Cached } from "./cache";
import { upstreamJson, UpstreamError, errMsg } from "./http";
import { cellRegions } from "./broker";
import { historyPoints, sanitizeHealth } from "./shape";

type Raw = Record<string, any>;

/** Try the backend when a token is configured; on any failure use inference directly. */
async function viaBackend<T>(backendPath: string, inferencePath: string, timeoutMs = 15_000): Promise<{ source: PredictionSource; body: T; backendError?: string }> {
  let backendError: string | undefined;
  const token = config.backendToken;
  if (token) {
    try {
      const body = await upstreamJson<T>("backend", config.backendUrl + backendPath, { timeoutMs, headers: { authorization: `Bearer ${token}` } });
      return { source: "backend", body };
    } catch (e) {
      backendError = errMsg(e);
    }
  } else backendError = "BACKEND_TOKEN not set";
  try {
    return { source: "inference", body: await upstreamJson<T>("inference", config.inferenceUrl + inferencePath, { timeoutMs }), backendError };
  } catch (e) {
    if (e instanceof UpstreamError) e.message = `${e.message} (backend: ${backendError})`;
    throw e;
  }
}

export interface PredictionsValue {
  source: PredictionSource;
  predictions: Prediction[];
}

export function getPredictions(): Promise<Cached<PredictionsValue>> {
  return cache.get("predictions", TTL.predictions, async () => {
    const q = "latest=true&limit=100000";
    const { source, body } = await viaBackend<{ predictions?: Raw[] }>(`/api/live/predictions?${q}`, `/predictions?${q}`);
    const regions = await cellRegions();
    const predictions = (body.predictions ?? []).map((r) => predictionFromInference(r, regions)).sort((a, b) => a.parcelId.localeCompare(b.parcelId) || a.crop.localeCompare(b.crop));
    return { source, predictions };
  });
}

export function getLiveHealth(): Promise<Cached<{ source: PredictionSource; health: LiveHealth }>> {
  return cache.get("livehealth", TTL.health, async () => {
    const { source, body } = await viaBackend<Raw>("/api/live/health", "/health", 4000);
    return { source, health: sanitizeHealth(body) };
  });
}

/** Inference-only: every estimate (not just latest) for one parcel. */
export function getHistory(parcelId: string) {
  return cache.get(`history:${parcelId}`, TTL.history, async () => {
    const body = await upstreamJson<{ predictions?: Raw[] }>("inference", `${config.inferenceUrl}/predictions?parcel_id=${encodeURIComponent(parcelId)}&limit=100000`, { timeoutMs: 10_000 });
    return historyPoints(body.predictions ?? []);
  });
}

export interface ObservationsValue {
  seasons: ObservationSeason[];
  recent_rejected: unknown[];
  counters: Record<string, number>;
}

/** Inference-only: the backend does not relay /observations/status. */
export function getObservations(cell?: string | null, year?: string | null): Promise<Cached<ObservationsValue>> {
  const q = new URLSearchParams();
  if (cell) q.set("cell_id", cell);
  if (year) q.set("year", year);
  const s = q.toString();
  return cache.get(`status:${s}`, TTL.status, async () => {
    const b = await upstreamJson<Raw>("inference", `${config.inferenceUrl}/observations/status${s ? `?${s}` : ""}`, { timeoutMs: 10_000 });
    const seasons = (Array.isArray(b.seasons) ? b.seasons : []) as ObservationSeason[];
    return { seasons: seasons.sort((a, c) => a.cell_id.localeCompare(c.cell_id) || a.year - c.year), recent_rejected: b.recent_rejected ?? [], counters: b.counters ?? {} };
  });
}
