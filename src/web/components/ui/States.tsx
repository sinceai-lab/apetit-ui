// Loading / empty / error states and the calm upstream-outage banner.
import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import type { Upstream } from "@/shared/types";
import { cn } from "../../lib/cn";
import type { ApiError } from "../../lib/api";
import type { AsyncState } from "../../lib/usePoll";
import { Button } from "./Button";

export function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center gap-2 py-6 text-sm text-muted", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/** Shimmer block for chart/table placeholders. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-card bg-surface-2", className)} />;
}

export function EmptyState({ title = "Nothing to show", children, className }: { title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-border px-4 py-8 text-center", className)}>
      <Inbox className="size-5 text-muted" aria-hidden />
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-md text-xs text-muted">{children}</div>}
    </div>
  );
}

const UPSTREAM_NAME: Record<Upstream, string> = { broker: "Coraine broker", inference: "yield inference service", backend: "backend", chatbot: "chat-bot" };

export function ErrorState({ error, onRetry, className }: { error: ApiError | Error | string; onRetry?: () => void; className?: string }) {
  const msg = typeof error === "string" ? error : error.message;
  const up = typeof error === "object" && "upstream" in error ? (error as ApiError).upstream : undefined;
  return (
    <div role="alert" className={cn("flex flex-wrap items-start gap-3 rounded-card border border-berry/40 bg-berry-soft px-4 py-3 text-sm", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-berry" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{up ? `The ${UPSTREAM_NAME[up]} is not answering` : "Could not load this panel"}</div>
        <div className="break-words text-xs text-muted">{msg}</div>
        {up && (
          <a href="#/services" className="link text-xs">
            Check services
          </a>
        )}
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="text-xs">
          Retry
        </Button>
      )}
    </div>
  );
}

/** Inline banner for partial data (`errors` on an envelope) or stale cache. */
export function UpstreamBanner({ errors, stale }: { errors?: Partial<Record<Upstream, string>>; stale?: boolean }) {
  const ups = Object.keys(errors ?? {}) as Upstream[];
  if (!ups.length && !stale) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-rapeseed/60 bg-rapeseed-soft px-3 py-2 text-[13px] text-ink">
      <AlertTriangle className="size-4 text-degraded" aria-hidden />
      {ups.length ? <span>Partial data: {ups.map((u) => UPSTREAM_NAME[u]).join(", ")} unavailable.</span> : <span>Showing the last good data (upstream not answering).</span>}
      <a href="#/services" className="link text-brand-strong">
        Services
      </a>
    </div>
  );
}

/** Render loading / error / data for an AsyncState in one line. Keeps showing old data while refreshing. */
export function Async<T>({ state, children, loading, empty }: { state: AsyncState<T>; children: (data: T) => ReactNode; loading?: ReactNode; empty?: (data: T) => boolean }) {
  if (state.data != null) {
    if (empty?.(state.data)) return <EmptyState />;
    return <>{children(state.data)}</>;
  }
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  return <>{loading ?? <Loading />}</>;
}
