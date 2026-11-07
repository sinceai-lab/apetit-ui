// The /api route table: an explicit allowlist. Anything else is 404 (unknown path) or 405 (wrong method).
import type { Server } from "bun";
import type { ClimateAttr, Envelope, RegionFilter, Upstream } from "../shared/types";
import { CLIMATE_ATTRS } from "../shared/types";
import { cropSummaries, filterPredictions, latestAsOf } from "../shared/aggregate";
import { cache, type Cached } from "./cache";
import { errMsg, errorResponse, HttpError, json, nowIso } from "./http";
import { getCells, getClimate, getEntity, getFarms, getLoadLogs, getParcels, getSubscriptions, getTypeCounts, getWeather } from "./broker";
import { getHistory, getLiveHealth, getObservations, getPredictions } from "./live";
import { getServices } from "./services";
import { buildPipeline, countsFrom, seasonInfo, stripKeys } from "./shape";
import { chatMeta, chatStream } from "./chat";
import { RX } from "./rx";
import { clearWhatIfCache, insightRoutes } from "./insights";
import { getFieldTile } from "./geo";

export { RX };

export type Ctx = { req: Request; url: URL; params: Record<string, string>; server?: Server<unknown> };
export type Handler = (c: Ctx) => Promise<Response> | Response;
export interface Route {
  method: "GET" | "POST";
  pattern: string;
  handler: Handler;
}

/** Optional query param that must match a regex; throws 400 otherwise. */
function param(url: URL, name: string, rx?: RegExp): string | null {
  const v = url.searchParams.get(name);
  if (v == null || v === "") return null;
  if (rx && !rx.test(v)) throw new HttpError(400, `invalid ${name}`);
  return v;
}

function region(url: URL): RegionFilter | null {
  const v = param(url, "region");
  if (v == null) return null;
  if (v !== "FI_SW" && v !== "SE_SKANE" && v !== "both") throw new HttpError(400, "invalid region (FI_SW | SE_SKANE | both)");
  return v;
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

function envelope(c: Cached<unknown> | Cached<unknown>[]): Envelope {
  const all = Array.isArray(c) ? c : [c];
  const e: Envelope = { fetchedAt: all.map((x) => x.fetchedAt).sort()[0] ?? nowIso() };
  if (all.length && all.every((x) => x.cached)) e.cached = true;
  if (all.some((x) => x.stale)) e.stale = true;
  return e;
}

async function settled<T>(p: Promise<T>, up: Upstream, errors: Partial<Record<Upstream, string>>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    errors[up] ??= errMsg(e);
    return null;
  }
}

const inRegion = (r: RegionFilter | null, x: string) => !r || r === "both" || r === x;

