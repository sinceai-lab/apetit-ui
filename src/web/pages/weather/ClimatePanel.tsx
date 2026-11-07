// Monthly climate from the broker's temporal API, rolled up per year: 1991–2026 history, 2027–2060 per SSP scenario.
import { useMemo, useState } from "react";
import type { ClimateAttr, ClimatePoint } from "@/shared/types";
import { api } from "../../lib/api";
import { useApi } from "../../lib/usePoll";
import { fmtFixed, fmtNum } from "../../lib/format";
import { Legend, LineChart, SCENARIO_COLOR, TableToggle, type Series } from "../../charts";
import { Async, Panel, Segmented, Skeleton, Stat } from "../../components/ui";
import { annual, CLIMATE_INFO, monthNormal, periodMean, SCENARIOS, type AnnualRow, type Scenario } from "./stats";

const ATTRS: ClimateAttr[] = ["tmean_c", "precip_mm", "pet_mm", "hot_days_tmax_ge_27"];
const SC_LABEL: Record<Scenario, string> = { historical: "Historical", ssp126: "Low emissions (SSP1-2.6)", ssp245: "Middle (SSP2-4.5)", ssp585: "High emissions (SSP5-8.5)" };

export function ClimatePanel({ cellId }: { cellId: string }) {
  const [attr, setAttr] = useState<ClimateAttr>("tmean_c");
  const info = CLIMATE_INFO[attr];
  const state = useApi((s) => api.climate(cellId, [attr], { from: "1991-01", to: "2060-12" }, s), [cellId, attr]);
  const digits = attr === "tmean_c" ? 1 : 0;
  const f = (v: number | null | undefined) => (v == null ? "–" : `${fmtFixed(v, digits)} ${info.unit}`);

  return (
    <Panel
      title="Long-term climate"
      subtitle={`Modelled climate for cell ${cellId}, ${info.annualLabel}. Past years are one historical run; from 2027 there are three emission scenarios.`}
      actions={
        <Segmented
          size="sm"
          ariaLabel="Climate variable"
          value={attr}
          onChange={setAttr}
          options={ATTRS.map((a) => ({ value: a, label: CLIMATE_INFO[a].short, title: CLIMATE_INFO[a].label }))}
        />
      }
    >
      <Async state={state} loading={<Skeleton className="h-64" />}>
        {(d) => <ClimateBody points={d.attrs[attr] ?? []} attr={attr} f={f} digits={digits} />}
      </Async>
    </Panel>
  );
}

function ClimateBody({ points, attr, f, digits }: { points: ClimatePoint[]; attr: ClimateAttr; f: (v: number | null | undefined) => string; digits: number }) {
  const info = CLIMATE_INFO[attr];
  const rows = useMemo(() => annual(points, info.agg), [points, info.agg]);
  if (!rows.length) return <p className="py-6 text-sm text-muted">No climate data for this cell.</p>;

  const normal = periodMean(rows, "historical", 1991, 2020);
  const mid = (s: Scenario) => periodMean(rows, s, 2041, 2060);
  const series: Series[] = SCENARIOS.map((s) => ({
    id: s,
    label: SC_LABEL[s],
    color: SCENARIO_COLOR[s]!,
    width: s === "historical" ? 1.75 : 2,
    dashed: s === "ssp126",
    points: rows.filter((r) => r[s] != null).map((r) => ({ x: r.year, y: r[s]! })),
  })).filter((s) => s.points.length);
  const june = monthNormal(points, "06", "historical", 1991, 2020);

  const cols = [
    { key: "y", header: "Year", render: (r: AnnualRow) => r.year, sortValue: (r: AnnualRow) => r.year },
    ...SCENARIOS.map((s) => ({ key: s, header: SC_LABEL[s], align: "right" as const, render: (r: AnnualRow) => (r[s] == null ? "–" : fmtFixed(r[s], digits)), sortValue: (r: AnnualRow) => r[s] ?? null })),
  ];
  const delta = (v: number | null) => (v == null || normal == null ? null : v - normal);
  const signed = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtFixed(Math.abs(v), digits)}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Usual (1991–2020)" value={normal == null ? "–" : fmtFixed(normal, digits)} unit={info.unit} foot={attr === "precip_mm" && june != null ? `June usually ${fmtNum(june)} mm` : info.annualLabel} />
        {(["ssp126", "ssp245", "ssp585"] as const).map((s) => (
          <Stat key={s} label={<span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: SCENARIO_COLOR[s] }} />2041–2060 · {s.toUpperCase().replace("SSP", "SSP ")}</span>} value={signed(delta(mid(s)))} unit={info.unit} foot={`vs usual · ${f(mid(s))}`} />
        ))}
      </div>
      <TableToggle table={{ columns: cols, rows, rowKey: (r) => String(r.year), caption: `${info.label} per year` }} toolbar={<Legend items={series.map((s) => ({ label: s.label, color: s.color, shape: s.dashed ? "dash" : "line" }))} />}>
        <LineChart series={series} formatX={(x) => String(Math.round(x))} formatY={(v) => fmtFixed(v, digits)} markers={[{ x: 2027, label: "Season 2027" }]} ariaLabel={`${info.label} per year, 1991 to 2060`} height={260} includeZero={attr === "hot_days_tmax_ge_27"} />
      </TableToggle>
      <p className="text-[11px] text-muted">Source: ClimateGridCell monthly values (broker temporal API). Scenarios are projections, not forecasts; single years vary a lot.</p>
    </div>
  );
}
