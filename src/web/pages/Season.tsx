import { ArrowRight, X } from "lucide-react";
import { CROPS, type Crop, type Prediction, type Region } from "@/shared/types";
import { cropSummaries, farmSummaries, filterPredictions } from "@/shared/aggregate";
import type { PageProps } from "./types";
import { Button, EmptyState, ErrorState, LinkButton, PageHeader, Panel, Segmented, Skeleton, Stat, Table, UpstreamBanner, type Column } from "../components/ui";
import { BulletBar, CompletenessBar, DeltaLegend, TableToggle } from "../charts";
import { api } from "../lib/api";
import { cropLabel, fmtDate, fmtHa, fmtNum, fmtShare, fmtTHa, regionShort } from "../lib/format";
import { useRegion } from "../lib/prefs";
import { href, setQuery } from "../lib/router";
import { POLL, useApi } from "../lib/usePoll";
import { binDeltas, DeltaHistogram } from "./season/DeltaHistogram";
import { Callout, CropDot, Delta, EarlySeasonNote, LiveNote, modeOf, predictionSource, regionFlag, regionsFor } from "./season/common";
import type { FarmSummary } from "@/shared/types";

const isCrop = (c: string | null): c is Crop => !!c && (CROPS as string[]).includes(c);

export function SeasonPage({ query }: PageProps) {
  const [region] = useRegion();
  const crop: Crop = isCrop(query.get("crop")) ? (query.get("crop") as Crop) : "pea";
  const farm = query.get("farm");
  const preds = useApi((s) => api.predictions({ region, crop }, s), [region, crop], { intervalMs: POLL.predictions });
  const regions = regionsFor(region);
  const rows = preds.data?.predictions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Live season"
        subtitle="Estimated yield for each contract crop, compared with each farm's usual yield. Estimates update as new weather comes in."
        actions={<DeltaLegend />}
      />
      <Segmented
        ariaLabel="Crop"
        value={crop}
        onChange={(c) => setQuery({ crop: c, farm: null })}
        options={CROPS.map((c) => ({ value: c, label: <><CropDot crop={c} />{cropLabel(c)}</> }))}
      />
      {preds.data && <UpstreamBanner errors={preds.data.errors} stale={preds.data.stale} />}
      {preds.data && <EarlySeasonNote asOfDate={preds.data.asOfDate} />}

      {preds.error && !preds.data ? (
        <ErrorState error={preds.error} onRetry={preds.refresh} />
      ) : !preds.data ? (
        <div className={regions.length > 1 ? "grid gap-4 lg:grid-cols-2" : ""}>
          {regions.map((r) => (
            <Skeleton key={r} className="h-96" />
          ))}
        </div>
      ) : (
        <>
          <div className={regions.length > 1 ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
            {regions.map((r) => (
              <CropRegion key={r} crop={crop} region={r} rows={filterPredictions(rows, { region: r })} wide={regions.length === 1} />
            ))}
          </div>
          {rows.length > 0 && <FarmDrill crop={crop} rows={rows} showRegion={regions.length > 1} farm={farm} />}
        </>
      )}
    </div>
  );
}

