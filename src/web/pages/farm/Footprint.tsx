// Farm detail: cradle-to-farm-gate carbon footprint per contract crop (derived FarmFootprint load, METHODOLOGY.md s5).
// Compares the full method (organic soils included) with the current calculator, which assumes mineral soil.
import { useState } from "react";
import type { Farm, FootprintRow } from "@/shared/types";
import { EmptyState, ErrorState, Panel, Segmented, Skeleton, Stat } from "../../components/ui";
import { Legend, LineChart, TableToggle } from "../../charts";
import { api } from "../../lib/api";
import { cropLabel, fmtFixed, fmtHa, fmtNum, fmtShare, fmtTHa } from "../../lib/format";
import { setQuery, useLocation } from "../../lib/router";
import { useApi } from "../../lib/usePoll";
import { CropDot } from "../season/common";

interface Source {
  key: string;
  label: string;
  color: string;
  flag: boolean;
  kgHa: (r: FootprintRow) => number;
  what: string;
}
// Stacking order = validated adjacency order; FLAG (land) sources first.
const SOURCES: Source[] = [
  { key: "organic", label: "Drained organic soil", color: "var(--viz-src-organic)", flag: true, kgHa: (r) => r.organicSoilKgHa, what: "CO₂ and N₂O from drained peat, by the share of the crop area on organic soil" },
  { key: "n2o", label: "Soil nitrous oxide", color: "var(--viz-src-n2o)", flag: true, kgHa: (r) => r.n2oDirectKgHa + r.n2oIndirectKgHa, what: "Direct and indirect N₂O from fertiliser, manure and crop residues" },
  { key: "lime", label: "Liming", color: "var(--viz-src-lime)", flag: true, kgHa: (r) => r.limeKgHa, what: "CO₂ released from applied lime" },
  { key: "fert", label: "Fertiliser manufacture", color: "var(--viz-src-fert)", flag: false, kgHa: (r) => r.fertiliserKgHa, what: "Making the N, P and K applied" },
  { key: "energy", label: "Fuel, sprays & power", color: "var(--viz-src-energy)", flag: false, kgHa: (r) => r.dieselKgHa + r.spraysKgHa + r.electricityKgHa, what: "Diesel, plant-protection passes, storage and irrigation electricity" },
];

const kgKg = (v: number | null | undefined) => fmtFixed(v, 2);
const METHOD_NOTE: Record<FootprintRow["method"], string> = {
  survey: "Inputs as reported in the Finnish farm survey.",
  foodhills: "Nitrogen, diesel, irrigation and delivered tonnes from Foodhills; phosphorus, lime and spray passes are pea norms (not reported). Diesel uses the Swedish blend.",
};

export function FarmFootprint({ farm }: { farm: Farm }) {
  const d = useApi((s) => api.farmFootprint(farm.farmId, s), [farm.farmId]);
  const { query } = useLocation();
  const rows = d.data?.rows ?? [];
  const crops = [...new Set(rows.map((r) => r.crop))];
  const qc = query.get("fcrop");
  const crop = qc && crops.includes(qc) ? qc : crops[0];
  const series = rows.filter((r) => r.crop === crop);
  const latest = series[series.length - 1];

  return (
    <Panel
      title="Carbon footprint at the farm gate"
      subtitle="Cradle to farm gate, per kg of crop delivered. Includes drained organic soils, which the current calculator leaves out."
      actions={crops.length > 1 ? <Segmented size="sm" ariaLabel="Crop" value={crop!} onChange={(c) => setQuery({ fcrop: c })} options={crops.map((c) => ({ value: c, label: <><CropDot crop={c} />{cropLabel(c)}</> }))} /> : undefined}
    >
      {d.error && !d.data ? (
        <ErrorState error={d.error} onRetry={d.refresh} />
      ) : !d.data ? (
        <Skeleton className="h-72" />
      ) : !latest ? (
        <EmptyState title="No footprint for this farm">It grows no Apetit contract crop, so there is no contract product to attach a footprint to.</EmptyState>
      ) : (
        <FootprintBody latest={latest} series={series} />
      )}
    </Panel>
  );
}

