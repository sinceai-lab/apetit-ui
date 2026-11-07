// Risk & advice: story cards, draft actions, drivers, season shift, policy costs, € exposure (contract §10.3). Builder A.
import { CROPS, type Crop, type Region } from "@/shared/types";
import type { InsightsAdvice, InsightsEuroRisk, InsightsPolicy, Story, StoryResult } from "@/shared/insights";
import type { PageProps } from "./types";
import { EmptyState, PageHeader, Panel, Segmented, Skeleton, Stat, Table, UpstreamBanner } from "../components/ui";
import { LineChart, SmallMultiples, TableToggle } from "../charts";
import { useAdvice, useEuroRisk, useInsightsOptions, usePolicy } from "../lib/insights";
import { useRegion } from "../lib/prefs";
import { href, setQuery } from "../lib/router";
import { cropLabel, fmtFixed, fmtNum, fmtShare } from "../lib/format";
import { CropDot, regionsFor } from "./season/common";
import { StoryBars } from "./advice/charts";
import { SoilEffects } from "./advice/SoilEffects";
import { ActionList, ChangeText, ConfidenceBadge, InsightAsync, InsightPanel, Note, RegionColumns, STORY_COLOR, Sentences, StoryToggle, fmtChange, fmtEur, fmtSignedEur, regionName, tickChange, useStories } from "./advice/kit";

const isCrop = (c: string | null): c is Crop => !!c && (CROPS as string[]).includes(c);

