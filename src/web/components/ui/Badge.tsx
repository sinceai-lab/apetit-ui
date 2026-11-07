import type { ReactNode } from "react";
import type { ServiceState } from "@/shared/types";
import { cn } from "../../lib/cn";
import { fmtDelta } from "../../lib/format";

type Tone = "neutral" | "brand" | "rapeseed" | "berry" | "up" | "degraded" | "down";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink",
  brand: "bg-brand-soft text-brand-strong",
  rapeseed: "bg-rapeseed-soft text-ink",
  berry: "bg-berry-soft text-berry",
  up: "bg-surface-2 text-up",
  degraded: "bg-rapeseed-soft text-degraded",
  down: "bg-berry-soft text-down",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_LABEL: Record<ServiceState | "unknown", string> = { up: "Up", degraded: "Degraded", down: "Down", unknown: "Unknown" };
const STATUS_GLYPH: Record<ServiceState | "unknown", string> = { up: "●", degraded: "▲", down: "■", unknown: "○" };

/** Status dot with a shape per state (never colour alone). */
export function StatusDot({ status, className }: { status: ServiceState | "unknown"; className?: string }) {
  const color = status === "unknown" ? "text-muted" : status === "up" ? "text-up" : status === "degraded" ? "text-degraded" : "text-down";
  return (
    <span aria-hidden className={cn("inline-block text-[10px] leading-none", color, className)}>
      {STATUS_GLYPH[status]}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: ServiceState | "unknown"; label?: string }) {
  return (
    <Badge tone={status === "unknown" ? "neutral" : status}>
      <StatusDot status={status} />
      {label ?? STATUS_LABEL[status]}
    </Badge>
  );
}

/** Signed Δ% chip; brown-ish (berry) below −5 %, brand above +5 %. */
export function DeltaBadge({ value }: { value: number | null | undefined }) {
  const tone: Tone = value == null ? "neutral" : value < -5 ? "berry" : value > 5 ? "brand" : "neutral";
  return <Badge tone={tone} className="tnum">{fmtDelta(value)}</Badge>;
}
