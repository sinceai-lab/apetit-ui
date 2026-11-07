// Outlook: 2027–2031 forecast, 2041–2060 yield change by crop, € at stake (contract §10.3). Builder A.
import { CROPS, type Crop, type Region } from "@/shared/types";
import type { ClimateScenario, InsightsClimateRisk, InsightsEuroRisk, InsightsOutlook } from "@/shared/insights";
import type { PageProps } from "./types";
import { Badge, EmptyState, PageHeader, Segmented, Table, UpstreamBanner } from "../components/ui";
import { BarChart, LineChart, TableToggle, SCENARIO_COLOR } from "../charts";
import { useClimateRisk, useEuroRisk, useInsightsOptions, useOutlook } from "../lib/insights";
import { useIsDark, useRegion } from "../lib/prefs";
import { href, setQuery } from "../lib/router";
import { cropLabel, fmtFixed, fmtHa, fmtNum, fmtShare, fmtTHa } from "../lib/format";
import { CropDot, regionsFor } from "./season/common";
import { DotRange } from "./advice/charts";
import { InsightAsync, InsightPanel, Note, RegionColumns, fmtEur, fmtPct, fmtSignedEur, tickPct, isLowConfidence, regionName, storyColor } from "./advice/kit";

const isCrop = (c: string | null): c is Crop => !!c && (CROPS as string[]).includes(c);
const SCENARIOS: { value: ClimateScenario; label: string }[] = [
  { value: "ssp126", label: "Below 2 °C" },
  { value: "ssp585", label: "Hothouse" },
];

export function OutlookPage({ query }: PageProps) {
  const [region] = useRegion();
  const regions = regionsFor(region);
  const opts = useInsightsOptions();
  const cropsOf = (r: Region) => opts.data?.regions.find((x) => x.code === r)?.crops ?? (r === "SE_SKANE" ? (["pea"] as Crop[]) : CROPS);
  const available = CROPS.filter((c) => regions.some((r) => cropsOf(r).includes(c)));
  const crop: Crop = isCrop(query.get("crop")) && available.includes(query.get("crop") as Crop) ? (query.get("crop") as Crop) : "pea";
  const scenario: ClimateScenario = query.get("scenario") === "ssp126" ? "ssp126" : "ssp585";
  const risk = useClimateRisk(scenario);
  const euro = useEuroRisk();
  const both = regions.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Forecast" subtitle="The next five seasons and the climate by 2041–2060, from the trained model. These are scenario results, not the live season estimate." />
      <Note tone="warn">
        <b className="font-semibold">No answers are public for these years,</b> so these are the model's estimates, not measured accuracy.{" "}
        <a className="link" href={href("/trust")}>
          See Model trust
        </a>{" "}
        for how it did on past seasons.
      </Note>

      <section className="flex flex-col gap-3" aria-labelledby="ol-next">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">2027–2031</div>
            <h2 id="ol-next" className="font-title text-xl font-semibold text-heading">
              Next five seasons
            </h2>
          </div>
          <Segmented ariaLabel="Crop" value={crop} onChange={(c) => setQuery({ crop: c })} options={available.map((c) => ({ value: c, label: <><CropDot crop={c} />{cropLabel(c)}</> }))} />
        </div>
        <RegionColumns regions={regions}>
          {(r) => (cropsOf(r).includes(crop) ? <Forecast region={r} crop={crop} showRegion={both} /> : <EmptyState title={`${regionName(r)} has no ${cropLabel(crop).toLowerCase()} contracts`}>Sweden grows only pea for Apetit.</EmptyState>)}
        </RegionColumns>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="ol-change">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">2041–2060 against 1991–2020</div>
            <h2 id="ol-change" className="font-title text-xl font-semibold text-heading">
              Yield change by crop
            </h2>
          </div>
          <Segmented ariaLabel="Climate scenario" value={scenario} onChange={(s) => setQuery({ scenario: s })} options={SCENARIOS.map((s) => ({ value: s.value, label: <><span aria-hidden className="inline-block size-2 rounded-full" style={{ background: SCENARIO_COLOR[s.value] }} />{s.label}</> }))} />
        </div>
        <InsightAsync state={risk} height="h-72">
          {(d) => (
            <RegionColumns regions={regions}>
              {(r) => <ClimateChange data={d} region={r} showRegion={both} />}
            </RegionColumns>
          )}
        </InsightAsync>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="ol-euro">
        <div>
          <div className="eyebrow">2041–2060, € a year</div>
          <h2 id="ol-euro" className="font-title text-xl font-semibold text-heading">
            € at stake: replacing shortfalls with imports
          </h2>
        </div>
        <InsightAsync state={euro} height="h-64">
          {(d) => (
            <RegionColumns regions={regions}>
              {(r) => <EuroAtStake data={d} region={r} showRegion={both} />}
            </RegionColumns>
          )}
        </InsightAsync>
      </section>
    </div>
  );
}