export function AdvicePage({ query }: PageProps) {
  const [region] = useRegion();
  const regions = regionsFor(region);
  const opts = useInsightsOptions();
  const pairs = opts.data?.advicePairs ?? [];
  const available = CROPS.filter((c) => pairs.some((p) => regions.includes(p.region) && p.crop === c));
  const qc = query.get("crop");
  const crop: Crop | null = isCrop(qc) && available.includes(qc) ? qc : (available.includes("turnip_rape") ? "turnip_rape" : available[0]) ?? null;
  const story: Story = query.get("story") === "below_2c" ? "below_2c" : "current_policies";
  const both = regions.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What does climate change mean for this crop?"
        subtitle="For the farming team and advisors before the pre-season meetings. Two futures for 2041–2060 against the climate of 1991–2020. The data is synthetic, so these aren't findings about real farms."
      />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Crop</span>
          {opts.error && !opts.data ? (
            <span className="text-sm text-berry">Could not load the crop list: {opts.error.message}</span>
          ) : !opts.data ? (
            <Skeleton className="h-8 w-72" />
          ) : (
            <Segmented ariaLabel="Crop" value={crop ?? "pea"} onChange={(c) => setQuery({ crop: c })} options={available.map((c) => ({ value: c, label: <><CropDot crop={c} />{cropLabel(c)}</> }))} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Show actions for</span>
          <StoryToggle value={story} onChange={(s) => setQuery({ story: s })} />
        </div>
      </div>

      {crop && (
        <RegionColumns regions={regions}>
          {(r) => (pairs.some((p) => p.region === r && p.crop === crop) ? <RegionAdvice region={r} crop={crop} story={story} showRegion={both} /> : <EmptyState title={`No advice for ${cropLabel(crop).toLowerCase()} in ${regionName(r)}`}>Sweden has advice for pea only.</EmptyState>)}
        </RegionColumns>
      )}
      {crop && <PolicyCosts crop={crop} regions={regions} />}
    </div>
  );
}

function RegionAdvice({ region, crop, story, showRegion }: { region: Region; crop: Crop; story: Story; showRegion: boolean }) {
  const a = useAdvice(region, crop, story);
  return (
    <div className="flex flex-col gap-5">
      {showRegion && <h2 className="font-title text-xl font-semibold text-heading">{region === "FI_SW" ? "Finland · South-West" : "Sweden · Skåne"}</h2>}
      <InsightAsync state={a} height="h-96" notFound="No advice for this region and crop">
        {(d) => <AdviceBody d={d} />}
      </InsightAsync>
    </div>
  );
}

function AdviceBody({ d }: { d: InsightsAdvice }) {
  const story = useStories();
  const label = (s: Story) => story(s).label;
  return (
    <div className="flex flex-col gap-5">
      <UpstreamBanner stale={d.stale} />
      <InsightPanel title={`${regionName(d.region)}, ${cropLabel(d.crop).toLowerCase()}`} basis={d.basis ?? null} actions={<ConfidenceBadge confidence={d.confidence} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          {d.stories.map((s) => (
            <StoryCard key={s.story} s={s} d={d} active={s.story === d.story} />
          ))}
        </div>
        {d.why.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-sm font-medium text-ink">Why</div>
            <Sentences items={d.why} />
          </div>
        )}
      </InsightPanel>

      <Panel title={`What to do (draft), ${label(d.story)}`} subtitle="Suggested actions for advisors, each with the evidence behind it">
        <ActionList actions={d.actions} note={d.actionsNote} askAbout={`${cropLabel(d.crop).toLowerCase()} in ${regionName(d.region)} under the ${label(d.story)} climate story (2041–2060)`} />
      </Panel>

      <Panel title="What's behind the yield change" subtitle="Effect on yield by weather theme, from the model">
        {!d.themes.length ? (
          <EmptyState title="No theme breakdown for this crop" />
        ) : (
          <TableToggle
            table={{
              rows: d.themes,
              rowKey: (t) => t.theme,
              columns: [
                { key: "t", header: "Theme", render: (t) => t.theme },
                { key: "a", header: label("below_2c"), align: "right", render: (t) => fmtChange(t.below2c) },
                { key: "b", header: label("current_policies"), align: "right", render: (t) => fmtChange(t.currentPolicies) },
              ],
            }}
          >
            <StoryBars ariaLabel="Effect on yield by weather theme" format={(v) => fmtChange(v)} axisFormat={tickChange} storyLabel={label} rows={d.themes.map((t) => ({ key: t.theme, label: t.theme, values: { below_2c: t.below2c, current_policies: t.currentPolicies } }))} />
          </TableToggle>
        )}
        <p className="mt-3 text-xs text-muted">{d.themesNote}</p>
      </Panel>

      <Panel title="How the season changes" subtitle="Sowing and maturity, days earlier than today">
        {!d.seasonShift.length ? (
          <EmptyState title="No season shift for this crop" />
        ) : (
          <TableToggle
            table={{
              rows: d.seasonShift,
              rowKey: (s) => s.measure,
              columns: [
                { key: "m", header: "Measure", render: (s) => `${s.label} (${s.unit})` },
                { key: "a", header: label("below_2c"), align: "right", render: (s) => fmtNum(s.below2c) },
                { key: "b", header: label("current_policies"), align: "right", render: (s) => fmtNum(s.currentPolicies) },
              ],
            }}
          >
            <StoryBars ariaLabel="Days earlier than today" format={(v) => `${fmtNum(v)} d`} storyLabel={label} rows={d.seasonShift.map((s) => ({ key: s.measure, label: s.label, values: { below_2c: s.below2c, current_policies: s.currentPolicies } }))} />
          </TableToggle>
        )}
        {d.seasonTable.length > 0 && (
          <div className="mt-4">
            <Table
              dense
              rows={d.seasonTable}
              rowKey={(r) => r.measure}
              columns={[
                { key: "m", header: "Measure", render: (r) => r.measure },
                { key: "t", header: "Today's climate", align: "right", render: (r) => fmtNum(r.today, 2) },
                { key: "a", header: label("below_2c"), align: "right", render: (r) => fmtNum(r.below2c, 2) },
                { key: "b", header: label("current_policies"), align: "right", render: (r) => fmtNum(r.currentPolicies, 2) },
              ]}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-muted">{d.seasonNote}</p>
      </Panel>

      <SoilEffects region={d.region} crop={d.crop} />
      <EuroExposure region={d.region} crop={d.crop} />
    </div>
  );
}

function StoryCard({ s, d, active }: { s: StoryResult; d: InsightsAdvice; active: boolean }) {
  const b = d.badYearsSoFar;
  return (
    <div className={`flex flex-col gap-3 rounded-card border p-3.5 ${active ? "border-brand" : "border-border"}`}>
      <div className="flex items-center gap-2 font-heading text-sm font-semibold text-heading">
        <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: STORY_COLOR[s.story] }} />
        {s.label}
        {active && <span className="text-xs font-normal text-muted">· actions below</span>}
      </div>
      <Stat label="Yield change" value={<ChangeText value={s.yieldChange} size="xl" />} foot={`If one season is dropped: ${fmtChange(s.yieldChangeLow)} to ${fmtChange(s.yieldChangeHigh)}`} />
      <Stat label="Bad-year chance" value={fmtShare(s.badYearChance)} foot={`Yield under 80 % of normal. Today: ${fmtShare(b.badYearChanceToday)}. Seen so far: ${fmtNum(b.seen)} of ${fmtNum(b.seasons)} seasons`} />
      <Stat label="Added import cost" value={fmtSignedEur(s.addedImportCostEurYr)} foot="A year, against today's climate" />
    </div>
  );
}

function EuroExposure({ region, crop }: { region: Region; crop: Crop }) {
  const e = useEuroRisk();
  return (
    <InsightPanel title="Cost of replacing shortfalls" basis={e.data?.basis ?? null}>
      <InsightAsync state={e}>{(d) => <EuroBody d={d} region={region} crop={crop} />}</InsightAsync>
    </InsightPanel>
  );
}

function EuroBody({ d, region, crop }: { d: InsightsEuroRisk; region: Region; crop: Crop }) {
  const t = d.totals.find((x) => x.region === region);
  const rows = d.byCrop.filter((r) => r.region === region && r.crop === crop);
  const label = (c: string) => d.scenarios.find((s) => s.code === c)?.label ?? c;
  return (
    <div className="flex flex-col gap-5">
      {t && (
        <div>
          <div className="mb-2 text-sm font-medium text-ink">All Apetit crops in {regionName(region)}, expected € a year</div>
          <div className="grid grid-cols-3 gap-3">
            {(["baseline", "ssp126", "ssp585"] as const).map((k) => (
              <Stat key={k} label={label(k)} value={<span className="text-xl sm:text-2xl">{fmtEur(t[k])}</span>} />
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="mb-2 text-sm font-medium text-ink">{cropLabel(crop)}</div>
        <Table
          dense
          rows={rows}
          rowKey={(r) => r.scenario}
          empty={<EmptyState title="No cost rows for this crop" />}
          columns={[
            { key: "s", header: "Climate", render: (r) => label(r.scenario) },
            { key: "sh", header: "Average shortfall", align: "right", render: (r) => `${fmtNum(r.meanShortfallT)} t` },
            { key: "e", header: "Expected (€/year)", align: "right", render: (r) => fmtEur(r.expectedCostEurYr) },
            { key: "p", header: "Bad year, 90th pct (€)", align: "right", render: (r) => fmtEur(r.badYearP90CostEur) },
            { key: "a", header: "Added vs today", align: "right", render: (r) => fmtSignedEur(r.addedVsTodaysClimateEurYr) },
          ]}
        />
      </div>
      <p className="text-xs text-muted">{d.note}</p>
    </div>
  );
}

const POLICY: { key: "fertiliserChange" | "dieselChange" | "carbonEurT"; title: string; fmt: (v: number) => string }[] = [
  { key: "fertiliserChange", title: "Fertiliser price change", fmt: (v) => fmtChange(v, 0) },
  { key: "dieselChange", title: "Diesel price change", fmt: (v) => fmtChange(v, 0) },
  { key: "carbonEurT", title: "Carbon price (€/t)", fmt: (v) => fmtNum(v) },
];

function PolicyCosts({ crop, regions }: { crop: Crop; regions: Region[] }) {
  const p = usePolicy();
  return (
    <InsightPanel title="Policy costs" basis={p.data?.basis ?? null}>
      <InsightAsync state={p}>{(d) => <PolicyBody d={d} crop={crop} regions={regions} />}</InsightAsync>
    </InsightPanel>
  );
}

function PolicyBody({ d, crop, regions }: { d: InsightsPolicy; crop: Crop; regions: Region[] }) {
  const story = useStories();
  const stories: Story[] = ["below_2c", "current_policies"];
  const inputs = d.inputs.filter((i) => i.crop === crop && regions.includes(i.region));
  const years = [...new Set(d.paths.map((x) => x.year))].sort();
  return (
    <div className="flex flex-col gap-5">
      <TableToggle
        toolbar={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {stories.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: STORY_COLOR[s] }} />
                {story(s).label}
              </span>
            ))}
            <span>Against 2025</span>
          </span>
        }
        table={{
          rows: years.flatMap((y) => stories.map((s) => d.paths.find((x) => x.year === y && x.story === s)).filter((x): x is InsightsPolicy["paths"][number] => !!x)),
          rowKey: (r) => r.story + r.year,
          columns: [
            { key: "y", header: "Year", render: (r) => r.year },
            { key: "s", header: "Story", render: (r) => r.label },
            ...POLICY.map((c) => ({ key: c.key, header: c.title, align: "right" as const, render: (r: InsightsPolicy["paths"][number]) => (r[c.key] == null ? "–" : c.fmt(r[c.key]!)) })),
          ],
        }}
      >
        <SmallMultiples
          panels={POLICY.map((c) => ({
            id: c.key,
            title: c.title,
            render: () => (
              <LineChart
                ariaLabel={c.title}
                height={180}
                formatY={c.fmt}
                series={stories.map((s) => ({ id: s, label: story(s).label, color: STORY_COLOR[s], points: d.paths.filter((x) => x.story === s).map((x) => ({ x: x.year, y: x[c.key] })) }))}
              />
            ),
          }))}
        />
      </TableToggle>
      <p className="text-xs text-muted">{d.note}</p>
      {inputs.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-ink">Typical input use for {cropLabel(crop).toLowerCase()}, from the farm surveys</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {inputs.map((i) => (
              <div key={i.region} className="grid grid-cols-2 gap-3 rounded-card bg-surface-2 p-3">
                <Stat label={`Nitrogen, ${regionName(i.region)}`} value={fmtFixed(i.nKgHa, 1)} unit="kg/ha" />
                <Stat label={`Diesel, ${regionName(i.region)}`} value={fmtFixed(i.dieselLHa, 1)} unit="l/ha" />
              </div>
            ))}
          </div>
        </div>
      )}
      <Note>
        Want to test one field under a future season?{" "}
        <a className="link" href={href("/try", { crop, weather: "high", year: 2050 })}>
          Try the model
        </a>
      </Note>
    </div>
  );
}
