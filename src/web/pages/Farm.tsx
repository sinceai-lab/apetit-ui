import { useState } from "react";
import { ArrowLeft, CloudSun, FileSearch, Leaf } from "lucide-react";
import type { Farm, Parcel, Prediction } from "@/shared/types";
import type { PageProps } from "./types";
import { Badge, Button, EmptyState, ErrorState, LinkButton, PageHeader, Panel, Skeleton, Stat, Table, UpstreamBanner, type Column } from "../components/ui";
import { BulletBar, TableToggle } from "../charts";
import { api } from "../lib/api";
import { cropLabel, fmtFixed, fmtHa, fmtNum, fmtTHa } from "../lib/format";
import { href } from "../lib/router";
import { useApi } from "../lib/usePoll";
import { CellWeather } from "./farm/CellWeather";
import { FarmFinder } from "./farm/FarmFinder";
import { FarmMiniMap } from "./farm/FarmMiniMap";
import { ParcelHistory } from "./farm/ParcelHistory";
import { SourceDrawer } from "./farm/SourceDrawer";
import { CropDot, Delta, EarlySeasonNote, LiveNote, modeOf, predictionSource, regionFlag, weightedDelta } from "./season/common";

const SEGMENT: Record<string, string> = { veg: "Vegetables", oil: "Oilseed", se_pea: "Frozen pea (Sweden)" };

export function FarmPage({ params }: PageProps) {
  if (!params.farmId) return <FarmFinder />;
  return <FarmDetail key={params.farmId} farmId={params.farmId} />;
}

