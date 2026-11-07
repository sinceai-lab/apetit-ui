// Native, themed chat over the FIWARE chat-bot (contract §4.4): streaming text, tool steps, stop, new chat.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, CircleStop, Info, Loader2, MessageSquarePlus, SendHorizontal, User } from "lucide-react";
import { STARTER_PROMPTS, type AgentEvent } from "@/shared/chat";
import type { PageProps } from "./types";
import { getJson } from "../lib/api";
import { useServices } from "../lib/appData";
import { useApi } from "../lib/usePoll";
import { streamChat } from "../lib/chatClient";
import { cn } from "../lib/cn";
import { Badge, Button, Card, StatusBadge } from "../components/ui";
import { AMark } from "../components/shell/Brand";
import { Markdown } from "./assistant/Markdown";
import { ToolSteps } from "./assistant/ToolSteps";
import { wireHistory, type Turn } from "./assistant/turns";

interface Providers {
  providers: { id: string; models: string[]; default: string }[];
  default: string;
}

const ADVISOR_PROMPTS = ["Which farms grow peas in FI?", "What was the rain in June for cell GF0104?", ...STARTER_PROMPTS.slice(0, 4)];
const STORE_KEY = "apetit.chat.v1";

const loadTurns = (): Turn[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((t) => t && typeof t.kind === "string").map((t) => (t.kind === "assistant" ? { ...t, done: true } : t)) : [];
  } catch {
    return [];
  }
};
const saveTurns = (turns: Turn[]) => {
  try {
    // Keep the per-tab copy small: tool output is only kept up to 8k characters.
    const slim = turns.map((t) => (t.kind === "tool" && t.result && t.result.content.length > 8000 ? { ...t, result: { ...t.result, content: t.result.content.slice(0, 8000) + "\n…[truncated]" } } : t));
    sessionStorage.setItem(STORE_KEY, JSON.stringify(slim));
  } catch {}
};