function FootprintBody({ latest: r, series }: { latest: FootprintRow; series: FootprintRow[] }) {
  const gap = r.currentCalcKgPerKg != null && r.currentCalcKgPerKg > 0 ? r.kgPerKg / r.currentCalcKgPerKg - 1 : null;
  const orgPart = r.totalKgHa > 0 ? r.organicSoilKgHa / r.totalKgHa : 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label={`Footprint ${r.year}`} value={kgKg(r.kgPerKg)} unit="kg CO₂e/kg" foot="organic soils included" source="FarmFootprint, derived from the survey with METHODOLOGY.md §5" />
        <Stat
          label="Current calculator"
          value={r.currentCalcKgPerKg != null ? kgKg(r.currentCalcKgPerKg) : "–"}
          unit={r.currentCalcKgPerKg != null ? "kg CO₂e/kg" : undefined}
          foot={gap == null ? "not calculated for this grower" : gap >= 1 ? `full method is ${fmtFixed(gap + 1, gap >= 9 ? 0 : 1)}× this` : `full method is ${gap >= 0 ? "+" : ""}${fmtNum(gap * 100)} % vs this`}
          source="current_calculator_footprints.csv (mineral soil assumed)"
        />
        <Stat label="From organic soil" value={fmtShare(orgPart)} foot={r.organicShare > 0 ? `${fmtShare(r.organicShare)} of the crop area is drained peat` : "no crop area on organic soil"} source="Soil map in parcels.csv; survey report if it says organic" />
        <Stat label={`Farm total ${r.year}`} value={fmtNum(r.farmTco2e, r.farmTco2e < 10 ? 1 : 0)} unit="t CO₂e" foot={`${fmtHa(r.areaHa)} at ${fmtTHa(r.yieldTHa)}`} />
      </div>

      <Composition r={r} />
      <Trend series={series} />
      <p className="text-xs text-muted">
        {METHOD_NOTE[r.method]} Factors: IPCC 2019 wet climate Tier 1 and the Finnish GHG inventory for organic soils (29 t CO₂/ha a year under annual crops). Per kg = per-hectare total ÷ yield.
      </p>
    </div>
  );
}

function Composition({ r }: { r: FootprintRow }) {
  const [hover, setHover] = useState<string | null>(null);
  const parts = SOURCES.map((s) => ({ ...s, v: Math.max(0, s.kgHa(r)) }));
  const total = parts.reduce((a, p) => a + p.v, 0);
  const flag = parts.filter((p) => p.flag).reduce((a, p) => a + p.v, 0);
  const shown = parts.filter((p) => p.v > 0);
  const flagW = total ? (flag / total) * 100 : 0;
  const hot = parts.find((p) => p.key === hover);
  return (
    <TableToggle
      toolbar={<div className="text-sm font-medium text-ink">Where the {fmtNum(total)} kg CO₂e per hectare comes from ({r.year})</div>}
      table={{
        rows: parts,
        rowKey: (p) => p.key,
        columns: [
          { key: "s", header: "Source", render: (p) => p.label },
          { key: "f", header: "SBTi", render: (p) => (p.flag ? "FLAG" : "Energy & industry") },
          { key: "v", header: "kg CO₂e/ha", align: "right", render: (p) => fmtNum(p.v) },
          { key: "k", header: "kg CO₂e/kg", align: "right", render: (p) => fmtFixed(p.v / (r.yieldTHa * 1000), 3) },
          { key: "p", header: "Share", align: "right", render: (p) => fmtShare(total ? p.v / total : null) },
        ],
      }}
    >
      <div className="flex flex-col gap-2" onMouseLeave={() => setHover(null)}>
        <div className="relative h-5 text-[11px] text-muted">
          {flagW > 0 && (
            <div className="absolute inset-y-0 left-0 flex items-end border-b border-l border-r border-border px-1 pb-0.5" style={{ width: `${flagW}%`, minWidth: "4.5rem" }}>
              <span className="truncate">FLAG (land) · {fmtShare(flag / total)}</span>
            </div>
          )}
        </div>
        <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={`Footprint by source: ${parts.map((p) => `${p.label} ${fmtNum(p.v)} kg CO2e per hectare`).join(", ")}`}>
          {shown.map((p, i) => (
            <div
              key={p.key}
              onMouseEnter={() => setHover(p.key)}
              className="h-full transition-opacity"
              style={{
                flexBasis: `${(p.v / total) * 100}%`,
                minWidth: 2,
                background: p.color,
                opacity: hover && hover !== p.key ? 0.35 : 1,
                borderRadius: i === 0 ? "4px 0 0 4px" : i === shown.length - 1 ? "0 4px 4px 0" : 0,
              }}
            />
          ))}
        </div>
        <div className="min-h-[1.25rem] text-xs text-muted" aria-live="polite">
          {hot ? (
            <span>
              <b className="tnum font-semibold text-ink">{fmtNum(hot.v)} kg/ha</b> ({fmtShare(hot.v / total)}) · {hot.label}: {hot.what}
            </span>
          ) : (
            "Hover a segment for what it covers."
          )}
        </div>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2" onMouseEnter={() => setHover(p.key)}>
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
              <span className="truncate text-muted">{p.label}</span>
              <span className="tnum ml-auto font-medium text-ink">{fmtNum(p.v)}</span>
              <span className="tnum w-11 text-right text-xs text-muted">{fmtShare(total ? p.v / total : null)}</span>
            </li>
          ))}
        </ul>
      </div>
    </TableToggle>
  );
}