function Forecast({ region, crop, showRegion }: { region: Region; crop: Crop; showRegion: boolean }) {
  const o = useOutlook(region, crop);
  return (
    <InsightPanel emphasizeYears title={`${showRegion ? regionName(region) + ", " + cropLabel(crop).toLowerCase() : cropLabel(crop)}: forecast against the baseline`} basis={o.data?.basis ?? null}>
      <InsightAsync state={o} height="h-64">
        {(d) => <ForecastBody d={d} />}
      </InsightAsync>
    </InsightPanel>
  );
}

function ForecastBody({ d }: { d: InsightsOutlook }) {
  const years = [...new Set([...d.history.map((h) => h.year), ...d.forecast.map((f) => f.year)])].sort();
  const rows = years.map((year) => ({ year, actual: d.history.find((h) => h.year === year)?.actualTHa ?? null, model: d.forecast.find((f) => f.year === year)?.modelTHa ?? null, baseline: d.forecast.find((f) => f.year === year)?.baselineTHa ?? null }));
  if (!rows.length) return <EmptyState title="No forecast for this crop" />;
  const first = d.forecast[0]?.year;
  return (
    <div className="flex flex-col gap-3">
      <UpstreamBanner stale={d.stale} />
      <TableToggle
        toolbar={
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-3 bg-[var(--muted)]" />Past actual (all farms)</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-3 bg-brand" />Our model</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block w-3 border-t-2 border-dashed border-[var(--muted)]" />Baseline</li>
          </ul>
        }
        table={{
          rows,
          rowKey: (r) => String(r.year),
          columns: [
            { key: "y", header: "Season", render: (r) => r.year },
            { key: "a", header: "Actual", align: "right", render: (r) => fmtTHa(r.actual) },
            { key: "m", header: "Our model", align: "right", render: (r) => fmtTHa(r.model) },
            { key: "b", header: "Baseline", align: "right", render: (r) => fmtTHa(r.baseline) },
          ],
        }}
      >
        <LineChart
          ariaLabel="Past yields and the 2027–2031 forecast"
          height={260}
          formatY={(v) => fmtFixed(v, 1)}
          markers={first ? [{ x: first - 0.5, label: "Forecast" }] : []}
          series={[
            { id: "actual", label: "Actual", color: "var(--muted)", points: d.history.map((h) => ({ x: h.year, y: h.actualTHa })) },
            { id: "model", label: "Our model", color: "var(--brand)", width: 2.5, points: d.forecast.map((f) => ({ x: f.year, y: f.modelTHa })) },
            { id: "base", label: "Baseline", color: "var(--muted)", dashed: true, points: d.forecast.map((f) => ({ x: f.year, y: f.baselineTHa })) },
          ]}
        />
      </TableToggle>
      <p className="text-xs text-muted">t/ha. {d.note}</p>
      <p className="text-xs text-muted">The forecast follows one supplied weather run, so no range is shown for these seasons. The 2041–2060 chart below shows a range.</p>
    </div>
  );
}