export function AssistantPage(_: PageProps) {
  const services = useServices();
  const bot = services.data?.services.find((s) => s.id === "chatbot");
  const mcp = services.data?.services.find((s) => s.id === "mcp");
  const providers = useApi((s) => getJson<Providers>("/api/chat/providers", undefined, s), []);
  const provider = providers.data?.providers.find((p) => p.id === providers.data?.default);
  const model = provider?.default ?? null;

  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!busy) saveTurns(turns);
  }, [turns, busy]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = scrollRef.current;
    // Empty state starts at the top so the welcome header stays visible.
    if (el) el.scrollTop = !turns.length ? 0 : stickRef.current ? el.scrollHeight : el.scrollTop;
  }, [turns, thinking]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      let acc: Turn[] = [...turns, { kind: "user", text: q }];
      const history = wireHistory(acc);
      setTurns(acc);
      setInput("");
      setBusy(true);
      setThinking(true);
      stickRef.current = true;
      const run = ++runRef.current;
      // A newer run (or New chat) owns the transcript; late events from this one are dropped.
      const apply = (fn: (p: Turn[]) => Turn[]) => {
        if (run !== runRef.current) return;
        acc = fn(acc);
        setTurns(acc);
      };
      const closeOpen = () => apply((p) => p.map((t, i) => (i === p.length - 1 && t.kind === "assistant" && !t.done ? { ...t, done: true } : t)));
      let open = false;
      const ac = new AbortController();
      abortRef.current = ac;
      const onEvent = (e: AgentEvent) => {
        if (e.t === "token") {
          setThinking(false);
          if (!open) {
            apply((p) => [...p, { kind: "assistant", text: "", done: false }]);
            open = true;
          }
          apply((p) => p.map((t, i) => (i === p.length - 1 && t.kind === "assistant" ? { ...t, text: t.text + e.text } : t)));
        } else if (e.t === "assistant_done") {
          if (open) closeOpen();
          else if (e.text.trim()) apply((p) => [...p, { kind: "assistant", text: e.text, done: true }]);
          open = false;
          setThinking(true);
        } else if (e.t === "tool_call") {
          if (open) closeOpen();
          open = false;
          apply((p) => [...p, { kind: "tool", call: e.call }]);
          setThinking(true);
        } else if (e.t === "tool_result") {
          apply((p) => p.map((t) => (t.kind === "tool" && t.call.id === e.result.id ? { ...t, result: e.result } : t)));
        } else if (e.t === "error") {
          if (open) closeOpen();
          open = false;
          apply((p) => [...p, { kind: "error", message: e.message }]);
        } else if (e.t === "end") {
          setThinking(false);
        }
      };
      try {
        await streamChat(history, { signal: ac.signal, provider: providers.data?.default, onEvent });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") apply((p) => [...p, { kind: "stopped" }]);
        else apply((p) => [...p, { kind: "error", message: "The chat-bot could not be reached. Check the Services page." }]);
      } finally {
        if (open) closeOpen();
        if (run === runRef.current) {
          abortRef.current = null;
          setBusy(false);
          setThinking(false);
          inputRef.current?.focus();
        }
      }
    },
    [turns, busy, providers.data?.default],
  );

  const stop = () => abortRef.current?.abort();
  const newChat = () => {
    runRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setThinking(false);
    setTurns([]);
    setInput("");
    inputRef.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const botDown = bot?.status === "down";
  const groups = groupTurns(turns);
  const last = turns[turns.length - 1];
  const showThinking = busy && (thinking || !(last?.kind === "assistant" && !last.done));

  return (
    <div className="flex flex-col">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-card border border-border bg-surface sm:size-14">
            <AMark className="size-8 sm:size-10" />
          </span>
          <div className="min-w-0">
            <div className="eyebrow">Field Navigator · AI</div>
            <h1 className="font-title text-2xl font-semibold leading-tight text-heading sm:text-[32px]">Apetit assistant</h1>
            <p className="mt-1 max-w-3xl text-[15px] text-muted">Ask questions in plain language. The assistant looks things up in the live farm data for you.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bot && <StatusBadge status={bot.status} label={`Chat-bot ${bot.status === "up" ? "online" : bot.status}`} />}
          <Button variant="outline" onClick={newChat} disabled={!turns.length && !busy} title="Start a new conversation">
            <MessageSquarePlus className="size-4" aria-hidden />
            New chat
          </Button>
        </div>
      </header>

      <div role="note" className="mb-4 flex items-start gap-3 rounded-card border border-border border-l-4 border-l-brand-vivid bg-brand-soft px-4 py-3 text-sm text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <p>
          <span className="font-heading font-bold text-heading">Check the numbers. </span>
          Answers are written by an AI model that reads the <b className="font-medium">live broker data</b> through a FIWARE MCP server. It can misread data or make mistakes, so check important numbers on the{" "}
          <a className="link text-brand-strong" href="#/season">Live season</a> and <a className="link text-brand-strong" href="#/farm">Farm</a> pages. Every question is sent to the model provider and costs a little.
        </p>
      </div>

      {botDown && (
        <Card className="mb-4 flex items-start gap-3 border-berry/40 border-l-4 border-l-berry p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-berry" aria-hidden />
          <div className="text-sm">
            <div className="font-heading font-bold text-heading">The chat-bot is not answering right now</div>
            <div className="text-muted">
              {bot?.detail ?? "No response from localhost:3006."} You can still browse the data on the other pages. <a className="link" href="#/services">Check services</a>
            </div>
          </div>
        </Card>
      )}

      <Card className="flex min-h-[420px] flex-col overflow-hidden border-t-[3px] border-t-brand-vivid">
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="relative max-h-[calc(100dvh-360px)] min-h-[320px] flex-1 overflow-y-auto px-3 py-4 sm:px-5"
          aria-live="polite"
          aria-busy={busy}
        >
          {!turns.length ? (
            <Starters onPick={(p) => void send(p)} disabled={busy || botDown} />
          ) : (
            <ol className="space-y-4">
              {groups.map((g, i) =>
                g.kind === "tools" ? (
                  <li key={i} className="pl-11">
                    <ToolSteps steps={g.steps} running={busy && i === groups.length - 1} />
                  </li>
                ) : (
                  <li key={i}>
                    <TurnView turn={g.turn} />
                  </li>
                ),
              )}
              {showThinking && (
                <li className="flex items-center gap-2 pl-11 text-sm text-muted" role="status">
                  <Loader2 className="size-4 animate-spin text-brand-vivid" aria-hidden />
                  {last?.kind === "tool" && !last.result ? "Looking in the data…" : "Thinking…"}
                </li>
              )}
            </ol>
          )}
        </div>

        <form
          className="border-t border-border bg-surface-2 p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <label htmlFor="chat-input" className="sr-only">Your question</label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={botDown ? "The chat-bot is offline" : "Ask about farms, yields or weather…"}
              disabled={botDown}
              className="field max-h-40 min-h-[46px] flex-1 resize-y px-3.5 py-2.5 text-[15px] placeholder:text-muted disabled:opacity-60"
            />
            {busy ? (
              <Button variant="danger" onClick={stop} className="h-[46px] px-4 text-[15px]" title="Stop the answer">
                <CircleStop className="size-4" aria-hidden />
                Stop
              </Button>
            ) : (
              <Button type="submit" variant="primary" className="h-[46px] px-5 text-[15px]" disabled={!input.trim() || botDown}>
                <SendHorizontal className="size-4" aria-hidden />
                <span className="hidden sm:inline">Ask</span>
              </Button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>
              Answers come from the live broker via the FIWARE chat-bot{model ? ` · ${model}` : ""}
              {mcp && mcp.status !== "up" ? " · MCP server " + mcp.status : ""}
            </span>
            <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
          </div>
        </form>
      </Card>
    </div>
  );
}

type Group = { kind: "turn"; turn: Turn } | { kind: "tools"; steps: Extract<Turn, { kind: "tool" }>[] };
function groupTurns(turns: Turn[]): Group[] {
  const out: Group[] = [];
  for (const t of turns) {
    if (t.kind === "assistant" && !t.text.trim()) continue;
    const prev = out[out.length - 1];
    if (t.kind === "tool") {
      if (prev?.kind === "tools") prev.steps.push(t);
      else out.push({ kind: "tools", steps: [t] });
    } else out.push({ kind: "turn", turn: t });
  }
  return out;
}

function Avatar({ who }: { who: "user" | "bot" }) {
  return (
    <span aria-hidden className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border", who === "user" ? "border-border bg-surface-2 text-muted" : "border-border bg-surface")}>
      {who === "user" ? <User className="size-4" /> : <AMark className="size-6" />}
    </span>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.kind === "user")
    return (
      <div className="flex flex-row-reverse items-start gap-2">
        <Avatar who="user" />
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-[2px] bg-brand px-4 py-2.5 text-[15px] leading-relaxed text-brand-contrast">
          <span className="sr-only">You: </span>
          {turn.text}
        </div>
      </div>
    );
  if (turn.kind === "assistant")
    return (
      <div className="flex items-start gap-2">
        <Avatar who="bot" />
        <div className="min-w-0 max-w-[92%] rounded-2xl rounded-tl-[2px] border border-border bg-surface px-4 py-3 text-ink">
          <span className="sr-only">Assistant: </span>
          <Markdown text={turn.text} />
          {!turn.done && <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand-vivid align-middle" />}
        </div>
      </div>
    );
  if (turn.kind === "error")
    return (
      <div role="alert" className="ml-11 flex items-start gap-2 rounded-card border border-berry/40 border-l-4 border-l-berry bg-berry-soft px-3 py-2 text-sm text-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-berry" aria-hidden />
        <span>
          <b className="font-medium">The assistant stopped:</b> {turn.message}
        </span>
      </div>
    );
  if (turn.kind === "stopped") return <div className="ml-11 text-xs text-muted">Stopped. Ask again or start a new chat.</div>;
  return null;
}

function Starters({ onPick, disabled }: { onPick: (p: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center">
      <AMark className="size-14" />
      <div className="eyebrow mt-4">Ask the live data</div>
      <h2 className="font-display mt-1 text-xl font-bold text-heading sm:text-2xl">What would you like to know?</h2>
      <p className="mt-1 text-[15px] text-muted">Try one of these questions advisors often ask, or type your own.</p>
      <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
        {ADVISOR_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onPick(p)}
            className="btn btn-outline justify-start px-4 py-3 text-left text-[15px]"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Badge tone="neutral">Data season 2027 (simulated)</Badge>
      </div>
    </div>
  );
}

