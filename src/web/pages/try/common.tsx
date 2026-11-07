// Builder B helpers shared by Try, Trust and the Map climate layer (page-local, not in components/).
import type { ReactNode } from "react";
import { AlertTriangle, FlaskConical } from "lucide-react";
import type { Region, RegionFilter } from "@/shared/types";
import type { Basis } from "@/shared/insights";
import { Badge, Segmented } from "../../components/ui";
import { deltaColor } from "../../charts";
import { basisChip } from "../../lib/insights";
import { cn } from "../../lib/cn";
import { fmtDate, fmtDelta, regionLabel, shortHash } from "../../lib/format";

/** Insight fractions to signed percent text (formatting only). */
export const pct = (x: number | null | undefined, digits = 1) => fmtDelta(x == null ? null : x * 100, digits);

/** Climate-story changes span about ±6 %, so the brown→teal scale is stretched to that domain (contract §10.1). */
export const STORY_DOMAIN = 6;
export const storyColor = (change: number | null | undefined, dark: boolean) =>
  deltaColor(change == null ? null : Math.max(-STORY_DOMAIN, Math.min(STORY_DOMAIN, change * 100)) * (25 / STORY_DOMAIN), dark);

const latestFile = (b: Basis | null | undefined) => b?.sources.map((s) => s.generatedAt).filter((x): x is string => !!x).sort().pop() ?? null;

/** Chip next to a panel title: "Scenario result · model … · file …", or the what-if label. */
export function BasisChip({ basis, whatIf }: { basis: Basis | null | undefined; whatIf?: boolean }) {
  const text = whatIf ? ["What-if with the trained model", basis?.modelVersion && `model ${shortHash(basis.modelVersion)}`].filter(Boolean).join(" · ") : basisChip(basis);
  const file = latestFile(basis);
  const title = [basis?.label, ...(basis?.sources ?? []).map((s) => `${s.file}${s.generatedAt ? `, made ${fmtDate(s.generatedAt.slice(0, 10))}` : ""}`)].filter(Boolean).join("\n");
  return (
    <Badge tone="brand" title={title || undefined} className="max-w-full whitespace-normal">
      <FlaskConical className="size-3 shrink-0" aria-hidden />
      {text}
      {whatIf && file ? <span className="font-normal text-muted"> · results file {fmtDate(file.slice(0, 10))}</span> : null}
    </Badge>
  );
}

export function StaleNotice({ basis, className }: { basis: Basis | null | undefined; className?: string }) {
  if (!basis?.staleVsModel) return null;
  return (
    <Notice className={className}>These results were made with an older model. Rerun the pipeline before relying on them.</Notice>
  );
}

export function Notice({ children, tone = "info", className }: { children: ReactNode; tone?: "info" | "warn"; className?: string }) {
  return (
    <div role="note" className={cn("flex items-start gap-2 rounded-card px-3 py-2 text-[13px] text-ink", tone === "warn" ? "border border-rapeseed bg-rapeseed-soft" : "bg-surface-2", className)}>
      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-degraded" : "text-muted")} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Insight endpoints are per region: with "Both" the page asks which one (never pooled). */
export function pickRegion(global: RegionFilter, local: string | null): Region {
  if (global !== "both") return global;
  return local === "SE_SKANE" ? "SE_SKANE" : "FI_SW";
}

export function RegionPicker({ global, value, onChange }: { global: RegionFilter; value: Region; onChange: (r: Region) => void }) {
  if (global !== "both") return null;
  return (
    <Segmented
      size="sm"
      ariaLabel="Region"
      value={value}
      onChange={onChange}
      options={(["FI_SW", "SE_SKANE"] as Region[]).map((r) => ({ value: r, label: regionLabel(r) }))}
    />
  );
}

/** Labelled native select in the apetit `.field` style. */
export function Select<T extends string>({ label, value, onChange, options, disabled, help, className }: { label: string; value: T | ""; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean; help?: string; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-[13px] text-muted", className)}>
      <span>{label}</span>
      <select className="field w-full min-w-0 text-sm text-ink" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} title={help}>
        {value === "" && <option value="">Choose…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {help && <span className="text-xs">{help}</span>}
    </label>
  );
}

/** Collapsible section (native details), closed by default. */
export function Expander({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cn("group rounded-card border border-border bg-surface", className)}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-heading marker:text-brand">{title}</summary>
      <div className="border-t border-border p-4 text-sm">{children}</div>
    </details>
  );
}
