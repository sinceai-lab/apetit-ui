// Global service status: worst state + "n/m up", links to the Services page.
import type { ServiceState } from "@/shared/types";
import { useServices } from "../../lib/appData";
import { cn } from "../../lib/cn";
import { StatusDot } from "../ui/Badge";

export function ServiceIndicator({ className }: { className?: string }) {
  const { data, error } = useServices();
  const list = data?.services ?? [];
  const up = list.filter((s) => s.status === "up").length;
  const worst: ServiceState | "unknown" = error && !data ? "down" : !list.length ? "unknown" : list.some((s) => s.status === "down") ? "down" : list.some((s) => s.status === "degraded") ? "degraded" : "up";
  const problems = list.filter((s) => s.status !== "up").map((s) => `${s.name}: ${s.status}${s.detail ? ` (${s.detail})` : ""}`);
  const title = error && !data ? "App server not answering" : problems.length ? problems.join("\n") : list.length ? "All services up" : "Checking services…";
  return (
    <a href="#/services" title={title} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-card border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors duration-300 hover:border-brand-vivid", className)}>
      <StatusDot status={worst} />
      <span className="tnum">{list.length ? `${up}/${list.length} up` : error ? "offline" : "…"}</span>
      <span className="sr-only">{title}</span>
    </a>
  );
}
