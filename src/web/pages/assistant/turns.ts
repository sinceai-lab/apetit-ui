// Displayed conversation turns and how they map to the chat-bot's wire history (contract §4.2).
import type { Msg, ToolCall, ToolResult } from "@/shared/chat";

export type Turn =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; done: boolean }
  | { kind: "tool"; call: ToolCall; result?: ToolResult }
  | { kind: "error"; message: string }
  | { kind: "stopped" };

/** Mirrors the reference client's wireHistory; errors, stop notes and empty bubbles are not sent. */
export function wireHistory(all: Turn[]): Msg[] {
  const msgs: Msg[] = [];
  let i = 0;
  while (i < all.length) {
    const t = all[i]!;
    if (t.kind === "user") {
      msgs.push({ role: "user", text: t.text });
      i++;
    } else if (t.kind === "assistant") {
      if (t.text.trim()) msgs.push({ role: "assistant", text: t.text });
      i++;
    } else if (t.kind === "tool") {
      const calls: ToolCall[] = [];
      const results: ToolResult[] = [];
      while (i < all.length && all[i]!.kind === "tool") {
        const tt = all[i] as Extract<Turn, { kind: "tool" }>;
        // A call without a result (stopped mid-run) would be rejected by the provider; drop it.
        if (tt.result) {
          calls.push(tt.call);
          results.push(tt.result);
        }
        i++;
      }
      if (calls.length) {
        msgs.push({ role: "assistant", text: "", toolCalls: calls });
        msgs.push({ role: "tool", results });
      }
    } else i++;
  }
  return msgs;
}

/** Friendly one-line summary of a tool call's arguments, e.g. "Farm · 680 found". */
export function argSummary(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const k of ["entityType", "type", "entityId", "id", "filter", "q", "query", "name", "model"]) {
    const v = args[k];
    if (typeof v === "string" && v) parts.push(v.length > 60 ? v.slice(0, 57) + "…" : v);
  }
  return parts.slice(0, 2).join(" · ");
}

/** Pull a total count from a tool result when the MCP server reports one. */
export function resultSummary(r: ToolResult | undefined): string | null {
  if (!r) return null;
  if (r.isError) return "failed";
  const m = r.content.match(/"total"\s*:\s*(\d+)/);
  if (m) return `${Number(m[1]).toLocaleString("en-GB")} found`;
  const kb = r.content.length / 1024;
  return kb >= 1 ? `${kb.toFixed(0)} KB of data` : "done";
}

/** A broker entity a chat answer was based on, for the provenance (Source) drawer. */
export interface SourceEntity {
  id: string;
  label: string;
}

// NGSI-LD ids in tool output, e.g. "urn:ngsi-ld:Farm:F0001" or "urn:ngsi-ld:Parcel:F0001-P03".
const ENTITY_RX = /urn:ngsi-ld:([A-Za-z][A-Za-z0-9]*):([A-Za-z0-9][A-Za-z0-9_.\-]*)/g;
// Bookkeeping types, not data the answer is about.
const SKIP_TYPES = new Set(["LoadLog", "EntityTypeList", "Subscription"]);
const MAX_SOURCES = 40;

/** Entities found in an answer's tool results; those the answer text names come first. */
export function sourcesOf(results: (ToolResult | undefined)[], answerText: string): SourceEntity[] {
  const seen = new Map<string, SourceEntity & { order: number }>();
  let order = 0;
  for (const r of results) {
    if (!r || r.isError) continue;
    for (const m of r.content.matchAll(ENTITY_RX)) {
      const [id, type, local] = m as unknown as [string, string, string];
      if (SKIP_TYPES.has(type) || seen.has(id)) continue;
      seen.set(id, { id, label: `${type.replace(/([a-z])([A-Z])/g, "$1 $2")} ${local}`, order: order++ });
    }
  }
  const text = answerText.toLowerCase();
  const named = (e: SourceEntity) => text.includes(e.label.split(" ").pop()!.toLowerCase());
  return [...seen.values()]
    .sort((a, b) => Number(named(b)) - Number(named(a)) || a.order - b.order)
    .slice(0, MAX_SOURCES)
    .map(({ id, label }) => ({ id, label }));
}