function CropRegion({ crop, region, rows, wide }: { crop: Crop; region: Region; rows: Prediction[]; wide: boolean }) {
  if (!rows.length)
    return (
      <Panel title={`${cropLabel(crop)} · ${regionFlag(region)}`}>
        <EmptyState title={`No ${cropLabel(crop).toLowerCase()} contracts in ${region === "FI_SW" ? "Finland" : "Sweden"}`}>
          The yield model only covers crops that Apetit contracts in this region. Try another crop or region.
        </EmptyState>
      </Panel>
    );
  const s = cropSummaries(rows)[0]!;
  const gap = modeOf(rows.map((p) => p.filledGapDays));
  const bins = binDeltas(rows);
  const src = predictionSource(rows);
  const below = rows.filter((p) => p.deltaPct != null && p.deltaPct < -5).length;
  const above = rows.filter((p) => p.deltaPct != null && p.deltaPct > 5).length;

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <CropDot crop={crop} className="size-3" />
          {cropLabel(crop)} · {regionFlag(region)}
        </span>
      }
      subtitle={<LiveNote asOfDate={s.asOfDate} />}
    >
      <div className={wide ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : "flex flex-col gap-5"}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Estimated yield" value={fmtTHa(s.estTHa).replace(" t/ha", "")} unit="t/ha" delta={<Delta value={s.deltaPct} />} source={src} />
            <Stat label="Usual yield (farm average)" value={fmtTHa(s.baseTHa).replace(" t/ha", "")} unit="t/ha" source="baselineYield: each farm's historical mean for this crop" />
            <Stat label="Contract area" value={fmtNum(s.areaHa)} unit="ha" foot={`${fmtNum(s.parcels)} parcels · ${fmtNum(s.farms)} farms`} />
            <Stat label="Estimated harvest" value={fmtNum(s.estTonnes)} unit="t" foot={`usual ${fmtNum(s.baseTonnes)} t`} source={src} />
          </div>
          <div>
            <BulletBar estimate={s.estTHa} baseline={s.baseTHa} max={Math.max(s.estTHa, s.baseTHa ?? 0) * 1.2} label={`${cropLabel(crop)} ${regionShort(region)}`} height={18} />
            <p className="mt-1 text-xs text-muted">Bar = estimated yield, tick = usual yield.</p>
          </div>
          <div>
            <div className="mb-1 text-[13px] font-medium text-ink">Season so far</div>
            <CompletenessBar observed={s.completeness.observedDays} filledGap={gap} filledAhead={s.completeness.filledFutureDays} total={s.completeness.totalDays} />
          </div>
          {s.outOfRangeShare > 0.05 && (
            <Callout>
              For <b className="tnum">{fmtShare(s.outOfRangeShare)}</b> of these parcels, some of this season's weather is outside what the model was trained on. Treat those estimates with extra care.
            </Callout>
          )}
        </div>
        <div>
          <TableToggle
            toolbar={
              <div>
                <div className="text-sm font-medium text-ink">How parcels compare with usual</div>
                <div className="tnum text-xs text-muted">
                  {fmtNum(below)} parcels more than 5 % below · {fmtNum(above)} more than 5 % above
                </div>
              </div>
            }
            table={{
              rows: bins.filter((b) => b.count > 0),
              rowKey: (b) => b.key,
              columns: [
                { key: "b", header: "Δ vs usual", render: (b) => b.label },
                { key: "n", header: "Parcels", align: "right", render: (b) => fmtNum(b.count) },
                { key: "a", header: "Area", align: "right", render: (b) => fmtHa(b.areaHa) },
              ],
            }}
          >
            <DeltaHistogram bins={bins} ariaLabel={`Distribution of ${rows.length} parcels by estimate vs usual yield`} />
            <p className="mt-1 text-xs text-muted">Number of parcels in each 5 % band. The dashed line is the usual yield.</p>
          </TableToggle>
        </div>
      </div>
    </Panel>
  );
}

