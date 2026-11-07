// Model trust sections: season by season, single farm, and the live-replay "when does the estimate help?".
import { useState } from "react";
import type { Crop, Region } from "@/shared/types";
import type { BacktestTest, InsightsTrustSeasons } from "@/shared/insights";
import { Async, EmptyState, Panel, Segmented } from "../../components/ui";
import { Legend, LineChart, TableToggle, VIZ, type Series } from "../../charts";
import { useLiveReplay, useTrustSeasons } from "../../lib/insights";
import { cropLabel, fmtDayMonth, fmtFixed, fmtNum, fmtShare, regionLabel } from "../../lib/format";
import { BasisChip, pct, Select, StaleNotice } from "../try/common";

const SEASON_KEYS = [
  { label: "Actual", color: VIZ.ink, shape: "line" as const },
  { label: "Baseline: farm average", color: VIZ.baseline, shape: "dash" as const },
  { label: "Our model", color: VIZ.estimate, shape: "line" as const },
];

function seasonSeries(d: InsightsTrustSeasons): Series[] {
  const pts = (f: (s: InsightsTrustSeasons["seasons"][number]) => number | null) => d.seasons.map((s) => ({ x: s.year, y: f(s) }));
  return [
    { id: "actual", label: "Actual", color: VIZ.ink, points: pts((s) => s.actualTHa) },
    { id: "baseline", label: "Baseline", color: VIZ.baseline, dashed: true, points: pts((s) => s.baselineTHa) },
    { id: "model", label: "Our model", color: VIZ.estimate, width: 2.5, points: pts((s) => s.modelTHa) },
  ];
}

function SeasonChart({ d, height = 240 }: { d: InsightsTrustSeasons; height?: number }) {
  return (
    <TableToggle
      table={{
        columns: [
          { key: "y", header: "Season", render: (r) => String(r.year), sortValue: (r) => r.year },
          { key: "a", header: "Actual", align: "right", render: (r) => fmtFixed(r.actualTHa, 2) },
          { key: "b", header: "Baseline", align: "right", render: (r) => fmtFixed(r.baselineTHa, 2) },
          { key: "m", header: "Our model", align: "right", render: (r) => fmtFixed(r.modelTHa, 2) },
          { key: "bm", header: "Baseline miss", align: "right", render: (r) => pct(r.baselineMiss) },
          { key: "mm", header: "Our model miss", align: "right", render: (r) => pct(r.modelMiss) },
        ],
        rows: d.seasons,
        rowKey: (r) => String(r.year),
      }}
      toolbar={<Legend items={SEASON_KEYS} />}
    >
      <LineChart ariaLabel={`Actual, baseline and model yield by season, ${regionLabel(d.region)} ${cropLabel(d.crop)}`} series={seasonSeries(d)} height={height} formatX={(x) => String(x)} formatY={(y) => fmtFixed(y, 1)} />
      <p className="mt-1 text-xs text-muted">t/ha, area-weighted average yield.</p>
    </TableToggle>
  );
}

export function SeasonBySeason({ crop, regions, test }: { crop: Crop; regions: Region[]; test: BacktestTest }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {regions.map((r) => (
        <RegionSeasons key={r} region={r} crop={crop} test={test} />
      ))}
    </div>
  );
}

function RegionSeasons({ region, crop, test }: { region: Region; crop: Crop; test: BacktestTest }) {
  const s = useTrustSeasons(region, crop, test);
  return (
    <Panel title={`${regionLabel(region)}, ${cropLabel(crop).toLowerCase()}`} subtitle="Area-weighted average yield, each season held out of training" actions={s.data && <BasisChip basis={s.data.basis} />}>
      <Async state={s} empty={(d) => !d.seasons.length}>
        {(d) => (
          <>
            <StaleNotice basis={d.basis} className="mb-3" />
            <SeasonChart d={d} />
            <p className="mt-3 text-xs text-muted">{d.note}</p>
          </>
        )}
      </Async>
    </Panel>
  );
}

export function SingleFarm({ crop, regions, test }: { crop: Crop; regions: Region[]; test: BacktestTest }) {
  const [region, setRegion] = useState<Region>(regions[0]!);
  const r = regions.includes(region) ? region : regions[0]!;
  const list = useTrustSeasons(r, crop, test);
  const [farm, setFarm] = useState<string | null>(null);
  const farms = list.data?.farms ?? [];
  const f = farm && farms.includes(farm) ? farm : (farms[0] ?? null);
  const one = useTrustSeasons(f ? r : null, crop, test, f);
  return (
    <Panel
      title="Check a single farm"
      subtitle="A single farm has more random variation than a regional average, and some seasons are missing where the farm didn't report."
      actions={one.data && <BasisChip basis={one.data.basis} />}
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        {regions.length > 1 && <Segmented size="sm" ariaLabel="Region" value={r} onChange={setRegion} options={regions.map((x) => ({ value: x, label: regionLabel(x) }))} />}
        <Select label={farms.length ? `Farm (${fmtNum(farms.length)} with data)` : "Farm"} value={f ?? ""} onChange={setFarm} options={farms.map((x) => ({ value: x, label: x }))} disabled={!farms.length} className="w-48" />
      </div>
      {!f && list.data ? (
        <EmptyState title="No farm has held-out seasons for this crop in this test" />
      ) : (
        <Async state={one}>
          {(d) => (
            <>
              {d.seasons.length < 2 && <p className="mb-2 text-sm text-muted">This farm has only one held-out season in this test. Pick another farm or the other test to see a line.</p>}
              <SeasonChart d={d} height={200} />
            </>
          )}
        </Async>
      )}
    </Panel>
  );
}

