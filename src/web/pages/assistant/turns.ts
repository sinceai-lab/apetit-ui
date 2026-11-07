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
