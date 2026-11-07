// Farm detail: climate outlook 2041–2060 for this farm (contract §10.3, Farm additions). Scenario results only.
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { CROPS, type Crop, type Farm } from "@/shared/types";
import type { ClimateField, InsightsFarm, Story } from "@/shared/insights";
import { Badge, Drawer, EmptyState, Segmented, Skeleton, Stat, Table, type Column } from "../../../components/ui";
import { BarChart, TableToggle } from "../../../charts";
import { useFarmStory, useFieldStory, useInsightsOptions } from "../../../lib/insights";
import { href, setQuery, useLocation } from "../../../lib/router";
import { cropLabel, fmtFixed, fmtHa, fmtNum, fmtShare } from "../../../lib/format";
import { CropDot } from "../../season/common";
import { SoilEffects } from "../../advice/SoilEffects";
import { ActionList, ChangeText, InsightAsync, InsightPanel, Note, Sentences, StoryToggle, fmtChange, regionName, useStories } from "../../advice/kit";

const isCrop = (c: string | null): c is Crop => !!c && (CROPS as string[]).includes(c);
const tryHref = (parcel: string, crop: Crop) => href("/try", { parcel, crop, weather: "high", year: 2050 });

export function ClimateOutlook({ farm }: { farm: Farm }) {
  const { query } = useLocation();
  const opts = useInsightsOptions();
  const covered = opts.data?.regions.find((r) => r.code === farm.region)?.crops ?? [];
  const crops = CROPS.filter((c) => farm.contractCrops.includes(c) && covered.includes(c));
  const qc = query.get("ccrop");
  const crop: Crop | null = isCrop(qc) && crops.includes(qc) ? qc : (crops[0] ?? null);
  const story: Story = query.get("story") === "below_2c" ? "below_2c" : "current_policies";
  const d = useFarmStory(crop ? farm.farmId : null, crop, story);

  return (
    <section aria-labelledby="farm-climate" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-5">
        <div>
          <div className="eyebrow">Climate & planning · 2041–2060</div>
          <h2 id="farm-climate" className="font-title text-xl font-semibold text-heading">
            Climate outlook for this farm
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Scenario results from the trained model, not this season's live estimate. They compare 2041–2060 with the climate of 1991–2020.</p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {crops.length > 1 && <Segmented ariaLabel="Crop" value={crop ?? crops[0]!} onChange={(c) => setQuery({ ccrop: c })} options={crops.map((c) => ({ value: c, label: <><CropDot crop={c} />{cropLabel(c)}</> }))} />}
          <StoryToggle value={story} onChange={(s) => setQuery({ story: s })} />
        </div>
      </div>
      {opts.error && !opts.data ? (
        <InsightAsync state={opts}>{() => null}</InsightAsync>
      ) : !opts.data ? (
        <Skeleton className="h-64" />
      ) : !crop ? (
        <EmptyState title="No climate outlook for this farm">None of its contract crops is covered by the climate model.</EmptyState>
      ) : (
        <InsightAsync state={d} height="h-96" notFound={`No climate outlook for ${cropLabel(crop).toLowerCase()} on this farm`}>
          {(x) => <FarmClimateBody d={x} />}
        </InsightAsync>
      )}
    </section>
  );
}

function FarmClimateBody({ d }: { d: InsightsFarm }) {
  const story = useStories();
  const [open, setOpen] = useState<string | null>(null);
  const h = d.headline;
  const other: Story = d.story === "below_2c" ? "current_policies" : "below_2c";
  return (
    <div className="flex flex-col gap-5">
      <InsightPanel title={`${cropLabel(d.crop)} Scenario: ${story(d.story).label}`} basis={d.basis ?? null}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Stat label="Yield change for this farm" value={<ChangeText value={h.yieldChange} size="xl" />} foot={`${story(other).label}: ${fmtChange(h.yieldChangeOtherStory)} · whole region: ${fmtChange(h.regionYieldChange)}`} />
          <Stat label="On sand or fine sand" value={fmtShare(h.dryShare)} foot={`${fmtNum(h.dryFields)} of ${fmtNum(h.nFields)} fields hold the least water`} />
          <Stat label="Usual irrigated share" value={fmtShare(h.usualIrrigatedShare)} foot={`${fmtNum(h.plannedFields)} fields planned 2027–2028, ${fmtNum(h.plannedDryHa)} ha on sand or fine sand`} />
        </div>
        <p className="mt-4 text-[15px] leading-snug text-ink">{d.risk.text}</p>
        <Sentences items={d.why} className="mt-2" />
      </InsightPanel>

      <InsightPanel title="What to do" basis={d.basis ?? null} subtitle="Top suggested actions for this crop and story">
        <ActionList actions={d.actions} note={d.actionsNote} limit={2} askAbout={`farm ${d.farmId} (${cropLabel(d.crop).toLowerCase()}, ${regionName(d.region)}) under the ${story(d.story).label} climate story (2041–2060)`} />
      </InsightPanel>

      <div className="grid gap-5 lg:grid-cols-2">
        <InsightPanel title="Modelled yield by soil on this farm" basis={d.basis ?? null} subtitle="Today's climate, 2025 technology, t/ha">
          {!d.yieldBySoil.length ? (
            <EmptyState title="No soil breakdown" />
          ) : (
            <TableToggle table={{ rows: d.yieldBySoil, rowKey: (r) => r.soil, columns: [{ key: "s", header: "Soil", render: (r) => r.label }, { key: "y", header: "Yield today", align: "right", render: (r) => `${fmtFixed(r.yieldTodayTHa, 2)} t/ha` }] }}>
              <BarChart ariaLabel="Modelled yield by soil" data={d.yieldBySoil.map((r) => ({ key: r.soil, label: r.label, value: r.yieldTodayTHa, color: "var(--brand)" }))} format={(v) => fmtFixed(v, 1)} />
            </TableToggle>
          )}
        </InsightPanel>
        <SoilEffects region={d.region} crop={d.crop} title="Same soils across the region" />
      </div>

      <FieldsTable d={d} onOpen={setOpen} />
      <FieldDrawer parcelId={open} crop={d.crop} story={d.story} onClose={() => setOpen(null)} />
    </div>
  );
}