const knownLabel = (k: string) => (k === "none" ? "No weather" : k === "full" ? "Whole season" : fmtDayMonth(`2000-${k}`));

export function LiveReplay({ test, scopes }: { test: BacktestTest; scopes: string[] }) {
  const [scope, setScope] = useState(scopes[0] ?? "all");
  const sc = scopes.includes(scope) ? scope : (scopes[0] ?? "all");
  const s = useLiveReplay(test, sc);
  const scopeLabel = (x: string) => {
    if (x === "all") return "All, pooled";
    const [r, c] = x.split("/");
    return `${regionLabel(r as Region)}, ${cropLabel(c!).toLowerCase()}`;
  };
  return (
    <Panel
      id="live-replay"
      title="When does the live estimate help?"
      subtitle="Past seasons replayed as if the weather arrived day by day. Lower is better."
      actions={s.data && <BasisChip basis={s.data.basis} />}
    >
      <div className="mb-3">
        <Segmented size="sm" ariaLabel="Region and crop" value={sc} onChange={setScope} options={[...scopes, "all"].filter((x, i, a) => a.indexOf(x) === i).map((x) => ({ value: x, label: scopeLabel(x) }))} />
      </div>
      <Async state={s} empty={(d) => !d.points.length}>
        {(d) => {
          const idx = d.points.map((_, i) => i);
          const first = d.firstBetter && d.firstBetter !== "none" ? d.points.findIndex((p) => p.knownUntil === d.firstBetter) : -1;
          const lead =
            d.firstBetter === "none"
              ? "Here the live estimate already beats the farm average before any of the season's weather is known."
              : d.firstBetter
                ? `Before ${knownLabel(d.firstBetter)} the live estimate is no better than the farm average.`
                : "In this replay the live estimate never beats the farm average.";
          return (
            <>
              <StaleNotice basis={d.basis} className="mb-3" />
              {d.pooled && <p className="mb-2 text-xs text-muted">Pooled: an error measure averaged over every region and crop season. It is not a total; pick a region and crop for separate figures.</p>}
              <p className="mb-3 font-medium text-ink">{lead}</p>
              <TableToggle
                toolbar={
                  <Legend
                    items={[
                      { label: "Live estimate", color: VIZ.estimate, shape: "line" },
                      { label: "Baseline: farm average", color: VIZ.baseline, shape: "dash" },
                    ]}
                  />
                }
                table={{
                  columns: [
                    { key: "k", header: "Weather known until", render: (r) => knownLabel(r.knownUntil) },
                    { key: "e", header: "Live estimate error", align: "right", render: (r) => fmtShare(r.estimateProductionError, 1) },
                    { key: "b", header: "Baseline error", align: "right", render: (r) => fmtShare(r.baselineProductionError, 1) },
                    { key: "s", header: "Seasons beating baseline", align: "right", render: (r) => fmtShare(r.shareOfSeasonsBeatingBaseline) },
                    { key: "n", header: "Region-crop seasons", align: "right", render: (r) => fmtNum(r.regionCropSeasons) },
                  ],
                  rows: d.points,
                  rowKey: (r) => r.knownUntil,
                }}
              >
                <LineChart
                  ariaLabel="Regional production error of the live estimate by how much of the season's weather is known"
                  includeZero
                  series={[
                    { id: "base", label: "Baseline: farm average", color: VIZ.baseline, dashed: true, points: d.points.map((p, i) => ({ x: idx[i]!, y: p.baselineProductionError })) },
                    { id: "est", label: "Live estimate", color: VIZ.estimate, width: 2.5, points: d.points.map((p, i) => ({ x: idx[i]!, y: p.estimateProductionError })) },
                  ]}
                  markers={first >= 0 ? [{ x: first, label: `Better from ${knownLabel(d.firstBetter!)}` }] : []}
                  formatX={(x) => knownLabel(d.points[Math.round(x)]?.knownUntil ?? "")}
                  formatY={(y) => fmtShare(y, 0)}
                />
                <p className="mt-1 text-xs text-muted">Regional production error by how far into the season the weather is known.</p>
              </TableToggle>
              <p className="mt-3 text-xs text-muted">{d.note}</p>
            </>
          );
        }}
      </Async>
    </Panel>
  );
}

