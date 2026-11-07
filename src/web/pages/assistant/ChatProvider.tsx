// App-level chat state for the corner assistant: the transcript and the running stream live here,
// so switching pages or between the compact and expanded views never drops the conversation.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentEvent } from "@/shared/chat";
import type { ServiceStatus } from "@/shared/types";
import { getJson } from "../../lib/api";
import { useServices } from "../../lib/appData";
import { streamChat } from "../../lib/chatClient";
import { useApi } from "../../lib/usePoll";
import { wireHistory, type Turn } from "./turns";

interface Providers {
  providers: { id: string; models: string[]; default: string }[];
  default: string;
}

export type ChatView = "closed" | "compact" | "expanded";

interface ChatCtx {
  turns: Turn[];
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  thinking: boolean;
  send: (text: string) => Promise<void>;
  /** Open the assistant (keeping the expanded view if it's already big) and send `text`. While a run is going,
   *  the question is put in the composer instead so it isn't dropped. */
  ask: (text: string) => void;
  stop: () => void;
  newChat: () => void;
  view: ChatView;
  setView: (v: ChatView) => void;
  model: string | null;
  bot: ServiceStatus | undefined;
  mcp: ServiceStatus | undefined;
  /** Bumped after a run ends so the panel can refocus its input. */
  focusTick: number;
}

const STORE_KEY = "apetit.chat.v1";
const VIEW_KEY = "apetit.chat.view";

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
const loadView = (): ChatView => {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    return v === "compact" || v === "expanded" ? v : "closed";
  } catch {
    return "closed";
  }
};

const Ctx = createContext<ChatCtx | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const bot = services.data?.services.find((s) => s.id === "chatbot");
  const mcp = services.data?.services.find((s) => s.id === "mcp");
  const [view, setViewState] = useState<ChatView>(loadView);
  // Providers are only asked for once the chat has been opened (then kept).
  const [opened, setOpened] = useState(view !== "closed");
  const providers = useApi((s) => getJson<Providers>("/api/chat/providers", undefined, s), [], { enabled: opened });
  const model = providers.data?.providers.find((p) => p.id === providers.data?.default)?.default ?? null;

  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  const setView = useCallback((v: ChatView) => {
    setViewState(v);
    if (v !== "closed") setOpened(true);
    try {
      sessionStorage.setItem(VIEW_KEY, v);
    } catch {}
  }, []);

  useEffect(() => {
    if (!busy) saveTurns(turns);
  }, [turns, busy]);
  useEffect(() => () => abortRef.current?.abort(), []);

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
          setFocusTick((n) => n + 1);
        }
      }
    },
    [turns, busy, providers.data?.default],
  );

  const ask = useCallback(
    (text: string) => {
      if (view === "closed") setView("compact");
      if (busy) {
        setInput(text);
        setFocusTick((n) => n + 1);
        return;
      }
      void send(text);
    },
    [view, busy, send, setView],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const newChat = useCallback(() => {
    runRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setThinking(false);
    setTurns([]);
    setInput("");
    setFocusTick((n) => n + 1);
  }, []);

  return <Ctx.Provider value={{ turns, input, setInput, busy, thinking, send, ask, stop, newChat, view, setView, model, bot, mcp, focusTick }}>{children}</Ctx.Provider>;
}

export function useChat(): ChatCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChat outside ChatProvider");
  return v;
}
