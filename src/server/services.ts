// Aggregated health of every upstream: parallel polls, 2.5 s timeout each, never hangs.
import type { ServiceState, ServiceStatus, ServicesResponse, SubscriptionRow } from "../shared/types";
import { serviceDefs, type ServiceDef } from "./config";
import { cache, TTL } from "./cache";
import { errMsg, nowIso } from "./http";
import { getLoadLogs, getSubscriptions, getTypeCounts } from "./broker";
import { getLiveHealth } from "./live";
import { buildPipeline } from "./shape";

const POLL_TIMEOUT = 2500;

interface Probe {
  ok: boolean;
  status: number | null;
  text: string;
  latencyMs: number | null;
  error?: string;
}

async function probe(url: string): Promise<Probe> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(POLL_TIMEOUT), redirect: "manual" });
    const text = (await res.text()).slice(0, 4000);
    return { ok: res.status >= 200 && res.status < 400, status: res.status, text, latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    return { ok: false, status: null, text: "", latencyMs: null, error: timeout ? `timed out after ${POLL_TIMEOUT} ms` : "unreachable" };
  }
}

const tryJson = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** Map a raw probe to up/degraded/down plus a one-line detail (pure; tested). */
export function judge(id: string, p: Probe, subs: SubscriptionRow[] | null): { status: ServiceState; detail: string | null } {
  if (!p.ok) return { status: "down", detail: p.error ?? `HTTP ${p.status}` };
  const j = tryJson(p.text);
  const sub = (name: string) => subs?.find((s) => s.id.endsWith(`:${name}`));
  const subBad = (name: string) => {
    const s = sub(name);
    return s && (s.status !== "active" || s.notificationStatus !== "ok") ? `subscription ${s.status}/${s.notificationStatus}` : null;
  };
  switch (id) {
    case "broker":
      return j?.product ? { status: "up", detail: `${j.product} ${j.version ?? ""}`.trim() } : { status: "degraded", detail: "unexpected /version body" };
    case "inference": {
      if (j?.status !== "ok") return { status: "degraded", detail: `status ${j?.status ?? "unknown"}` };
      if (j?.models?.load_error) return { status: "degraded", detail: `model load error: ${String(j.models.load_error).slice(0, 120)}` };
      const bad = subBad("apetit-yield");
      if (bad) return { status: "degraded", detail: bad };
      return { status: "up", detail: `model ${String(j.models?.version ?? "?").slice(0, 8)} · ${j.counters?.notifications ?? 0} notifications` };
    }
    case "backend":
      return j?.status === "ok" ? { status: "up", detail: "ok" } : { status: "degraded", detail: "unexpected /health body" };
    case "weather": {
      const bad = subBad("weather-aggregator");
      if (bad) return { status: "degraded", detail: bad };
      const s = sub("weather-aggregator");
      return { status: "up", detail: s ? `${s.timesSent} notifications received` : "ok" };
    }
    case "chatbot":
      return { status: "up", detail: j ? `auth ${j.authEnabled ? "on" : "off"}` : "ok" };
    case "streamlit":
      return p.text.trim() === "ok" ? { status: "up", detail: "ok" } : { status: "degraded", detail: p.text.slice(0, 80) };
    case "apisix":
      return { status: "up", detail: j?.status ?? "ok" };
    default:
      return { status: "up", detail: `HTTP ${p.status}` };
  }
}

async function check(def: ServiceDef, subs: SubscriptionRow[] | null): Promise<ServiceStatus> {
  let p = await probe(def.healthUrl);
  if (!p.ok && def.fallbackUrl) {
    const f = await probe(def.fallbackUrl);
    if (f.ok) p = f;
  }
  const { status, detail } = judge(def.id, p, subs);
  return { id: def.id, name: def.name, group: def.group, status, latencyMs: p.latencyMs, detail, healthUrl: def.healthUrl, openUrl: def.openUrl, embedUrl: def.embedUrl, checkedAt: nowIso() };
}

/** Await a cached loader with a hard cap so a hung upstream never stalls the services page. */
const settle = async <T>(p: Promise<{ value: T }>, errors: Record<string, string>, key: string, capMs = 4000): Promise<T | null> => {
  try {
    const cap = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${key} slower than ${capMs} ms`)), capMs));
    return (await Promise.race([p, cap])).value;
  } catch (e) {
    errors[key] = errMsg(e);
    return null;
  }
};

export async function getServices(): Promise<ServicesResponse> {
  const { value } = await cache.get("services", TTL.services, async () => {
    const errors: Record<string, string> = {};
    const subsP = settle(getSubscriptions(), errors, "broker");
    const [subs, loadLogs, typeCounts, health] = await Promise.all([subsP, settle(getLoadLogs(), errors, "broker"), settle(getTypeCounts(), errors, "broker"), settle(getLiveHealth(), errors, "inference")]);
    const services = await Promise.all(serviceDefs().map((d) => check(d, subs)));
    const pipeline = buildPipeline({ loadLogs, typeCounts, subscriptions: subs, health: health?.health ?? null });
    pipeline.broker.up = services.find((s) => s.id === "broker")?.status !== "down" && typeCounts != null;
    const res: ServicesResponse = { services, pipeline, checkedAt: nowIso() };
    if (Object.keys(errors).length) res.errors = errors;
    return res;
  });
  return value;
}
