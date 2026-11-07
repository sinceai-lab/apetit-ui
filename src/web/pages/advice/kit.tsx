// Page-local insight helpers for Outlook, Risk & advice and the Farm climate section (builder A only).
// Formatting and colour only: every figure is drawn exactly as the inference service returns it.
import type { ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, FlaskConical, Lightbulb, Minus, Sparkles } from "lucide-react";
import type { Crop, Region } from "@/shared/types";
import type { Action, Basis, Sentence, Story } from "@/shared/insights";
import { Badge, Button, EmptyState, ErrorState, Panel, Segmented, Skeleton } from "../../components/ui";
import { useChat } from "../assistant/ChatProvider";
import { deltaColor } from "../../charts";
import type { ApiError } from "../../lib/api";
import { basisChip, useInsightsOptions } from "../../lib/insights";
import { cn } from "../../lib/cn";
import { useIsDark } from "../../lib/prefs";
import { fmtDate, fmtDelta, fmtNum, shortHash } from "../../lib/format";
import type { AsyncState } from "../../lib/usePoll";

export const STORY_LABEL: Record<Story, string> = { below_2c: "Below 2 °C", current_policies: "Hothouse" };
export const STORY_COLOR: Record<Story, string> = { below_2c: "var(--viz-ssp126)", current_policies: "var(--viz-ssp585)" };
/** Climate-story changes all sit inside ±6 %, so the diverging scale uses that domain (contract §10.1). */
export const STORY_DOMAIN_PCT = 6;

