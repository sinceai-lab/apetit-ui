// Browser side of the chat stream: POST /api/chat (our proxy), read SSE with fetch + ReadableStream.
import { compactHistory, createSSEParser, type AgentEvent, type Msg } from "@/shared/chat";

export interface ChatOptions {
  provider?: string;
  model?: string;
  signal?: AbortSignal;
  onEvent: (ev: AgentEvent) => void;
}

/** Streams one agent run. Resolves when the stream ends; history is compacted (8k tool output, 12 turns). */
export async function streamChat(messages: Msg[], { provider, model, signal, onEvent }: ChatOptions): Promise<void> {
  const body: Record<string, unknown> = { messages: compactHistory(messages) };
  if (provider) body.provider = provider;
  if (model) body.model = model;
  const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    onEvent({ t: "error", message: j?.error ?? `Chat failed (HTTP ${res.status})` });
    onEvent({ t: "end" });
    return;
  }
  const parser = createSSEParser();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let ended = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const ev of parser.push(value)) {
        if (ev.t === "end") ended = true;
        onEvent(ev);
      }
    }
    for (const ev of parser.flush()) onEvent(ev);
  } finally {
    if (!ended) onEvent({ t: "end" });
  }
}