function FarmDetail({ farmId }: { farmId: string }) {
  const d = useApi((s) => api.farm(farmId, s), [farmId]);
  const [source, setSource] = useState(false);

  if (d.error && !d.data) {
    if (d.error.status === 404 || d.error.status === 400)
      return (
        <div>
          <PageHeader title={`Farm ${farmId}`} />
          <EmptyState title={`We could not find farm ${farmId}`}>
            Farm ids look like F0001 (Finland) or S0381 (Sweden).{" "}
            <a className="font-medium text-brand underline" href={href("/farm")}>
              Search all farms
            </a>
          </EmptyState>
        </div>
      );
    return (
      <div>
        <PageHeader title={`Farm ${farmId}`} />
        <ErrorState error={d.error} onRetry={d.refresh} />
      </div>
    );
  }
  if (!d.data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-32" />
        <Skeleton className="h-80" />
      </div>
    );

  const { farm, parcels, predictions, cell } = d.data;
  const asOf = predictions.reduce((m, p) => (p.asOfDate > m ? p.asOfDate : m), "");
  const area = predictions.reduce((s, p) => s + p.areaHa, 0);
  const est = predictions.reduce((s, p) => s + p.yieldTHa * p.areaHa, 0);

  return (
    <div className="flex flex-col gap-5">
      <a href={href("/season")} className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Live season
      </a>
      <PageHeader
        title={`Farm ${farm.farmId}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{regionFlag(farm.region)}</span>
            <span aria-hidden>·</span>
            <span>{SEGMENT[farm.segment] ?? farm.segment}</span>
            {farm.joinedYear && (
              <>
                <span aria-hidden>·</span>
                <span>Apetit grower since {farm.joinedYear}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            {cell && (
              <LinkButton href={href(`/weather/${cell.cellId}`)}>
                <CloudSun className="size-4" aria-hidden /> Weather {cell.cellId}
              </LinkButton>
            )}
            <Button onClick={() => setSource(true)}>
              <FileSearch className="size-4" aria-hidden /> Source
            </Button>
          </>
        }
      />
      <UpstreamBanner errors={d.data.errors} stale={d.data.stale} />

      <div className="flex flex-wrap gap-1.5">
        {farm.organic && (
          <Badge tone="brand">
            <Leaf className="size-3" aria-hidden /> Organic
          </Badge>
        )}
        {/* <Badge>{farm.livestock ? "Livestock on farm" : "No livestock"}</Badge> */}
        {farm.contractCrops.length ? (
          farm.contractCrops.map((c) => (
            <Badge key={c}>
              <CropDot crop={c} className="size-2" /> {cropLabel(c)} contract
            </Badge>
          ))
        ) : (
          <Badge tone="rapeseed">Contract crops not recorded</Badge>
        )}
      </div>

      {predictions.length > 0 ? (
        <Panel title="This season's estimate" subtitle={<LiveNote asOfDate={asOf} observed={modeOf(predictions.map((p) => p.observedDays))} total={modeOf(predictions.map((p) => p.totalDays))} filledAhead={modeOf(predictions.map((p) => p.filledFutureDays))} />}>
          <EarlySeasonNote asOfDate={asOf} />
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Estimated yield" value={fmtFixed(area ? est / area : null, 2)} unit="t/ha" source={predictionSource(predictions)} />
            <Stat label="vs usual yield" value={<Delta value={weightedDelta(predictions)} size="xl" />} foot="area-weighted, this farm's history" />
            <Stat label="Estimated harvest" value={fmtNum(est)} unit="t" source={predictionSource(predictions)} />
            <Stat label="Contract parcels" value={fmtNum(predictions.length)} foot={fmtHa(area)} />
          </div>
          <div className="mt-5">
            <ParcelBullets preds={predictions} />
          </div>
        </Panel>
      ) : (
        <EmptyState title="No live estimate for this farm">None of its parcels has an Apetit contract crop the yield model covers this season.</EmptyState>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ContractFacts farm={farm} />
        <Panel title="Where it is" subtitle={cell ? `Nearest weather grid cell ${cell.cellId} (dashed square), ${fmtNum(cell.elevationM)} m above sea level` : undefined}>
          <FarmMiniMap farm={farm} parcels={parcels} preds={predictions} cell={cell} />
        </Panel>
      </div>

      <ParcelsTable parcels={parcels} preds={predictions} />

      {cell && (
        <Panel title={`Weather at ${cell.cellId}`} subtitle="Observed daily weather for the 2027 season, as used by the yield model">
          <CellWeather cellId={cell.cellId} />
        </Panel>
      )}

      <SourceDrawer
        open={source}
        onClose={() => setSource(false)}
        entities={[{ id: farm.id, label: `Farm ${farm.farmId}` }, ...parcels.map((p) => ({ id: p.id, label: `Parcel ${p.parcelId} (${cropLabel(p.crop)})` }))]}
      />
    </div>
  );
}

function ParcelBullets({ preds }: { preds: Prediction[] }) {
  const sorted = [...preds].sort((a, b) => a.parcelId.localeCompare(b.parcelId));
  const crops = [...new Set(sorted.map((p) => p.crop))];
  return (
    <TableToggle
      toolbar={<div className="text-sm font-medium text-ink">Estimate vs usual, per contract parcel</div>}
      table={{
        rows: sorted,
        rowKey: (p) => p.parcelId + p.crop,
        columns: [
          { key: "p", header: "Parcel", render: (p) => p.parcelId },
          { key: "c", header: "Crop", render: (p) => cropLabel(p.crop) },
          { key: "e", header: "Estimate", align: "right", render: (p) => fmtTHa(p.yieldTHa) },
          { key: "b", header: "Usual", align: "right", render: (p) => fmtTHa(p.baselineTHa) },
          { key: "d", header: "Δ", align: "right", render: (p) => <Delta value={p.deltaPct} /> },
        ],
      }}
    >
      <div className="flex flex-col gap-4">
        {crops.map((c) => {
          const rows = sorted.filter((p) => p.crop === c);
          const max = Math.max(...rows.map((p) => Math.max(p.yieldTHa, p.baselineTHa ?? 0))) * 1.15;
          return (
            <div key={c}>
              <div className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted">
                <CropDot crop={c} /> {cropLabel(c)}
              </div>
              <ul className="flex flex-col gap-1.5">
                {rows.map((p) => (
                  <li key={p.parcelId} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                    <span className="tnum truncate text-muted">{p.parcelId}</span>
                    <BulletBar estimate={p.yieldTHa} baseline={p.baselineTHa} max={max} label={p.parcelId} />
                    <span className="tnum flex w-36 items-baseline justify-end gap-2 text-xs">
                      <b className="font-semibold">{fmtTHa(p.yieldTHa)}</b>
                      <Delta value={p.deltaPct} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-xs text-muted">Bar = estimate (colour shows above or below usual), tick = usual yield for this farm.</p>
      </div>
    </TableToggle>
  );
}

const FACTS: { key: string; label: string; fmt: (v: number | string | boolean | null) => string }[] = [
  { key: "area_ha", label: "Contract area", fmt: (v) => (typeof v === "number" ? fmtHa(v) : "–") },
  { key: "irrigated", label: "Irrigated", fmt: (v) => (v === true ? "Yes" : v === false ? "No" : "–") },
  { key: "n_mineral_kg_ha", label: "Mineral nitrogen", fmt: (v) => (typeof v === "number" ? `${fmtNum(v, 1)} kg/ha` : "–") },
  { key: "n_applied_kg_ha", label: "Nitrogen applied", fmt: (v) => (typeof v === "number" ? `${fmtNum(v, 1)} kg/ha` : "–") },
  { key: "yield_t_ha", label: "Yield reported", fmt: (v) => (typeof v === "number" ? fmtTHa(v) : "–") },
  { key: "delivered_tonnes", label: "Delivered", fmt: (v) => (typeof v === "number" ? `${fmtNum(v, 1)} t` : "–") },
];
const EXTRA_LABEL: Record<string, string> = {
  diesel_l_ha: "Diesel (l/ha)",
  p_kg_ha: "Phosphorus (kg/ha)",
  lime_t_ha: "Lime (t/ha)",
  n_manure_kg_ha: "Manure nitrogen (kg/ha)",
  sprays: "Spray passes",
  catch_crop_share: "Catch crop share",
  soil_type_reported: "Soil (reported)",
  fertiliser_product: "Fertiliser",
  carbon_footprint_kgco2e_per_kg: "Carbon footprint (kg CO₂e/kg)",
  survey_id: "Survey",
};

function ContractFacts({ farm }: { farm: Farm }) {
  const crops = Object.entries(farm.perCrop);
  return (
    <Panel title="Contract and survey facts" subtitle="As reported by the farm (survey and contract files)">
      {!crops.length ? (
        <EmptyState title="No survey or contract facts on file for this farm" />
      ) : (
        <div className="flex flex-col gap-4">
          {crops.map(([crop, facts]) => {
            const main = FACTS.filter((f) => f.key in facts);
            const extra = Object.entries(facts).filter(([k]) => !FACTS.some((f) => f.key === k) && k !== "calculator_note");
            return (
              <div key={crop}>
                <div className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <CropDot crop={crop} /> {cropLabel(crop)}
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {main.map((f) => (
                    <div key={f.key} className="rounded-lg bg-surface-2 px-3 py-2">
                      <dt className="text-xs text-muted">{f.label}</dt>
                      <dd className="tnum text-lg font-semibold text-ink">{f.fmt(facts[f.key] ?? null)}</dd>
                    </div>
                  ))}
                </dl>
                {extra.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13px] font-medium text-brand">More survey details ({extra.length})</summary>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      {extra.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-muted">{EXTRA_LABEL[k] ?? k.replace(/_/g, " ")}</dt>
                          <dd className="tnum">{typeof v === "number" ? fmtNum(v, 2) : typeof v === "boolean" ? (v ? "yes" : "no") : String(v ?? "–")}</dd>
                        </div>
                      ))}
                    </dl>
                    {typeof facts.calculator_note === "string" && <p className="mt-2 text-xs text-muted">Note: {facts.calculator_note}</p>}
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

interface Row {
  parcelId: string;
  parcel: Parcel | null;
  pred: Prediction | null;
}

function ParcelsTable({ parcels, preds }: { parcels: Parcel[]; preds: Prediction[] }) {
  const byParcel = new Map(preds.map((p) => [p.parcelId, p]));
  const rows: Row[] = parcels.map((p) => ({ parcelId: p.parcelId, parcel: p, pred: byParcel.get(p.parcelId) ?? null }));
  for (const p of preds) if (!parcels.some((x) => x.parcelId === p.parcelId)) rows.push({ parcelId: p.parcelId, parcel: null, pred: p });
  const cols: Column<Row>[] = [
    { key: "id", header: "Parcel", render: (r) => <span className="font-medium">{r.parcelId}</span>, sortValue: (r) => r.parcelId },
    {
      key: "contract",
      header: "Contract crop",
      render: (r) =>
        r.pred ? (
          <span className="inline-flex items-center gap-1.5">
            <CropDot crop={r.pred.crop} />
            {cropLabel(r.pred.crop)}
          </span>
        ) : (
          <span className="text-muted">–</span>
        ),
      sortValue: (r) => r.pred?.crop ?? null,
    },
    { key: "plan", header: "Rotation plan", render: (r) => (r.parcel ? cropLabel(r.parcel.crop) : "–"), sortValue: (r) => r.parcel?.crop ?? null },
    { key: "ha", header: "Area", align: "right", render: (r) => fmtHa(r.parcel?.areaHa ?? r.pred?.areaHa), sortValue: (r) => r.parcel?.areaHa ?? r.pred?.areaHa ?? null },
    { key: "soil", header: "Soil", render: (r) => r.parcel?.soil ?? "–", sortValue: (r) => r.parcel?.soil ?? null },
    { key: "drain", header: "Drainage", render: (r) => (r.parcel?.drainage ?? "–").replace(/_/g, " "), sortValue: (r) => r.parcel?.drainage ?? null },
    { key: "est", header: "Estimate", align: "right", render: (r) => (r.pred ? fmtTHa(r.pred.yieldTHa) : "–"), sortValue: (r) => r.pred?.yieldTHa ?? null },
    { key: "base", header: "Usual", align: "right", render: (r) => (r.pred ? fmtTHa(r.pred.baselineTHa) : "–"), sortValue: (r) => r.pred?.baselineTHa ?? null },
    { key: "d", header: "Δ", align: "right", render: (r) => (r.pred ? <Delta value={r.pred.deltaPct} /> : "–"), sortValue: (r) => r.pred?.deltaPct ?? null },
    { key: "hist", header: "Over the season", render: (r) => (r.pred ? <ParcelHistory parcelId={r.parcelId} /> : null) },
  ];
  return (
    <Panel title="Parcels" subtitle={`${fmtNum(rows.length)} parcels · ${fmtNum(preds.length)} with an Apetit contract crop. The rotation plan can differ from the contract crop; estimates always use the contract crop.`}>
      <Table dense rows={rows} rowKey={(r) => r.parcelId} columns={cols} initialSort={{ key: "est", dir: "desc" }} caption="Parcels" empty={<EmptyState title="No parcels on file" />} />
    </Panel>
  );
}