// Only years with a report; LineChart draws no dots, so a lone year between gaps would vanish.
const byYear = (series: FootprintRow[], y: (r: FootprintRow) => number | null) => series.map((r) => ({ x: r.year, y: y(r) }));

function Trend({ series }: { series: FootprintRow[] }) {
  const hasCalc = series.some((r) => r.currentCalcKgPerKg != null);
  const hasOrg = series.some((r) => r.organicSoilKgHa > 0);
  const lines = [
    { id: "full", label: "Full method, organic soils included", color: "var(--brand)", width: 2.5, points: byYear(series, (r) => r.kgPerKg) },
    ...(hasOrg ? [{ id: "mineral", label: "Same method, mineral soil only", color: "var(--viz-src-organic)", dashed: true, points: byYear(series, (r) => r.mineralOnlyKgPerKg) }] : []),
    ...(hasCalc ? [{ id: "calc", label: "Current calculator", color: "var(--muted)", dashed: true, points: byYear(series, (r) => r.currentCalcKgPerKg) }] : []),
  ];
  if (series.length < 2) return null;
  return (
    <TableToggle
      toolbar={<div className="text-sm font-medium text-ink">Footprint per kg over the years</div>}
      table={{
        rows: [...series].reverse(),
        rowKey: (r) => String(r.year),
        columns: [
          { key: "y", header: "Year", render: (r) => r.year },
          { key: "f", header: "Full method", align: "right", render: (r) => kgKg(r.kgPerKg) },
          { key: "m", header: "Mineral soil only", align: "right", render: (r) => kgKg(r.mineralOnlyKgPerKg) },
          { key: "c", header: "Current calculator", align: "right", render: (r) => kgKg(r.currentCalcKgPerKg) },
          { key: "y2", header: "Yield", align: "right", render: (r) => fmtTHa(r.yieldTHa) },
          { key: "t", header: "Farm total", align: "right", render: (r) => `${fmtNum(r.farmTco2e, 1)} t` },
        ],
      }}
    >
      <div className="flex flex-col gap-2">
        {lines.length > 1 && <Legend items={lines.map((l) => ({ label: l.label, color: l.color }))} />}
        <LineChart ariaLabel="Footprint per kg by year" height={220} includeZero formatX={(x) => String(Math.round(x))} formatY={(v) => fmtFixed(v, 2)} series={lines} />
        <p className="text-xs text-muted">kg CO₂e per kg, years with a report (table lists them). Big jumps come from which fields carried the crop that year (peat or mineral soil); small swings follow the yield.</p>
      </div>
    </TableToggle>
  );
}
