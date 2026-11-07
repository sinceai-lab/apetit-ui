// Chat-bot pass-through: GET metadata routes and a non-buffering POST /api/chat SSE stream.
import type { Server } from "bun";
import { config } from "./config";
import { json } from "./http";

export const CHAT_BODY_LIMIT = 1_000_000;
const META = new Set(["me", "providers", "prompts"]);

function forwardCookies(req: Request): Record<string, string> {
  const c = req.headers.get("cookie");
  return c ? { cookie: c } : {};
}

function withSetCookie(up: Response, headers: Headers) {
  for (const sc of up.headers.getSetCookie?.() ?? []) headers.append("set-cookie", sc);
}

const down = () => json({ error: "chat-bot unreachable", upstream: "chatbot" }, 503);

export async function chatMeta(req: Request, name: string): Promise<Response> {
  if (!META.has(name)) return json({ error: "not found" }, 404);
  let up: Response;
  try {
    up = await fetch(`${config.chatbotUrl}/api/${name}`, { headers: { accept: "application/json", ...forwardCookies(req) }, signal: AbortSignal.timeout(5000) });
  } catch {
    return down();
  }
  const headers = new Headers({ "content-type": up.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
  withSetCookie(up, headers);
  return new Response(await up.arrayBuffer(), { status: up.status, headers });
}

export async function chatStream(req: Request, server: Server<unknown> | undefined): Promise<Response> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > CHAT_BODY_LIMIT) return json({ error: "request body too large" }, 413);
  const body = await req.text();
  if (body.length > CHAT_BODY_LIMIT) return json({ error: "request body too large" }, 413);
  try {
    const parsed = JSON.parse(body);
    if (!parsed || !Array.isArray(parsed.messages)) return json({ error: "body must be {messages: Msg[]}" }, 400);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  server?.timeout(req, 0);
  let up: Response;
  try {
    up = await fetch(`${config.chatbotUrl}/api/chat`, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", accept: "text/event-stream", ...forwardCookies(req) },
      signal: req.signal,
    });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return down();
  }
  const isStream = (up.headers.get("content-type") ?? "").includes("text/event-stream");
  const headers = new Headers(
    isStream
      ? { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" }
      : { "content-type": up.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  );
  withSetCookie(up, headers);
  return new Response(up.body, { status: up.status, headers });
}