/** Fractions (0.021) to "+2.1 %"; keys ending in Pct are already percent. */
export const fmtChange = (v: number | null | undefined, digits = 1) => (v == null ? "–" : fmtDelta(v * 100, digits));
export const fmtPct = (v: number | null | undefined, digits = 1) => fmtDelta(v, digits);
/** Axis ticks: whole percents without decimals, half steps with one. */
export const tickPct = (pct: number) => fmtDelta(pct, Math.abs(pct - Math.round(pct)) < 1e-9 ? 0 : 1);
export const tickChange = (v: number) => tickPct(v * 100);
export const fmtEur = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "–" : `${v < 0 ? "−" : ""}€${fmtNum(Math.abs(v))}`);
export const fmtSignedEur = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}€${fmtNum(Math.abs(v))}`);

/** Colour for a percent change on the brown→teal scale, stretched so ±6 % reaches the end colours. */
export const storyColor = (pct: number | null | undefined, dark: boolean) => deltaColor(pct == null ? null : (pct * 25) / STORY_DOMAIN_PCT, dark);

export const regionName = (r: Region) => (r === "FI_SW" ? "Finland" : "Sweden");

/** The "Scenario result · model … · file …" chip; hover lists every source file. */
export function BasisChip({ basis, className }: { basis: Basis | null | undefined; className?: string }) {
  const title = basis
    ? [`${basis.label}`, `Model ${shortHash(basis.modelVersion, 12)}`, ...basis.sources.map((s) => `${s.file}: made ${s.generatedAt ? fmtDate(s.generatedAt.slice(0, 10)) : "date unknown"}`)].join("\n")
    : undefined;
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted", className)}>
      <FlaskConical className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{basisChip(basis)}</span>
    </span>
  );
}

export function StaleNotice({ basis }: { basis: Basis | null | undefined }) {
  if (!basis?.staleVsModel) return null;
  return <Note tone="warn">These results were made with an older model. Rerun the pipeline before relying on them.</Note>;
}

/** Panel with the basis chip beside the title and the basis label as the subtitle. */
/** Wraps years and year ranges ("2027–2031", "2041–2060") in a stronger chip so the period stands out in a subtitle. */
export function YearEmphasis({ text }: { text: string }) {
  const parts = text.split(/(\b(?:19|20)\d{2}(?:\s*[–-]\s*(?:19|20)\d{2})?\b)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className="tnum mx-0.5 inline-block rounded bg-brand-soft px-1.5 text-[14px] font-bold text-brand-strong">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function InsightPanel({ title, basis, subtitle, actions, children, className, emphasizeYears }: { title: ReactNode; basis?: Basis | null; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; emphasizeYears?: boolean }) {
  const sub = subtitle ?? basis?.label;
  return (
    <Panel
      className={className}
      title={title}
      subtitle={emphasizeYears && typeof sub === "string" ? <YearEmphasis text={sub} /> : sub}
      actions={
        basis !== undefined || actions ? (
          <>
            {basis !== undefined && <BasisChip basis={basis} />}
            {actions}
          </>
        ) : undefined
      }
    >
      <StaleNotice basis={basis} />
      {children}
    </Panel>
  );
}

export function Note({ children, tone = "info", className }: { children: ReactNode; tone?: "info" | "warn" | "tip"; className?: string }) {
  const Icon = tone === "tip" ? Lightbulb : AlertTriangle;
  return (
    <div className={cn("flex items-start gap-2 rounded-card px-3 py-2 text-[13px] text-ink", tone === "info" ? "bg-surface-2" : tone === "tip" ? "bg-brand-soft" : "bg-rapeseed-soft", className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-degraded" : "text-brand")} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Story labels and blurbs from /insights/options, with the upstream's fixed labels as a fallback. */
export function useStories() {
  const opts = useInsightsOptions();
  const list = opts.data?.stories;
  return (s: Story) => {
    const o = list?.find((x) => x.code === s);
    return { label: o?.label ?? STORY_LABEL[s], blurb: o?.blurb ?? "" };
  };
}

const STORIES: Story[] = ["below_2c", "current_policies"];

export function StoryToggle({ value, onChange, showBlurb = true }: { value: Story; onChange: (s: Story) => void; showBlurb?: boolean }) {
  const story = useStories();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Segmented
        ariaLabel="Climate story"
        value={value}
        onChange={onChange}
        options={STORIES.map((s) => ({
          value: s,
          title: story(s).blurb,
          label: (
            <>
              <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: STORY_COLOR[s] }} />
              {story(s).label}
            </>
          ),
        }))}
      />
      {/* w-0 min-w-full: the blurb wraps to the toggle's width instead of widening the column (which shoved the toggle off its edge).
          Every blurb is stacked in one grid cell (inactive ones invisible), so the block is as tall as the longest one and the
          controls don't jump when the story changes. */}
      {showBlurb && story(value).blurb && (
        <span className="grid w-0 min-w-full text-xs text-muted">
          {STORIES.map((s) => (
            <span key={s} aria-hidden={s !== value} className={cn("[grid-area:1/1]", s !== value && "invisible")}>
              {story(s).blurb}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string | null | undefined }) {
  if (!confidence) return null;
  const tone = /^medium/i.test(confidence) || /^high/i.test(confidence) ? "up" : "degraded";
  return <Badge tone={tone}>Confidence: {confidence}</Badge>;
}

export const isLowConfidence = (c: string | null | undefined) => !!c && /^low/i.test(c);

/** One draft action card: decision as eyebrow, the sentence, then its evidence. */
/** The question an action card's "Ask AI" button sends; `about` names the crop/region/farm and story the card is for. */
const actionQuestion = (a: Action, about: string) =>
  `About the draft climate advice for ${about}: "${a.decision}: ${a.text}" (evidence given: ${a.evidence}). ` +
  "Why is this suggested, how strong is the evidence behind it, and what should an advisor check in the data before recommending it?";

export function ActionCard({ action, askAbout }: { action: Action; askAbout?: string }) {
  const { ask } = useChat();
  return (
    <li className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5">
      <div className="eyebrow">{action.decision}</div>
      <p className="text-[15px] leading-snug text-ink">{action.text}</p>
      <div className="text-xs text-muted">Evidence: {action.evidence}</div>
      {askAbout && (
        <Button
          className="mt-auto self-start px-2.5 py-1 text-xs"
          aria-label={`Ask the AI assistant about: ${action.decision}`}
          title="Opens the assistant and asks why this is suggested"
          onClick={() => ask(actionQuestion(action, askAbout))}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Ask AI
        </Button>
      )}
    </li>
  );
}

export function ActionList({ actions, note, limit, askAbout }: { actions: Action[]; note: string; limit?: number; askAbout?: string }) {
  const head = limit ? actions.slice(0, limit) : actions;
  const rest = limit ? actions.slice(limit) : [];
  return (
    <div className="flex flex-col gap-3">
      <Note tone="tip">
        {/^draft rules/i.test(note) ? note : <><b className="font-semibold">Draft rules for advisors to review.</b> {note}</>}
      </Note>
      {!actions.length ? (
        <EmptyState title="No draft actions for this crop and story" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {head.map((a) => (
            <ActionCard key={a.code + a.rule} action={a} askAbout={askAbout} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <details>
          <summary className="link cursor-pointer text-sm">Further recommendations ({actions.length})</summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {rest.map((a) => (
              <ActionCard key={a.code + a.rule} action={a} askAbout={askAbout} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Sentences({ items, className }: { items: Sentence[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cn("flex list-disc flex-col gap-1 pl-5 text-sm text-ink marker:text-brand", className)}>
      {items.map((s, i) => (
        <li key={s.code + i}>{s.text}</li>
      ))}
    </ul>
  );
}

/** Loading / error / 404-as-empty for one insight endpoint. */
export function InsightAsync<T>({ state, children, height = "h-48", notFound }: { state: AsyncState<T>; children: (d: T) => ReactNode; height?: string; notFound?: ReactNode }) {
  if (state.data != null) return <>{children(state.data)}</>;
  if (state.error) {
    if (state.error.status === 404) return <EmptyState title={notFound ?? "No results for this choice"}>{(state.error as ApiError).message}</EmptyState>;
    if (state.error.status === 503 && !state.error.upstream)
      return <EmptyState title="These results are not available yet">{state.error.message}. Run the pipeline in model-inference to make them.</EmptyState>;
    return <ErrorState error={state.error} onRetry={state.refresh} />;
  }
  if (!state.loading) return <EmptyState title="Pick a crop to see results" />;
  return <Skeleton className={height} />;
}

/** Side-by-side region columns (Finland and Sweden never pooled). */
export function RegionColumns({ regions, children }: { regions: Region[]; children: (r: Region) => ReactNode }) {
  return <div className={regions.length > 1 ? "grid gap-5 xl:grid-cols-2" : "grid gap-5"}>{regions.map((r) => <div key={r} className="min-w-0">{children(r)}</div>)}</div>;
}

export function RegionHeading({ region, show }: { region: Region; show: boolean }) {
  if (!show) return null;
  return <h2 className="font-title text-xl font-semibold text-heading">{region === "FI_SW" ? "Finland · South-West" : "Sweden · Skåne"}</h2>;
}

export const cropsIn = (crops: Crop[] | undefined, c: Crop) => !!crops?.includes(c);

/** Signed change with an arrow (never colour alone); input is a fraction unless `pct`. */
export function ChangeText({ value, pct = false, size = "sm" }: { value: number | null | undefined; pct?: boolean; size?: "sm" | "xl" }) {
  const p = value == null || !Number.isFinite(value) ? null : pct ? value : value * 100;
  const flat = p == null || Math.abs(p) < 0.05;
  const Icon = flat ? Minus : p! < 0 ? ArrowDown : ArrowUp;
  const dark = useIsDark();
  const color = flat ? "var(--muted)" : p! < 0 ? (dark ? "#E0B86A" : "#8A4F12") : dark ? "#80CDC1" : "#01665E";
  return (
    <span className={cn("tnum inline-flex items-center gap-0.5 whitespace-nowrap font-semibold", size === "xl" ? "text-2xl sm:text-[28px]" : "text-sm")} style={{ color }}>
      <Icon className={size === "xl" ? "size-6" : "size-3.5"} aria-hidden strokeWidth={2.5} />
      {fmtDelta(p)}
      <span className="sr-only">{flat ? " about no change" : p! < 0 ? " lower" : " higher"}</span>
    </span>
  );
}