export const routes: Route[] = [
  { method: "GET", pattern: "/api/services", handler: async () => json(await getServices()) },

  {
    method: "GET",
    pattern: "/api/overview",
    handler: async () => {
      const errors: Partial<Record<Upstream, string>> = {};
      const [tc, preds, obs, logs, subs, health, cells] = await Promise.all([
        settled(getTypeCounts(), "broker", errors),
        settled(getPredictions(), "inference", errors),
        settled(getObservations(), "inference", errors),
        settled(getLoadLogs(), "broker", errors),
        settled(getSubscriptions(), "broker", errors),
        settled(getLiveHealth(), "inference", errors),
        settled(getCells(), "broker", errors),
      ]);
      const p = preds?.value.predictions ?? [];
      const body = {
        ...envelope([tc, preds, obs].filter((x): x is Cached<any> => x != null)),
        counts: countsFrom(tc?.value ?? null),
        season: seasonInfo(p, obs?.value.seasons ?? null, cells?.value.length ?? 0),
        kpis: cropSummaries(p),
        pipeline: buildPipeline({ loadLogs: logs?.value ?? null, typeCounts: tc?.value ?? null, subscriptions: subs?.value ?? null, health: health?.value.health ?? null }),
        source: preds?.value.source ?? null,
        ...(Object.keys(errors).length ? { errors } : {}),
      };
      if (!tc && !preds) return json({ ...body, error: "broker and inference unavailable", upstream: "broker" }, 503);
      return json(body);
    },
  },

  {
    method: "GET",
    pattern: "/api/broker/types",
    handler: async () => {
      const c = await getTypeCounts();
      return json({ ...envelope(c), types: c.value });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/farms",
    handler: async ({ url }) => {
      const r = region(url);
      const c = await getFarms();
      return json({ ...envelope(c), farms: c.value.filter((f) => inRegion(r, f.region)) });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/farms/:farmId",
    handler: async ({ params }) => {
      const farmId = pathId(params.farmId, RX.farmId, "farmId");
      const errors: Partial<Record<Upstream, string>> = {};
      const farms = await getFarms();
      const farm = farms.value.find((f) => f.farmId === farmId);
      if (!farm) return json({ error: `farm ${farmId} not found` }, 404);
      const [parcels, preds, cells] = await Promise.all([settled(getParcels(), "broker", errors), settled(getPredictions(), "inference", errors), settled(getCells(), "broker", errors)]);
      const predictions = filterPredictions(preds?.value.predictions ?? [], { farm: farmId });
      const cellId = predictions[0]?.cellId;
      let cell = cells?.value.find((c) => c.cellId === cellId) ?? null;
      if (!cell && cells?.value.length) {
        const [lon, lat] = farm.location;
        cell = [...cells.value].filter((c) => c.region === farm.region).sort((a, b) => Math.hypot(a.location[0] - lon, a.location[1] - lat) - Math.hypot(b.location[0] - lon, b.location[1] - lat))[0] ?? null;
      }
      return json({
        ...envelope(farms),
        farm,
        parcels: (parcels?.value ?? []).filter((p) => p.farmId === farmId),
        predictions,
        cell,
        ...(Object.keys(errors).length ? { errors } : {}),
      });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/parcels",
    handler: async ({ url }) => {
      const r = region(url);
      const crop = param(url, "crop", RX.crop);
      const farm = param(url, "farm", RX.farmId);
      const fields = param(url, "fields");
      if (fields && fields !== "min") throw new HttpError(400, "invalid fields (min)");
      const c = await getParcels();
      const rows = c.value.filter((p) => (!r || r === "both" || (r === "SE_SKANE") === p.farmId.startsWith("S")) && (!crop || p.crop === crop) && (!farm || p.farmId === farm));
      const parcels = fields === "min" ? rows.map((p) => [p.parcelId, p.farmId, p.crop, p.areaHa, p.location[0], p.location[1]]) : rows;
      return json({ ...envelope(c), parcels });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/cells",
    handler: async ({ url }) => {
      const r = region(url);
      const c = await getCells();
      return json({ ...envelope(c), cells: c.value.filter((x) => inRegion(r, x.region)) });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/weather/:cellId",
    handler: async ({ params, url }) => {
      const cellId = pathId(params.cellId, RX.cellId, "cellId");
      const c = await getWeather(cellId, param(url, "from", RX.date), param(url, "to", RX.date));
      return json({ ...envelope(c), cellId, ...c.value });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/climate/:cellId",
    handler: async ({ params, url }) => {
      const cellId = pathId(params.cellId, RX.cellId, "cellId");
      const raw = (param(url, "attrs") ?? "tmean_c,precip_mm").split(",").filter(Boolean);
      const bad = raw.filter((a) => !(CLIMATE_ATTRS as readonly string[]).includes(a));
      if (bad.length || !raw.length) throw new HttpError(400, `invalid attrs (allowed: ${CLIMATE_ATTRS.join(", ")})`);
      const attrs = [...new Set(raw)].sort() as ClimateAttr[];
      const from = param(url, "from", RX.month) ?? "1991-01";
      const to = param(url, "to", RX.month) ?? "2060-12";
      if (from > to) throw new HttpError(400, "from must be <= to");
      const c = await getClimate(cellId, attrs, from, to);
      return json({ ...envelope(c), cellId, attrs: c.value });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/loadlogs",
    handler: async () => {
      const c = await getLoadLogs();
      return json({ ...envelope(c), loadLogs: c.value });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/subscriptions",
    handler: async () => {
      const c = await getSubscriptions();
      return json({ ...envelope(c), subscriptions: c.value });
    },
  },
  {
    method: "GET",
    pattern: "/api/broker/entity/:id",
    handler: async ({ params, url }) => {
      const id = pathId(params.id, RX.entityId, "entity id");
      const opt = param(url, "options") ?? "normalized";
      if (opt !== "normalized" && opt !== "keyValues") throw new HttpError(400, "invalid options (normalized | keyValues)");
      return json(stripKeys(await getEntity(id, opt), new Set(["storedPath"])));
    },
  },

  {
    method: "GET",
    pattern: "/api/live/health",
    handler: async () => {
      const c = await getLiveHealth();
      return json({ ...envelope(c), source: c.value.source, health: c.value.health });
    },
  },
  {
    method: "GET",
    pattern: "/api/live/predictions",
    handler: async ({ url }) => {
      const f = { crop: param(url, "crop", RX.crop), region: region(url), farm: param(url, "farm", RX.farmId), cell: param(url, "cell", RX.cellId) };
      const c = await getPredictions();
      const predictions = filterPredictions(c.value.predictions, f);
      return json({ ...envelope(c), source: c.value.source, count: predictions.length, asOfDate: latestAsOf(predictions), predictions });
    },
  },
  {
    method: "GET",
    pattern: "/api/live/history",
    handler: async ({ url }) => {
      const parcelId = param(url, "parcel", RX.parcelId);
      if (!parcelId) throw new HttpError(400, "parcel is required (e.g. F0001-P03)");
      const c = await getHistory(parcelId);
      return json({ ...envelope(c), parcelId, points: c.value });
    },
  },
  {
    method: "GET",
    pattern: "/api/live/summary",
    handler: async ({ url }) => {
      const r = region(url);
      const c = await getPredictions();
      const rows = filterPredictions(c.value.predictions, { region: r });
      return json({ ...envelope(c), source: c.value.source, asOfDate: latestAsOf(rows), crops: cropSummaries(rows) });
    },
  },
  {
    method: "GET",
    pattern: "/api/live/observations",
    handler: async ({ url }) => {
      const c = await getObservations(param(url, "cell", RX.cellId), param(url, "year", RX.year));
      return json({ ...envelope(c), source: "inference", ...c.value });
    },
  },

  // Real field-parcel shapes (Finland only) from the Finnish Food Authority open WFS.
  { method: "GET", pattern: "/api/geo/fields", handler: ({ url }) => getFieldTile(url) },

  { method: "GET", pattern: "/api/chat/:name", handler: ({ req, params }) => chatMeta(req, params.name ?? "") },
  { method: "POST", pattern: "/api/chat", handler: ({ req, server }) => chatStream(req, server) },

  ...insightRoutes,
];

if (process.env.NODE_ENV !== "production") {
  routes.push({ method: "POST", pattern: "/api/cache/clear", handler: () => (cache.clear(), clearWhatIfCache(), json({ ok: true })) });
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/");
  const b = path.replace(/\/+$/, "").split("/");
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const seg = a[i]!;
    if (seg.startsWith(":")) {
      if (!b[i]) return null;
      params[seg.slice(1)] = b[i]!;
    } else if (seg !== b[i]) return null;
  }
  return params;
}

export type Match = { route: Route; params: Record<string, string> } | { status: 404 | 405; allow?: string[] };

/** Resolve method + path against the allowlist (pure; tested). HEAD is treated as GET. */
export function matchRoute(method: string, path: string, table: Route[] = routes): Match {
  const m = method === "HEAD" ? "GET" : method;
  const allow: string[] = [];
  for (const route of table) {
    const params = matchPattern(route.pattern, path);
    if (!params) continue;
    if (route.method === m) return { route, params };
    allow.push(route.method);
  }
  return allow.length ? { status: 405, allow } : { status: 404 };
}

export async function handleApi(req: Request, server?: Server<unknown>): Promise<Response> {
  const url = new URL(req.url);
  const m = matchRoute(req.method, url.pathname);
  if ("status" in m) {
    if (m.status === 405) return json({ error: `method ${req.method} not allowed` }, 405, { allow: m.allow!.join(", ") });
    return json({ error: `no such route: ${url.pathname}` }, 404);
  }
  try {
    return await m.route.handler({ req, url, params: m.params, server });
  } catch (e) {
    return errorResponse(e);
  }
}
