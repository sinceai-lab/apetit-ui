// Upstream fetch with timeouts + uniform JSON error responses.
import type { Upstream } from "../shared/types";

export class UpstreamError extends Error {
  constructor(
    public upstream: Upstream,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** GET-only upstream fetch. Network failure/timeout -> 503 (service down); bad status -> 502 (or 404 passthrough). */
export async function upstreamGet(upstream: Upstream, url: string, opts: FetchOpts = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { accept: "application/json", ...opts.headers }, signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) });
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    throw new UpstreamError(upstream, 503, `${upstream} ${timeout ? "timed out" : "unreachable"}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try {
      const j = JSON.parse(body);
      detail = j.detail ?? j.title ?? j.error ?? detail;
    } catch {}
    throw new UpstreamError(upstream, res.status === 404 ? 404 : res.status === 503 ? 503 : 502, `${upstream} returned ${res.status}${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
  }
  return res;
}

export async function upstreamJson<T = any>(upstream: Upstream, url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await upstreamGet(upstream, url, opts);
  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError(upstream, 502, `${upstream} returned invalid JSON`);
  }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export function errorResponse(e: unknown): Response {
  if (e instanceof UpstreamError) return json({ error: e.message, upstream: e.upstream }, e.status);
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error("[api] unhandled", e);
  return json({ error: "internal error" }, 500);
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const nowIso = () => new Date().toISOString();
