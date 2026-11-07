// Climate side panel, as in Streamlit: region summary (advice), farm story, or field story.
import { ArrowRight, FlaskConical, X } from "lucide-react";
import type { Crop, Region } from "@/shared/types";
import type { Story } from "@/shared/insights";
import { Async, Badge, Button, EmptyState, ErrorState, LinkButton, Loading, Stat } from "../../../components/ui";
import { useAdvice, useFarmStory, useFieldStory } from "../../../lib/insights";
import { cropLabel, fmtFixed, fmtHa, fmtShare, regionLabel } from "../../../lib/format";
import { href } from "../../../lib/router";
import { pct, StaleNotice } from "../../try/common";
import { parcelShort, soilLabel } from "../../try/labels";

export type ClimateSel = { kind: "farm" | "field"; id: string } | null;

function Head({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose?: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="truncate text-xl font-bold text-heading">{title}</h2>
      </div>
      {onClose && (
        <Button variant="ghost" aria-label="Clear selection" onClick={onClose}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

const confTone = (c: string) => (c.startsWith("Low") ? "degraded" : c.startsWith("Medium") ? "up" : "neutral");
const tryHref = (parcel: string, crop: Crop) => href("/try", { parcel, crop, weather: "high", year: 2050 });

export function ClimateSidePanel({ sel, setSel, region, crop, story }: { sel: ClimateSel; setSel: (s: ClimateSel) => void; region: Region; crop: Crop; story: Story }) {
  if (sel?.kind === "farm") return <FarmStory id={sel.id} crop={crop} story={story} onClose={() => setSel(null)} onField={(id) => setSel({ kind: "field", id })} />;
  if (sel?.kind === "field") return <FieldStory id={sel.id} crop={crop} story={story} onClose={() => setSel(null)} onFarm={(id) => setSel({ kind: "farm", id })} />;
  return <Summary region={region} crop={crop} story={story} />;
}

function Summary({ region, crop, story }: { region: Region; crop: Crop; story: Story }) {
  const a = useAdvice(region, crop, story);
  if (a.error?.status === 404) return (
    <>
      <Head eyebrow={regionLabel(region)} title={cropLabel(crop)} />
      <EmptyState title="No climate advice for this crop here">Pick a farm on the map for its story.</EmptyState>
    </>
  );
  return (
    <>
      <Head eyebrow={`${regionLabel(region)} · whole region`} title={cropLabel(crop)} />
      <Async state={a} loading={<Loading />}>
        {(d) => {
          const s = d.stories.find((x) => x.story === story);
          return (
            <div className="flex flex-col gap-3 text-sm">
              <StaleNotice basis={d.basis} />
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Yield change by 2041–2060" value={pct(s?.yieldChange)} foot={s ? `If one season is dropped: ${pct(s.yieldChangeLow)} to ${pct(s.yieldChangeHigh)}` : undefined} />
                <Stat label="Bad-year chance" value={fmtShare(s?.badYearChance, 1)} foot={`Today: ${fmtShare(d.badYearsSoFar.badYearChanceToday, 1)}`} />
              </div>
              <div>
                <Badge tone={confTone(d.confidence)}>Confidence: {d.confidence}</Badge>
              </div>
              {d.why.length > 0 && (
                <ul className="list-disc space-y-1 pl-4">
                  {d.why.map((w) => (
                    <li key={w.code}>{w.text}</li>
                  ))}
                </ul>
              )}
              {d.actions.slice(0, 2).map((x) => (
                <div key={x.code} className="rounded-card bg-surface-2 p-3">
                  <div className="eyebrow">{x.decision}</div>
                  <p className="mt-1">{x.text}</p>
                  <p className="mt-1 text-xs text-muted">Evidence: {x.evidence}</p>
                </div>
              ))}
              {d.actions.length > 0 && <p className="text-xs text-muted">{d.actionsNote || "Draft rules for advisors to review."}</p>}
              <a className="link text-sm" href={href("/advice", { crop, story })}>
                All advice for {cropLabel(crop).toLowerCase()} <ArrowRight className="inline size-3.5" aria-hidden />
              </a>
            </div>
          );
        }}
      </Async>
    </>
  );
}

function FarmStory({ id, crop, story, onClose, onField }: { id: string; crop: Crop; story: Story; onClose: () => void; onField: (id: string) => void }) {
  const f = useFarmStory(id, crop, story);
  return (
    <>
      <Head eyebrow={`Farm · ${cropLabel(crop)}`} title={id} onClose={onClose} />
      {f.error?.status === 404 ? (
        <EmptyState title="This farm doesn't grow this crop in the model data" />
      ) : f.error ? (
        <ErrorState error={f.error} onRetry={f.refresh} />
      ) : !f.data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <StaleNotice basis={f.data.basis} />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Yield change, this farm" value={pct(f.data.headline.yieldChange)} foot={`Whole region: ${pct(f.data.headline.regionYieldChange)}`} />
            <Stat label="On sand or fine sand" value={fmtShare(f.data.headline.dryShare)} foot={`${f.data.headline.dryFields} of ${f.data.headline.nFields} fields`} />
          </div>
          <p className="font-medium text-ink">{f.data.risk.text}</p>
          {f.data.why.length > 0 && (
            <ul className="list-disc space-y-1 pl-4">
              {f.data.why.map((w) => (
                <li key={w.code}>{w.text}</li>
              ))}
            </ul>
          )}
          <div>
            <div className="mb-1 text-xs text-muted">Fields, highest modelled yield first</div>
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-card border border-border">
              {f.data.fields.map((x) => (
                <li key={x.parcelId}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-brand-soft" onClick={() => onField(x.parcelId)}>
                    <span className="min-w-0 truncate">
                      {parcelShort(x.parcelId)} · {soilLabel(x.soil)} · {fmtHa(x.areaHa)}
                      {x.droughty && <Badge tone="rapeseed" className="ml-1.5">Holds least water</Badge>}
                    </span>
                    <span className="tnum shrink-0 text-xs">{pct(story === "below_2c" ? x.soilChangeBelow2c : x.soilChangeCurrentPolicies)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <LinkButton variant="primary" href={href(`/farm/${id}`)}>
            Farm detail <ArrowRight className="size-4" aria-hidden />
          </LinkButton>
        </div>
      )}
    </>
  );
}

function FieldStory({ id, crop, story, onClose, onFarm }: { id: string; crop: Crop; story: Story; onClose: () => void; onFarm: (id: string) => void }) {
  const f = useFieldStory(id, crop, story);
  return (
    <>
      <Head eyebrow={`Field · ${cropLabel(crop)}`} title={id} onClose={onClose} />
      <Async state={f}>
        {(d) => (
          <div className="flex flex-col gap-3 text-sm">
            <StaleNotice basis={d.basis} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Yield change on this soil" value={pct(d.yieldChange)} foot={`Whole region: ${pct(d.regionYieldChange)}`} />
              <Stat label="Modelled yield today" value={fmtFixed(d.yieldTodayTHa, 1)} unit="t/ha" foot={`${soilLabel(d.soil)} · ${fmtHa(d.areaHa)}`} />
            </div>
            <p className="font-medium text-ink">{d.risk.text}</p>
            {d.why.length > 0 && (
              <ul className="list-disc space-y-1 pl-4">
                {d.why.map((w) => (
                  <li key={w.code}>{w.text}</li>
                ))}
              </ul>
            )}
            <p className="rounded-card bg-surface-2 p-3 text-xs text-muted">{d.localNote.text}</p>
            <div className="flex flex-wrap gap-2">
              <LinkButton variant="primary" href={tryHref(d.parcelId, crop)}>
                <FlaskConical className="size-4" aria-hidden /> Try this field
              </LinkButton>
              <Button variant="outline" onClick={() => onFarm(d.farmId)}>
                Farm {d.farmId}
              </Button>
            </div>
          </div>
        )}
      </Async>
    </>
  );
}
