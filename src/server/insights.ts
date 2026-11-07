// /api/insights/*: whitelisted pass-throughs to the inference service's /insights (contract §10.2).
// The server only validates, maps codes, camelCases and caches; every figure is the upstream's.
import type { Route } from "./routes";
import type { Crop } from "../shared/types";
import { CROPS, REGIONS } from "../shared/types";
import { BACKTEST_TESTS, CLIMATE_SCENARIOS, IRRIGATION_SHARE, IRRIGATIONS, STORIES, WEATHER_SETS, type WeatherSet } from "../shared/insights";
import { config } from "./config";
import { cache, TtlCache, type Cached } from "./cache";
import { HttpError, json, UpstreamError } from "./http";
import { RX } from "./rx";

type Raw = Record<string, any>;

/** One query parameter: allowed values, whether it's required, and its upstream name. */
interface Param {
  oneOf?: readonly string[];
  rx?: RegExp;
  required?: boolean;
  as?: string;
}

interface Spec {
  pattern: string;
  upstream: string;
  ttlMs: number;
  query?: Record<string, Param>;
  pathParam?: { name: string; rx: RegExp };
  check?: (q: Record<string, string>) => void;
}

const MIN = 60_000;
const region: Param = { oneOf: REGIONS, required: true };
const crop: Param = { oneOf: CROPS, required: true };
const story: Param = { oneOf: STORIES, required: true };
const test: Param = { oneOf: BACKTEST_TESTS, required: true };
const SCOPE = /^(all|(FI_SW|SE_SKANE)\/[a-z_]{2,32})$/;

export const INSIGHT_SPECS: Spec[] = [
  { pattern: "/api/insights/meta", upstream: "/insights/meta", ttlMs: MIN },
  {
    pattern: "/api/insights/options",
    upstream: "/insights/options",
    ttlMs: 10 * MIN,
    query: { region: { oneOf: REGIONS }, crop: { oneOf: CROPS }, farm: { rx: RX.farmId, as: "farm_id" } },
    check: (q) => {
      if (q.crop && !q.region) throw new HttpError(400, "crop needs region");
    },
  },
  { pattern: "/api/insights/advice", upstream: "/insights/advice", ttlMs: 5 * MIN, query: { region, crop, story } },
  { pattern: "/api/insights/policy", upstream: "/insights/policy", ttlMs: 10 * MIN },
  { pattern: "/api/insights/outlook", upstream: "/insights/outlook", ttlMs: 10 * MIN, query: { region, crop } },
  { pattern: "/api/insights/climate-risk", upstream: "/insights/climate-risk", ttlMs: 10 * MIN, query: { scenario: { oneOf: CLIMATE_SCENARIOS, required: true } } },
  { pattern: "/api/insights/euro-risk", upstream: "/insights/euro-risk", ttlMs: 10 * MIN },
  { pattern: "/api/insights/farms", upstream: "/insights/farms", ttlMs: 5 * MIN, query: { region, crop } },
  { pattern: "/api/insights/soil-effects", upstream: "/insights/soil-effects", ttlMs: 10 * MIN, query: { region, crop } },
  { pattern: "/api/insights/farms/:farmId", upstream: "/insights/farms", ttlMs: 5 * MIN, pathParam: { name: "farmId", rx: RX.farmId }, query: { crop, story } },
  { pattern: "/api/insights/fields/:parcelId", upstream: "/insights/fields", ttlMs: 5 * MIN, pathParam: { name: "parcelId", rx: RX.parcelId }, query: { crop, story } },
  { pattern: "/api/insights/trust", upstream: "/insights/trust", ttlMs: 10 * MIN, query: { test } },
  { pattern: "/api/insights/trust/seasons", upstream: "/insights/trust/seasons", ttlMs: 10 * MIN, query: { region, crop, test, farm: { rx: RX.farmId, as: "farm_id" } } },
  { pattern: "/api/insights/trust/live-replay", upstream: "/insights/trust/live-replay", ttlMs: 10 * MIN, query: { test, scope: { rx: SCOPE } } },
  { pattern: "/api/insights/trust/corrections", upstream: "/insights/trust/corrections", ttlMs: 10 * MIN },
];

/** Validates the query against the spec (400 on anything unlisted, repeated or malformed); returns upstream params. */
export function validateQuery(url: URL, spec: Pick<Spec, "query" | "check">): Record<string, string> {
  const allowed = spec.query ?? {};
  const seen: Record<string, string> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const p = allowed[key];
    if (!p) throw new HttpError(400, `unknown parameter: ${key.slice(0, 40)}`);
    const all = url.searchParams.getAll(key);
    if (all.length > 1) throw new HttpError(400, `repeated parameter: ${key}`);
    const v = all[0]!;
    if (v === "") continue;
    if ((p.oneOf && !p.oneOf.includes(v)) || (p.rx && !p.rx.test(v))) throw new HttpError(400, `invalid ${key}${p.oneOf ? ` (${p.oneOf.join(" | ")})` : ""}`);
    seen[key] = v;
  }
  for (const [k, p] of Object.entries(allowed)) if (p.required && !seen[k]) throw new HttpError(400, `${k} is required`);
  spec.check?.(seen);
  const out: Record<string, string> = {};
  for (const k of Object.keys(seen).sort()) out[allowed[k]!.as ?? k] = seen[k]!;
  return out;
}

