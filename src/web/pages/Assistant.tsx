// Corner assistant over the FIWARE chat-bot (contract §4.4): a launcher in the bottom-right corner that opens a compact
// panel, which can expand to a large view. Both views read the same ChatProvider, so the conversation carries over.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, CircleStop, FileSearch, Loader2, Maximize2, MessageSquarePlus, Minimize2, SendHorizontal, User, X } from "lucide-react";
import { STARTER_PROMPTS } from "@/shared/chat";
import type { PageProps } from "./types";
import { cn } from "../lib/cn";
import { navigate } from "../lib/router";
import { Button } from "../components/ui";
import { AMark } from "../components/shell/Brand";
import { Markdown } from "./assistant/Markdown";
import { ToolSteps } from "./assistant/ToolSteps";
import { useChat } from "./assistant/ChatProvider";
import { sourcesOf, type SourceEntity, type Turn } from "./assistant/turns";
import { SourceDrawer } from "./farm/SourceDrawer";

const ADVISOR_PROMPTS = ["Which farms grow peas in FI?", "What was the rain in June for cell GF0104?", ...STARTER_PROMPTS.slice(0, 4)];

/** Old /assistant links: open the expanded assistant and go back to the overview. */
export function AssistantPage(_: PageProps) {
  const { setView } = useChat();
  useEffect(() => {
    setView("expanded");
    navigate("/", undefined, { replace: true });
  }, [setView]);
  return null;
}

export function ChatWidget() {
  const chat = useChat();
  const { view, setView, turns, busy, bot } = chat;

  // Esc shrinks the expanded view, then closes the compact one.
  useEffect(() => {
    if (view === "closed") return;
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement | null)?.closest("#global-search") || document.querySelector("[data-drawer]")) return;
      setView(view === "expanded" ? "compact" : "closed");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [view, setView]);

  if (view === "closed")
    return (
      <button
        type="button"
        onClick={() => setView("compact")}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2.5 rounded-full border border-border bg-surface py-2 pl-2 pr-4 font-heading text-sm font-bold text-heading shadow-lg transition-transform hover:-translate-y-0.5 hover:border-brand md:bottom-6 md:right-6"
        aria-label="Open the Apetit assistant"
      >
        <span className="relative grid size-9 place-items-center rounded-full bg-brand-soft">
          <AMark className="size-6" />
          {(busy || turns.length > 0) && <span aria-hidden className={cn("absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface", busy ? "animate-pulse bg-rapeseed" : "bg-brand")} />}
        </span>
        Ask the assistant
        {bot?.status === "down" && <span className="text-xs font-medium text-muted">(offline)</span>}
      </button>
    );

  const expanded = view === "expanded";
  return (
    <>
      {expanded && <button type="button" aria-label="Shrink the assistant" className="fixed inset-0 z-40 bg-black/30" onClick={() => setView("compact")} />}
      <section
        role="dialog"
        aria-label="Apetit assistant"
        aria-modal={expanded || undefined}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-2xl",
          expanded
            ? "inset-2 sm:inset-4 md:inset-y-6 md:left-[calc(15rem+1.5rem)] md:right-6"
            : "inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] top-16 sm:inset-x-auto sm:right-4 sm:top-auto sm:h-[min(640px,calc(100dvh-7rem))] sm:w-[400px] md:bottom-6 md:right-6",
        )}
      >
        <ChatHeader />
        <ChatBody />
        <ChatComposer />
      </section>
    </>
  );
}

function ChatHeader() {
  const { view, setView, newChat, turns, busy, bot } = useChat();
  const expanded = view === "expanded";
  const status = bot?.status ?? "unknown";
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-card border border-border bg-surface">
        <AMark className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-heading text-[15px] font-bold leading-tight text-heading">Apetit assistant</div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className={cn("size-1.5 rounded-full", status === "up" ? "bg-up" : status === "down" ? "bg-down" : status === "degraded" ? "bg-degraded" : "bg-muted")} />
          {status === "up" ? "Online · reads the live farm data" : status === "down" ? "Offline" : "Checking…"}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <IconBtn label="New chat" onClick={newChat} disabled={!turns.length && !busy}>
          <MessageSquarePlus className="size-4" />
        </IconBtn>
        <IconBtn label={expanded ? "Shrink to the corner" : "Expand"} onClick={() => setView(expanded ? "compact" : "expanded")}>
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </IconBtn>
        <IconBtn label="Close (the conversation is kept)" onClick={() => setView("closed")}>
          <X className="size-4" />
        </IconBtn>
      </div>
    </header>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className="rounded-card p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40">
      {children}
    </button>
  );
}

