// Data hook: fetch on mount/deps change, optional polling paused while the tab is hidden.
import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Last successful load (wall clock). */
  updatedAt: number | null;
  refresh: () => void;
}

export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: DependencyList, opts: { intervalMs?: number; enabled?: boolean } = {}): AsyncState<T> {
  const { intervalMs, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Reset when the identity of the request changes (not on refresh/poll).
  useEffect(() => {
    setData(null);
    setError(null);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    fetcherRef
      .current(ac.signal)
      .then((d) => {
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      })
      .catch((e) => {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(e instanceof ApiError ? e : new ApiError(0, String(e?.message ?? e)));
      })
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [...deps, tick, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!intervalMs || !enabled) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id == null) id = setInterval(refresh, intervalMs);
    };
    const stop = () => {
      if (id != null) clearInterval(id);
      id = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        refresh();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs, enabled, refresh]);

  return { data, error, loading, updatedAt, refresh };
}

/** Poll intervals from the contract (§6). */
export const POLL = { services: 10_000, predictions: 30_000, overview: 30_000 };