function pathId(v: string | undefined, rx: RegExp, what: string): string {
  let s = v ?? "";
  try {
    s = decodeURIComponent(s);
  } catch {
    throw new HttpError(400, `invalid ${what}`);
  }
  if (!rx.test(s)) throw new HttpError(400, `invalid ${what}`);
  return s;
}

/** snake_case keys to camelCase; keys under these names are data (labels, feature codes, template slots) and stay as sent. */
const KEEP_KEYS = new Set(["values", "effects", "weather"]);
const camelKey = (k: string) => (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k) ? k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()) : k);
export function camelDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(camelDeep);
  if (v && typeof v === "object") {
    const out: Raw = {};
    for (const [k, x] of Object.entries(v)) out[camelKey(k)] = KEEP_KEYS.has(k) ? x : camelDeep(x);
    return out;
  }
  return v;
}

function detailText(body: string): string {
  try {
    const j = JSON.parse(body);
    const d = j.detail ?? j.error;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x: Raw) => `${(x.loc ?? []).slice(-1)[0] ?? ""}: ${x.msg ?? ""}`).join("; ");
    if (d != null) return JSON.stringify(d);
  } catch {}
  return body.slice(0, 200);
}

/** Inference fetch: 404 stays 404, 422 becomes 400, 503 stays 503, other errors 502, unreachable 503. */
export async function inferenceJson<T = Raw>(path: string, opts: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 10_000, headers = {}, ...init } = opts;
  let res: Response;
  try {
    res = await fetch(config.inferenceUrl + path, { ...init, headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new UpstreamError("inference", 503, `inference ${(e as Error)?.name === "TimeoutError" ? "timed out" : "unreachable"}`);
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const status = res.status === 404 ? 404 : res.status === 422 ? 400 : res.status === 503 ? 503 : 502;
    throw new UpstreamError("inference", status, detailText(text).slice(0, 300) || `inference returned ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError("inference", 502, "inference returned invalid JSON");
  }
}

const envelope = (c: Cached<unknown>) => ({ fetchedAt: c.fetchedAt, ...(c.cached ? { cached: true } : {}), ...(c.stale ? { stale: true } : {}) });

/** Model version and file stamps from /insights/meta, so a pipeline rerun or new model gets fresh cache keys. */
export async function generation(): Promise<{ key: string; modelVersion: string }> {
  try {
    const c = await cache.get("insights:meta", MIN, () => inferenceJson<Raw>("/insights/meta", { timeoutMs: 5000 }));
    const m = c.value;
    const files = (m.files ?? []).map((f: Raw) => `${f.file}@${f.generated_at}`).join(",");
    return { key: `${m.model_version}:${Bun.hash(files).toString(36)}`, modelVersion: String(m.model_version ?? "na") };
  } catch {
    return { key: "na", modelVersion: "na" };
  }
}

function getRoute(spec: Spec): Route {
  return {
    method: "GET",
    pattern: spec.pattern,
    handler: async ({ url, params }) => {
      const q = validateQuery(url, spec);
      const id = spec.pathParam ? pathId(params[spec.pathParam.name], spec.pathParam.rx, spec.pathParam.name) : null;
      const path = `${spec.upstream}${id ? `/${encodeURIComponent(id)}` : ""}`;
      const qs = new URLSearchParams(q).toString();
      const full = qs ? `${path}?${qs}` : path;
      if (spec.pattern === "/api/insights/meta") {
        const c = await cache.get("insights:meta", spec.ttlMs, () => inferenceJson<Raw>(full, { timeoutMs: 5000 }));
        return json({ ...(camelDeep(c.value) as Raw), ...envelope(c) });
      }
      const gen = await generation();
      const c = await cache.get(`insights:${gen.key}:${full}`, spec.ttlMs, () => inferenceJson<Raw>(full));
      return json({ ...(camelDeep(c.value) as Raw), ...envelope(c) });
    },
  };
}

// ---- POST /api/insights/what-if ------------------------------------------------------------

export const WHAT_IF_BODY_LIMIT = 2048;
const WHAT_IF_KEYS = ["parcelId", "crop", "weather", "year", "irrigation"] as const;
const PER_MINUTE = 20;
const MAX_CONCURRENT = 2;
const TOO_MANY = "Too many what-if runs. Wait a moment and try again.";

export interface UpstreamWhatIfBody {
  parcel_id: string;
  crop: Crop;
  scenario: string;
  year: number;
  irrigation: number | null;
}

/** Strict body check (400 names the first problem) and the mapping to the model's codes. */
export function parseWhatIf(raw: unknown): UpstreamWhatIfBody {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "body must be a JSON object");
  const b = raw as Raw;
  const extra = Object.keys(b).find((k) => !(WHAT_IF_KEYS as readonly string[]).includes(k));
  if (extra) throw new HttpError(400, `unknown key: ${extra.slice(0, 40)}`);
  const missing = WHAT_IF_KEYS.find((k) => !(k in b));
  if (missing) throw new HttpError(400, `${missing} is required`);
  if (typeof b.parcelId !== "string" || !RX.parcelId.test(b.parcelId)) throw new HttpError(400, "invalid parcelId (e.g. F0001-P03)");
  if (!CROPS.includes(b.crop)) throw new HttpError(400, `invalid crop (${CROPS.join(" | ")})`);
  if (typeof b.weather !== "string" || !Object.hasOwn(WEATHER_SETS, b.weather)) throw new HttpError(400, `invalid weather (${Object.keys(WEATHER_SETS).join(" | ")})`);
  const set = WEATHER_SETS[b.weather as WeatherSet];
  if (!Number.isInteger(b.year) || b.year < set.years[0] || b.year > set.years[1]) throw new HttpError(400, `year must be an integer from ${set.years[0]} to ${set.years[1]} for weather ${b.weather}`);
  if (!IRRIGATIONS.includes(b.irrigation)) throw new HttpError(400, `invalid irrigation (${IRRIGATIONS.join(" | ")})`);
  if (b.irrigation !== "usual" && !b.parcelId.startsWith("S")) throw new HttpError(400, "irrigation can only be changed for a Swedish field");
  return { parcel_id: b.parcelId, crop: b.crop, scenario: set.scenario, year: b.year, irrigation: IRRIGATION_SHARE[b.irrigation as keyof typeof IRRIGATION_SHARE] };
}

/** Token bucket per client address plus a global cap on concurrent upstream calls. */
export class WhatIfGuard {
  private buckets = new Map<string, { tokens: number; at: number }>();
  inflight = 0;
  constructor(
    private perMinute = PER_MINUTE,
    private maxConcurrent = MAX_CONCURRENT,
    private now: () => number = Date.now,
  ) {}

  /** Returns 0 when allowed, else the seconds to wait. */
  take(client: string): number {
    const t = this.now();
    const rate = this.perMinute / 60_000;
    const b = this.buckets.get(client) ?? { tokens: this.perMinute, at: t };
    b.tokens = Math.min(this.perMinute, b.tokens + (t - b.at) * rate);
    b.at = t;
    if (this.buckets.size > 5000) this.buckets.clear();
    this.buckets.set(client, b);
    if (b.tokens < 1) return Math.max(1, Math.ceil((1 - b.tokens) / rate / 1000));
    b.tokens -= 1;
    return 0;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inflight >= this.maxConcurrent) throw new HttpError(429, TOO_MANY);
    this.inflight++;
    try {
      return await fn();
    } finally {
      this.inflight--;
    }
  }

  reset() {
    this.buckets.clear();
    this.inflight = 0;
  }
}

export const whatIfGuard = new WhatIfGuard();
const whatIfCache = new TtlCache(300);

async function callWhatIf(body: UpstreamWhatIfBody): Promise<Raw> {
  const init = { method: "POST" as const, body: JSON.stringify(body), headers: { "content-type": "application/json" }, timeoutMs: 15_000 };
  try {
    return await inferenceJson<Raw>("/insights/what-if", init);
  } catch (e) {
    // FastAPI's bare "Not Found" means the route is missing (older service), not an unknown parcel.
    if (!(e instanceof UpstreamError) || e.status !== 404 || e.message !== "Not Found") throw e;
    const prediction = await inferenceJson<Raw>("/predict/field", init);
    return { prediction, degraded: "drivers unavailable" };
  }
}

const whatIfRoute: Route = {
  method: "POST",
  pattern: "/api/insights/what-if",
  handler: async ({ req, server }) => {
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "content-type must be application/json" }, 415);
    if (Number(req.headers.get("content-length") ?? 0) > WHAT_IF_BODY_LIMIT) return json({ error: "request body too large" }, 413);
    const text = await req.text();
    if (new TextEncoder().encode(text).length > WHAT_IF_BODY_LIMIT) return json({ error: "request body too large" }, 413);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const body = parseWhatIf(raw);
    const wait = whatIfGuard.take(server?.requestIP(req)?.address ?? "local");
    if (wait) return json({ error: TOO_MANY }, 429, { "retry-after": String(wait) });
    const gen = await generation();
    const key = `whatif:${gen.modelVersion}:${body.parcel_id}:${body.crop}:${body.scenario}:${body.year}:${body.irrigation}`;
    let c: Cached<Raw>;
    try {
      c = await whatIfCache.get(key, 10 * MIN, () => whatIfGuard.run(() => callWhatIf(body)));
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) return json({ error: e.message }, 429, { "retry-after": "2" });
      throw e;
    }
    return json({ ...(camelDeep(c.value) as Raw), ...envelope(c) });
  },
};

export const insightRoutes: Route[] = [...INSIGHT_SPECS.map(getRoute), whatIfRoute];

/** Dev and tests: drops cached what-if results. */
export const clearWhatIfCache = () => whatIfCache.clear();
