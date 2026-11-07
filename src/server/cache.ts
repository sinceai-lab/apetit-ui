// In-memory TTL cache: single-flight on miss, stale-while-error on upstream failure.

interface Entry<T> {
  value: T;
  at: number;
  ttl: number;
}

export interface Cached<T> {
  value: T;
  cached: boolean;
  stale: boolean;
  fetchedAt: string;
}

export class TtlCache {
  private store = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  constructor(
    private maxEntries = 500,
    private now: () => number = Date.now,
  ) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Cached<T>> {
    const hit = this.store.get(key) as Entry<T> | undefined;
    if (hit && this.now() - hit.at < hit.ttl) return { value: hit.value, cached: true, stale: false, fetchedAt: new Date(hit.at).toISOString() };
    let p = this.inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = load().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    try {
      const value = await p;
      const at = this.now();
      this.set(key, { value, at, ttl: ttlMs });
      return { value, cached: false, stale: false, fetchedAt: new Date(at).toISOString() };
    } catch (e) {
      const old = this.store.get(key) as Entry<T> | undefined;
      if (old) return { value: old.value, cached: true, stale: true, fetchedAt: new Date(old.at).toISOString() };
      throw e;
    }
  }

  private set(key: string, e: Entry<unknown>) {
    this.store.delete(key);
    this.store.set(key, e);
    while (this.store.size > this.maxEntries) this.store.delete(this.store.keys().next().value!);
  }

  clear() {
    this.store.clear();
  }
}

export const cache = new TtlCache();

export const TTL = {
  master: 10 * 60_000,
  predictions: 30_000,
  status: 30_000,
  weather: 2 * 60_000,
  climate: 60 * 60_000,
  counts: 30_000,
  services: 10_000,
  health: 10_000,
  loadLogs: 60_000,
  subscriptions: 10_000,
  history: 60_000,
};
