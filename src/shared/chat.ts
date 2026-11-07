// Chat-bot wire protocol (contract §4): stateless Msg[] history, one `data: <json>` line per SSE event.

export type ToolCall = { id: string; name: string; args: Record<string, unknown>; extra?: unknown };
export type ToolResult = { id: string; content: string; isError: boolean };
export type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

export type AgentEvent =
  | { t: "token"; text: string }
  | { t: "assistant_done"; text: string }
  | { t: "tool_call"; call: ToolCall }
  | { t: "tool_result"; result: ToolResult }
  | { t: "error"; message: string }
  | { t: "end" };

export const TOOL_RESULT_HISTORY_CHARS = 8000;
export const TOOL_RESULT_DISPLAY_CHARS = 4000;
export const MAX_USER_TURNS = 12;

export const STARTER_PROMPTS = [
  "How many contract farms grow pea in Finland?",
  "Which grid cells have the most contract parcels?",
  "Show the yield estimate vs baseline for farm F0001",
  "What does a Parcel record contain?",
  "Which turnip rape parcels in Sweden are furthest below their usual yield?",
];

export function toolLabel(name: string): string {
  if (name === "query_entities") return "Looking up entities";
  if (name === "discover_context_meta_data") return "Checking what data exists";
  if (name === "read_data_model" || name === "list_data_models") return "Reading the data model";
  return name;
}

// Incremental SSE parser: feed text chunks, get complete events back.
// Events are separated by a blank line; only `data:` lines are used.
export function createSSEParser() {
  let buf = "";
  return {
    push(chunk: string): AgentEvent[] {
      buf += chunk.replace(/\r\n/g, "\n");
      const out: AgentEvent[] = [];
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = parseBlock(block);
        if (ev) out.push(ev);
      }
      return out;
    },
    flush(): AgentEvent[] {
      const ev = buf.trim() ? parseBlock(buf) : null;
      buf = "";
      return ev ? [ev] : [];
    },
  };
}

function parseBlock(block: string): AgentEvent | null {
  const data = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return null;
  try {
    const ev = JSON.parse(data);
    return ev && typeof ev.t === "string" ? (ev as AgentEvent) : null;
  } catch {
    return null;
  }
}

/** Cost control for re-sent history: truncate tool output and keep the last N user turns. */
export function compactHistory(msgs: Msg[], maxChars = TOOL_RESULT_HISTORY_CHARS, maxUserTurns = MAX_USER_TURNS): Msg[] {
  const userIdx: number[] = [];
  msgs.forEach((m, i) => m.role === "user" && userIdx.push(i));
  const start = userIdx.length > maxUserTurns ? userIdx[userIdx.length - maxUserTurns]! : 0;
  return msgs.slice(start).map((m) =>
    m.role === "tool"
      ? { role: "tool", results: m.results.map((r) => ({ ...r, content: r.content.length > maxChars ? r.content.slice(0, maxChars) + "\n…[truncated]" : r.content })) }
      : m,
  );
}