function ClimateChange({ data, region, showRegion }: { data: InsightsClimateRisk; region: Region; showRegion: boolean }) {
  const dark = useIsDark();
  const rows = data.rows.filter((r) => r.region === region);
  return (
    <InsightPanel emphasizeYears title={`${showRegion ? regionName(region) + ": c" : "C"}hange in mean yield, ${data.label}`} basis={data.basis ?? null}>
      {!rows.length ? (
        <EmptyState title="No crops for this region" />
      ) : (
        <div className="flex flex-col gap-3">
          <TableToggle
            table={{
              rows,
              rowKey: (r) => r.crop,
              columns: [
                { key: "c", header: "Crop", render: (r) => <span className="inline-flex items-center gap-1.5"><CropDot crop={r.crop} />{cropLabel(r.crop)}</span> },
                { key: "m", header: "Our change", align: "right", render: (r) => fmtPct(r.meanYieldChangePct) },
                { key: "lo", header: "Low", align: "right", render: (r) => fmtPct(r.changeMinPct) },
                { key: "hi", header: "High", align: "right", render: (r) => fmtPct(r.changeMaxPct) },
                { key: "bad", header: "Bad-year chance", align: "right", render: (r) => fmtShare(r.badYearChance) },
                { key: "bb", header: "Today's bad-year chance", align: "right", render: (r) => fmtShare(r.baselineBadYearChance) },
                { key: "conf", header: "Confidence", render: (r) => <span className={isLowConfidence(r.confidence) ? "text-degraded" : ""}>{r.confidence}</span> },
              ],
            }}
          >
            <DotRange
              ariaLabel={`Yield change by crop, ${data.label}`}
              format={tickPct}
              zeroLabel="No change (baseline)"
              rows={rows.map((r) => ({
                key: r.crop,
                label: cropLabel(r.crop),
                value: r.meanYieldChangePct,
                lo: r.changeMinPct,
                hi: r.changeMaxPct,
                color: storyColor(r.meanYieldChangePct, dark),
                badge: isLowConfidence(r.confidence) ? `Low confidence: ${r.confidence}` : undefined,
                detail: [{ label: "bad-year chance", value: fmtShare(r.badYearChance) }],
              }))}
            />
          </TableToggle>
          <div className="flex flex-wrap gap-1.5">
            {rows.filter((r) => isLowConfidence(r.confidence)).map((r) => (
              <Badge key={r.crop} tone="degraded" title={r.confidence}>● Low confidence: {cropLabel(r.crop)}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted">{data.note}</p>
        </div>
      )}
    </InsightPanel>
  );
}

const COST_LABEL: Record<string, string> = { baseline: "Today's climate", ssp126: "Below 2 °C", ssp585: "Hothouse" };
const COST_COLOR: Record<string, string> = { baseline: "var(--viz-historical)", ssp126: "var(--viz-ssp126)", ssp585: "var(--viz-ssp585)" };

function EuroAtStake({ data, region, showRegion }: { data: InsightsEuroRisk; region: Region; showRegion: boolean }) {
  const t = data.totals.find((x) => x.region === region);
  const label = (c: string) => data.scenarios.find((s) => s.code === c)?.label ?? COST_LABEL[c] ?? c;
  const byCrop = data.byCrop.filter((r) => r.region === region);
  const bars = (["baseline", "ssp126", "ssp585"] as const).map((k) => ({ key: k, label: label(k), value: t?.[k] ?? null, color: COST_COLOR[k] }));
  return (
    <InsightPanel emphasizeYears title={`${showRegion ? regionName(region) + ": e" : "E"}xpected import cost a year`} basis={data.basis ?? null}>
      {!t ? (
        <EmptyState title="No cost figures for this region" />
      ) : (
        <div className="flex flex-col gap-5">
          <TableToggle
            table={{ rows: bars, rowKey: (b) => b.key, columns: [{ key: "s", header: "Climate", render: (b) => b.label }, { key: "v", header: "Expected cost (€/year)", align: "right", render: (b) => fmtEur(b.value) }] }}
          >
            <BarChart ariaLabel={`Expected import cost a year, ${regionName(region)}`} data={bars} format={(v) => fmtEur(v)} rowHeight={34} />
          </TableToggle>
          <details>
            <summary className="link cursor-pointer text-sm">By crop ({fmtNum(byCrop.length)} rows)</summary>
            <div className="mt-3">
              <Table
                dense
                maxHeight={420}
                rows={byCrop}
                rowKey={(r) => r.crop + r.scenario}
                columns={[
                  { key: "c", header: "Crop", render: (r) => <span className="inline-flex items-center gap-1.5"><CropDot crop={r.crop} />{cropLabel(r.crop)}</span>, sortValue: (r) => r.crop },
                  { key: "s", header: "Climate", render: (r) => <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2 rounded-full" style={{ background: COST_COLOR[r.scenario] ?? "var(--viz-other)" }} />{label(r.scenario)}</span> },
                  { key: "a", header: "Area", align: "right", render: (r) => fmtHa(r.areaHa) },
                  { key: "p", header: "Contract price (€/t)", align: "right", render: (r) => fmtEur(r.priceEurT) },
                  { key: "pr", header: "Premium", align: "right", render: (r) => fmtShare(r.premium) },
                  { key: "bt", header: "Usual production", align: "right", render: (r) => `${fmtNum(r.baselineT)} t` },
                  { key: "sh", header: "Average shortfall", align: "right", render: (r) => `${fmtNum(r.meanShortfallT)} t` },
                  { key: "e", header: "Expected cost (€/year)", align: "right", render: (r) => fmtEur(r.expectedCostEurYr), sortValue: (r) => r.expectedCostEurYr },
                  { key: "p90", header: "Bad year, 90th pct (€)", align: "right", render: (r) => fmtEur(r.badYearP90CostEur) },
                  { key: "add", header: "Added vs today (€/year)", align: "right", render: (r) => fmtSignedEur(r.addedVsTodaysClimateEurYr), sortValue: (r) => r.addedVsTodaysClimateEurYr },
                ]}
              />
            </div>
          </details>
          <p className="text-xs text-muted">{data.note}</p>
        </div>
      )}
    </InsightPanel>
  );
}