function FieldsTable({ d, onOpen }: { d: InsightsFarm; onOpen: (id: string) => void }) {
  const story = useStories();
  const cols: Column<ClimateField>[] = [
    { key: "id", header: "Field", render: (f) => <span className="font-medium">{f.parcelId}</span>, sortValue: (f) => f.parcelId },
    { key: "ha", header: "Area", align: "right", render: (f) => fmtHa(f.areaHa), sortValue: (f) => f.areaHa },
    { key: "soil", header: "Soil", render: (f) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{f.soil.replace(/_/g, " ")}{f.droughty && <Badge tone="rapeseed">Holds least water</Badge>}</span>, sortValue: (f) => f.soil },
    { key: "dr", header: "Drainage", render: (f) => f.drainage.replace(/_/g, " ") },
    { key: "y", header: "Yield today", align: "right", render: (f) => `${fmtFixed(f.yieldTodayTHa, 2)} t/ha`, sortValue: (f) => f.yieldTodayTHa },
    { key: "b", header: `Change, ${story("below_2c").label}`, align: "right", render: (f) => <span title={`This grid square only: ${fmtChange(f.changeBelow2c)}`}>{fmtChange(f.soilChangeBelow2c)}</span>, sortValue: (f) => f.soilChangeBelow2c },
    { key: "c", header: `Change, ${story("current_policies").label}`, align: "right", render: (f) => <span title={`This grid square only: ${fmtChange(f.changeCurrentPolicies)}`}>{fmtChange(f.soilChangeCurrentPolicies)}</span>, sortValue: (f) => f.soilChangeCurrentPolicies },
    { key: "st", header: "Drought stress (0–1)", align: "right", render: (f) => fmtFixed(f.stressToday, 2), sortValue: (f) => f.stressToday },
    { key: "lg", header: "Last grown", align: "right", render: (f) => f.lastGrown ?? "–", sortValue: (f) => f.lastGrown },
    { key: "np", header: "Next planned", align: "right", render: (f) => f.nextPlanned ?? "–", sortValue: (f) => f.nextPlanned },
    {
      key: "try",
      header: "",
      render: (f) => (
        <a className="link inline-flex items-center gap-1 text-xs" href={tryHref(f.parcelId, d.crop)} onClick={(e) => e.stopPropagation()}>
          <FlaskConical className="size-3" aria-hidden /> Try
        </a>
      ),
    },
  ];
  return (
    <InsightPanel title="Fields, highest modelled yield first" basis={d.basis ?? null} subtitle="Click a field for its story. Change uses the soil figure; hover for this grid square only.">
      <Note tone="warn" className="mb-3">{d.fieldsWarning}</Note>
      <Table dense maxHeight={480} rows={d.fields} rowKey={(f) => f.parcelId} columns={cols} onRowClick={(f) => onOpen(f.parcelId)} caption="Fields" empty={<EmptyState title="No fields for this crop" />} />
      <p className="mt-3 text-xs text-muted">{d.fieldsNote}</p>
    </InsightPanel>
  );
}

function FieldDrawer({ parcelId, crop, story, onClose }: { parcelId: string | null; crop: Crop; story: Story; onClose: () => void }) {
  const f = useFieldStory(parcelId, crop, story);
  return (
    <Drawer open={!!parcelId} onClose={onClose} title={`Field ${parcelId ?? ""}`}>
      <InsightAsync state={f} notFound="No climate story for this field">
        {(x) => (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-1.5 text-xs text-muted">
              <Badge>{x.soil.replace(/_/g, " ")}</Badge>
              <Badge>{fmtHa(x.areaHa)}</Badge>
              <Badge>{x.drainage.replace(/_/g, " ")} drainage</Badge>
              {x.droughty && <Badge tone="rapeseed">Holds least water</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-5">
              <Stat label="Yield change" value={<ChangeText value={x.yieldChange} size="xl" />} foot={`Whole region: ${fmtChange(x.regionYieldChange)}`} />
              <Stat label="Yield today" value={fmtFixed(x.yieldTodayTHa, 2)} unit="t/ha" />
              <Stat label="Drought stress today" value={fmtFixed(x.stressToday, 2)} foot="sensitive stage, 0–1" />
              <Stat label="Drought stress 2041–2060" value={fmtFixed(x.stressFuture, 2)} />
            </div>
            <p className="text-[15px] leading-snug text-ink">{x.risk.text}</p>
            <Sentences items={x.why} />
            <Note>{x.localNote.text}</Note>
            <div className="text-xs text-muted">
              Last grown {x.lastGrown ?? "–"} · next planned {x.nextPlanned ?? "–"}
            </div>
            <a className="btn btn-primary w-fit px-3.5 py-1.5 text-sm" href={tryHref(x.parcelId, crop)}>
              <FlaskConical className="size-4" aria-hidden /> Try this field in the model
            </a>
            <InsightPanel title="Where this comes from" basis={x.basis ?? null}>
              <span className="text-xs text-muted">Scenario result for one field, computed from the trained model.</span>
            </InsightPanel>
          </div>
        )}
      </InsightAsync>
    </Drawer>
  );
}