function ChatBody() {
  const { turns, busy, thinking, send, bot, view } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const expanded = view === "expanded";
  const botDown = bot?.status === "down";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = !turns.length ? 0 : stickRef.current ? el.scrollHeight : el.scrollTop;
  }, [turns, thinking]);
  // Jump to the latest message when the view changes size.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && turns.length) el.scrollTop = el.scrollHeight;
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = groupTurns(turns, busy);
  const last = turns[turns.length - 1];
  const showThinking = busy && (thinking || !(last?.kind === "assistant" && !last.done));

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto bg-bg px-3 py-4 sm:px-4"
      aria-live="polite"
      aria-busy={busy}
    >
      <div className={cn("mx-auto", expanded && "max-w-3xl")}>
        {botDown && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-card border border-berry/40 border-l-4 border-l-berry bg-berry-soft px-3 py-2 text-sm text-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-berry" aria-hidden />
            <span>
              The chat-bot is not answering right now. {bot?.detail ?? ""} <a className="link" href="#/services">Check services</a>
            </span>
          </div>
        )}
        {!turns.length ? (
          <Starters onPick={(p) => void send(p)} disabled={busy || botDown} wide={expanded} />
        ) : (
          <ol className="space-y-5">
            {groups.map((g, i) =>
              g.kind === "tools" ? (
                <li key={i} className="pl-10">
                  <ToolSteps steps={g.steps} running={busy && i === groups.length - 1} />
                </li>
              ) : (
                <li key={i}>
                  <TurnView turn={g.turn} />
                  {g.sources && <SourceButton sources={g.sources} />}
                </li>
              ),
            )}
            {showThinking && (
              <li className="flex items-center gap-2 pl-10 text-sm text-muted" role="status">
                <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
                {last?.kind === "tool" && !last.result ? "Looking in the data…" : "Thinking…"}
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}

function ChatComposer() {
  const { input, setInput, send, stop, busy, bot, model, mcp, view, focusTick } = useChat();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const botDown = bot?.status === "down";
  const expanded = view === "expanded";

  useEffect(() => {
    inputRef.current?.focus();
  }, [view, focusTick]);

  // Grow with the text up to the max height; only scroll (thin bar) once it is capped.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    const full = el.scrollHeight + border;
    const max = parseFloat(getComputedStyle(el).maxHeight) || Infinity;
    el.style.height = `${Math.min(full, max)}px`;
    el.style.overflowY = full > max ? "auto" : "hidden";
  }, [input, view]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <form
      className="border-t border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send(input);
      }}
    >
      <div className={cn("mx-auto", expanded && "max-w-3xl")}>
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">Your question</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={botDown ? "The chat-bot is offline" : "Ask about the farm data…"}
            disabled={botDown}
            className="field chat-input max-h-40 min-h-[44px] flex-1 resize-none overflow-y-hidden px-3 py-2.5 text-[15px] leading-[22px] placeholder:text-muted disabled:opacity-60"
          />
          {busy ? (
            <Button variant="danger" onClick={stop} className="h-[44px] px-3.5" title="Stop the answer" aria-label="Stop the answer">
              <CircleStop className="size-4" aria-hidden />
              {expanded && "Stop"}
            </Button>
          ) : (
            <Button type="submit" variant="primary" className="h-[44px] px-4" disabled={!input.trim() || botDown} aria-label="Ask">
              <SendHorizontal className="size-4" aria-hidden />
              {expanded && "Ask"}
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          AI answers from the live broker data can be wrong, so check important numbers on the Live season and Farm pages.
          {expanded && model ? ` · ${model}` : ""}
          {mcp && mcp.status !== "up" ? ` · MCP server ${mcp.status}` : ""}
        </p>
      </div>
    </form>
  );
}

type Group = { kind: "turn"; turn: Turn; sources?: SourceEntity[] } | { kind: "tools"; steps: Extract<Turn, { kind: "tool" }>[] };
function groupTurns(turns: Turn[], busy = false): Group[] {
  const out: Group[] = [];
  for (const t of turns) {
    if (t.kind === "assistant" && !t.text.trim()) continue;
    const prev = out[out.length - 1];
    if (t.kind === "tool") {
      if (prev?.kind === "tools") prev.steps.push(t);
      else out.push({ kind: "tools", steps: [t] });
    } else out.push({ kind: "turn", turn: t });
  }
  // One response = everything between two user turns. Its last finished answer gets the Source button,
  // listing the broker entities its data lookups returned.
  let start = 0;
  for (let i = 0; i <= out.length; i++) {
    const g = out[i];
    if (i < out.length && !(g!.kind === "turn" && g!.turn.kind === "user")) continue;
    const resp = out.slice(start, i);
    // The response still being written gets its Source button once it is finished.
    const streaming = busy && i === out.length;
    const lastAnswer = streaming ? undefined : [...resp].reverse().find((x) => x.kind === "turn" && x.turn.kind === "assistant" && x.turn.done) as Extract<Group, { kind: "turn" }> | undefined;
    if (lastAnswer) {
      const results = resp.flatMap((x) => (x.kind === "tools" ? x.steps.map((s) => s.result) : []));
      const text = resp.map((x) => (x.kind === "turn" && x.turn.kind === "assistant" ? x.turn.text : "")).join("\n");
      const sources = sourcesOf(results, text);
      if (sources.length) lastAnswer.sources = sources;
    }
    start = i + 1;
  }
  return out;
}

function Avatar({ who }: { who: "user" | "bot" }) {
  return (
    <span aria-hidden className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-card border", who === "user" ? "border-border bg-surface-2 text-muted" : "border-border bg-surface")}>
      {who === "user" ? <User className="size-4" /> : <AMark className="size-5" />}
    </span>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.kind === "user")
    return (
      <div className="flex flex-row-reverse items-start gap-2">
        <Avatar who="user" />
        <div className="max-w-[85%] whitespace-pre-wrap rounded-card rounded-tr-[2px] bg-brand px-3.5 py-2 text-[15px] leading-relaxed text-brand-contrast">
          <span className="sr-only">You: </span>
          {turn.text}
        </div>
      </div>
    );
  if (turn.kind === "assistant")
    return (
      <div className="flex items-start gap-2">
        <Avatar who="bot" />
        <div className="min-w-0 max-w-[92%] rounded-card rounded-tl-[2px] border border-border bg-surface px-3.5 py-2.5 text-ink">
          <span className="sr-only">Assistant: </span>
          <Markdown text={turn.text} />
          {!turn.done && <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand align-middle" />}
        </div>
      </div>
    );
  if (turn.kind === "error")
    return (
      <div role="alert" className="ml-10 flex items-start gap-2 rounded-card border border-berry/40 border-l-4 border-l-berry bg-berry-soft px-3 py-2 text-sm text-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-berry" aria-hidden />
        <span>
          <b className="font-medium">The assistant stopped:</b> {turn.message}
        </span>
      </div>
    );
  if (turn.kind === "stopped") return <div className="ml-10 text-xs text-muted">Stopped. Ask again or start a new chat.</div>;
  return null;
}

/** Same "Source" button and drawer as the farm page, for the records this answer was built from. */
function SourceButton({ sources }: { sources: SourceEntity[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-10 mt-2">
      <Button onClick={() => setOpen(true)} className="px-3 py-1 text-xs" title="See which broker records and CSV files this answer is based on">
        <FileSearch className="size-3.5" aria-hidden /> Source
        <span className="text-muted">· {sources.length === 1 ? sources[0]!.label : `${sources.length} records`}</span>
      </Button>
      {open && <SourceDrawer open onClose={() => setOpen(false)} entities={sources} />}
    </div>
  );
}

function Starters({ onPick, disabled, wide }: { onPick: (p: string) => void; disabled: boolean; wide: boolean }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <AMark className="size-12" />
      <div className="eyebrow mt-3">Ask the live data</div>
      <h2 className="font-display mt-1 text-lg font-bold text-heading">What would you like to know?</h2>
      <p className="mt-1 text-sm text-muted">Try a question advisors often ask, or type your own.</p>
      <div className={cn("mt-4 grid w-full gap-2", wide && "sm:grid-cols-2")}>
        {(wide ? ADVISOR_PROMPTS : ADVISOR_PROMPTS.slice(0, 4)).map((p) => (
          <button key={p} type="button" disabled={disabled} onClick={() => onPick(p)} className="btn btn-outline justify-start px-3.5 py-2.5 text-left text-sm">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