function FarmDrill({ crop, rows, showRegion, farm }: { crop: Crop; rows: Prediction[]; showRegion: boolean; farm: string | null }) {
  const farms = farmSummaries(rows);
  const max = Math.max(...farms.map((f) => Math.max(f.estTHa, f.baseTHa ?? 0))) * 1.05;
  const selected = farm ? farms.find((f) => f.farmId === farm) : undefined;
  const cols: Column<FarmSummary>[] = [
    {
      key: "farm",
      header: "Farm",
      render: (f) => (
        <a href={href(`/farm/${f.farmId}`)} onClick={(e) => e.stopPropagation()} className="link">
          {f.farmId}
        </a>
      ),
      sortValue: (f) => f.farmId,
    },
    ...(showRegion ? [{ key: "r", header: "Region", render: (f: FarmSummary) => regionShort(f.region), sortValue: (f: FarmSummary) => f.region }] : []),
    { key: "p", header: "Parcels", align: "right", render: (f) => fmtNum(f.parcels), sortValue: (f) => f.parcels },
    { key: "ha", header: "Area", align: "right", render: (f) => fmtHa(f.areaHa), sortValue: (f) => f.areaHa },
    { key: "est", header: "Estimate", align: "right", render: (f) => fmtTHa(f.estTHa), sortValue: (f) => f.estTHa },
    { key: "base", header: "Usual", align: "right", render: (f) => fmtTHa(f.baseTHa), sortValue: (f) => f.baseTHa },
    { key: "bar", header: <span className="sr-only">Estimate vs usual</span>, className: "hidden w-40 sm:table-cell", render: (f) => <BulletBar estimate={f.estTHa} baseline={f.baseTHa} max={max} height={10} /> },
    { key: "d", header: "Δ", align: "right", render: (f) => <Delta value={f.deltaPct} />, sortValue: (f) => f.deltaPct },
  ];
  return (
    <div className={selected ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}>
      <Panel title={`${cropLabel(crop)} farms`} subtitle={`${fmtNum(farms.length)} farms. Click a row to see its parcels, or the farm id for full details.`}>
        <Table
          dense
          rows={farms}
          rowKey={(f) => f.farmId}
          columns={cols}
          initialSort={{ key: "d", dir: "asc" }}
          maxHeight={520}
          onRowClick={(f) => setQuery({ farm: f.farmId === farm ? null : f.farmId })}
          caption={`${cropLabel(crop)} farms`}
        />
      </Panel>
      {selected && <FarmParcels farm={selected} rows={rows.filter((p) => p.farmId === selected.farmId)} crop={crop} />}
    </div>
  );
}

function FarmParcels({ farm, rows, crop }: { farm: FarmSummary; rows: Prediction[]; crop: Crop }) {
  return (
    <Panel
      title={`Farm ${farm.farmId}`}
      subtitle={`${cropLabel(crop)} parcels · ${regionFlag(farm.region)}`}
      actions={
        <Button variant="ghost" aria-label="Close parcels" onClick={() => setQuery({ farm: null })}>
          <X className="size-4" />
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Stat label="Estimated yield" value={fmtTHa(farm.estTHa).replace(" t/ha", "")} unit="t/ha" delta={<Delta value={farm.deltaPct} />} source={predictionSource(rows)} />
        <Stat label="Area" value={fmtNum(farm.areaHa, 1)} unit="ha" />
      </div>
      <Table
        dense
        rows={rows}
        rowKey={(p) => p.parcelId}
        initialSort={{ key: "d", dir: "asc" }}
        columns={[
          { key: "id", header: "Parcel", render: (p) => p.parcelId.split("-").pop(), sortValue: (p) => p.parcelId },
          { key: "ha", header: "Area", align: "right", render: (p) => fmtHa(p.areaHa), sortValue: (p) => p.areaHa },
          { key: "est", header: "Estimate", align: "right", render: (p) => fmtTHa(p.yieldTHa), sortValue: (p) => p.yieldTHa },
          { key: "base", header: "Usual", align: "right", render: (p) => fmtTHa(p.baselineTHa) },
          { key: "d", header: "Δ", align: "right", render: (p) => <Delta value={p.deltaPct} />, sortValue: (p) => p.deltaPct },
        ]}
      />
      <p className="mt-2 text-xs text-muted">
        Weather cell {rows[0]?.cellId} · data as of {fmtDate(rows[0]?.asOfDate)}
      </p>
      <LinkButton variant="primary" className="mt-3" href={href(`/farm/${farm.farmId}`)}>
        Open farm detail <ArrowRight className="size-4" aria-hidden />
      </LinkButton>
    </Panel>
  );
}
