import { ArrowRight } from "lucide-react";
import type { CropSummary, FarmSummary, Prediction, Region } from "@/shared/types";
import { farmSummaries, filterPredictions } from "@/shared/aggregate";
import type { PageProps } from "./types";
import { Card, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat, UpstreamBanner } from "../components/ui";
import { BulletBar, CompletenessBar, deltaColor, TableToggle } from "../charts";
import { api } from "../lib/api";
import { useOverview, useServices } from "../lib/appData";
import { cropLabel, fmtDate, fmtHa, fmtNum, fmtTHa, fmtTonnes } from "../lib/format";
import { useIsDark, useRegion } from "../lib/prefs";
import { href } from "../lib/router";
import { POLL, useApi } from "../lib/usePoll";
import { buildStages, PipelineStrip } from "./overview/PipelineStrip";
import { CropDot, Delta, EarlySeasonNote, LiveNote, regionFlag, regionsFor } from "./season/common";

export function OverviewPage(_: PageProps) {
  const [region] = useRegion();
  const overview = useOverview();
  const services = useServices();
  const preds = useApi((s) => api.predictions({ region }, s), [region], { intervalMs: POLL.predictions });
  const o = overview.data;
  const regions = regionsFor(region);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Season overview"
        subtitle="How the 2027 season is tracking for Apetit's contract crops, estimated live from the weather so far. Finland and Sweden are shown separately."
      />
      {o && <UpstreamBanner errors={o.errors} stale={o.stale} />}

      <section aria-labelledby="pipe-h">
        <h2 id="pipe-h" className="mb-2 text-sm font-semibold text-muted">
          Where the numbers come from
        </h2>
        {o ? (
          <PipelineStrip stages={buildStages(o.pipeline, services.data?.services, o.source)} />
        ) : overview.error ? (
          <ErrorState error={overview.error} onRetry={overview.refresh} />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[92px]" />
            ))}
          </div>
        )}
      </section>

      {o?.season.asOfDate && <EarlySeasonNote asOfDate={o.season.asOfDate} />}

      <div className={regions.length > 1 ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
        {regions.map((r) =>
          o ? (
            <RegionCard key={r} region={r} kpis={o.kpis.filter((k) => k.region === r)} />
          ) : overview.error ? null : (
            <Skeleton key={r} className="h-80" />
          ),
        )}
      </div>

      <section aria-labelledby="movers-h">
        <h2 id="movers-h" className="font-display mb-1 text-xl font-bold text-ink">
          Farms that stand out
        </h2>
        <p className="mb-3 text-[13px] text-muted">Area-weighted estimate vs each farm's usual yield, over its contract parcels.</p>
        {preds.data ? (
          <div className={regions.length > 1 ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
            {regions.map((r) => (
              <Movers key={r} region={r} rows={filterPredictions(preds.data!.predictions, { region: r })} />
            ))}
          </div>
        ) : preds.error ? (
          <ErrorState error={preds.error} onRetry={preds.refresh} />
        ) : (
          <Skeleton className="h-64" />
        )}
      </section>
    </div>
  );
}

function RegionCard({ region, kpis }: { region: Region; kpis: CropSummary[] }) {
  if (!kpis.length)
    return (
      <Panel title={regionFlag(region)}>
        <EmptyState title="No live estimates yet">The yield model has not written estimates for this region. Check the pipeline above.</EmptyState>
      </Panel>
    );
  const area = kpis.reduce((s, k) => s + k.areaHa, 0);
  const est = kpis.reduce((s, k) => s + k.estTonnes, 0);
  const withBase = kpis.filter((k) => k.baseTonnes != null);
  const base = withBase.length ? withBase.reduce((s, k) => s + k.baseTonnes!, 0) : null;
  const estOnBase = withBase.reduce((s, k) => s + k.estTonnes, 0);
  const delta = base ? ((estOnBase - base) / base) * 100 : null;
  const c = kpis.reduce((a, k) => (k.completeness.observedDays > a.observedDays ? k.completeness : a), kpis[0]!.completeness);
  const asOf = kpis.reduce((m, k) => (k.asOfDate > m ? k.asOfDate : m), "");
  const source = `CropSummary over YieldPrediction · data as of ${fmtDate(asOf)} · model ${kpis[0]!.modelVersion.slice(0, 8)}`;

  return (
    <Panel
      title={regionFlag(region)}
      subtitle={<LiveNote asOfDate={asOf} />}
      actions={
        <a href={href("/season")} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
          Crops <ArrowRight className="size-3.5" aria-hidden />
        </a>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Contract area" value={fmtNum(area)} unit="ha" foot={`${fmtNum(kpis.reduce((s, k) => s + k.parcels, 0))} parcels · ${kpis.length} ${kpis.length === 1 ? "crop" : "crops"}`} source={source} />
        <Stat label="Estimated harvest" value={fmtNum(est)} unit="t" foot={<>usual {fmtTonnes(base)}</>} source={source} />
        <Stat label="vs usual yield" value={<Delta value={delta} size="xl" />} foot="estimate vs farm averages" source={source} className="col-span-2 sm:col-span-1" />
      </div>
      <div className="mt-4">
        <div className="mb-1 text-[13px] text-muted">Season so far</div>
        <CompletenessBar observed={c.observedDays} filledAhead={c.filledFutureDays} total={c.totalDays} />
      </div>
      <div className="mt-5">
        <TableToggle
          toolbar={<div className="text-sm font-medium text-ink">Estimate vs usual, per crop</div>}
          table={{
            rows: kpis,
            rowKey: (k) => k.crop,
            columns: [
              { key: "crop", header: "Crop", render: (k) => cropLabel(k.crop) },
              { key: "area", header: "Area", align: "right", render: (k) => fmtHa(k.areaHa), sortValue: (k) => k.areaHa },
              { key: "est", header: "Estimate", align: "right", render: (k) => fmtTHa(k.estTHa), sortValue: (k) => k.estTHa },
              { key: "base", header: "Usual", align: "right", render: (k) => fmtTHa(k.baseTHa), sortValue: (k) => k.baseTHa },
              { key: "d", header: "Δ", align: "right", render: (k) => <Delta value={k.deltaPct} />, sortValue: (k) => k.deltaPct },
            ],
          }}
        >
          <ul className="flex flex-col gap-3">
            {kpis.map((k) => (
              <li key={k.crop}>
                <a href={href("/season", { crop: k.crop })} className="group block rounded-lg p-1 -m-1 hover:bg-surface-2">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                      <CropDot crop={k.crop} />
                      {cropLabel(k.crop)}
                      <span className="text-xs font-normal text-muted">{fmtHa(k.areaHa)}</span>
                    </span>
                    <span className="tnum inline-flex items-baseline gap-2 text-xs text-muted">
                      <span>
                        <b className="font-semibold text-ink">{fmtTHa(k.estTHa)}</b> vs usual {fmtTHa(k.baseTHa)}
                      </span>
                      <Delta value={k.deltaPct} />
                    </span>
                  </div>
                  <BulletBar estimate={k.estTHa} baseline={k.baseTHa} max={Math.max(k.estTHa, k.baseTHa ?? 0) * 1.2} label={cropLabel(k.crop)} />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Bar = estimate (colour shows above or below usual), black tick = usual yield.</p>
        </TableToggle>
      </div>
    </Panel>
  );
}

function Movers({ region, rows }: { region: Region; rows: Prediction[] }) {
  const farms = farmSummaries(rows).filter((f) => f.deltaPct != null);
  const below = [...farms].sort((a, b) => a.deltaPct! - b.deltaPct!).filter((f) => f.deltaPct! < 0).slice(0, 5);
  const above = [...farms].sort((a, b) => b.deltaPct! - a.deltaPct!).filter((f) => f.deltaPct! > 0).slice(0, 5);
  return (
    <Card className="p-4">
      <h3 className="font-display text-lg font-bold text-ink">{regionFlag(region)}</h3>
      {!farms.length ? (
        <EmptyState className="mt-3" title="No farm estimates yet" />
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <MoverList title="Most below usual" hint="Worth a call" farms={below} />
          <MoverList title="Most above usual" hint="Going well" farms={above} />
        </div>
      )}
    </Card>
  );
}

function MoverList({ title, hint, farms }: { title: string; hint: string; farms: FarmSummary[] }) {
  const dark = useIsDark();
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      {!farms.length ? (
        <p className="text-xs text-muted">None this season.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {farms.map((f) => {
            const w = Math.min(100, (Math.abs(f.deltaPct!) / 40) * 100);
            return (
              <li key={f.farmId}>
                <a href={href(`/farm/${f.farmId}`)} className="flex items-center gap-2 px-2.5 py-2 hover:bg-brand-soft">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {f.farmId}
                      {f.crops.map((c) => (
                        <CropDot key={c} crop={c} className="size-2" />
                      ))}
                    </div>
                    <div className="tnum text-xs text-muted">
                      {f.crops.map(cropLabel).join(", ")} · {fmtHa(f.areaHa)}
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${w}%`, background: deltaColor(f.deltaPct, dark) }} />
                    </div>
                  </div>
                  <Delta value={f.deltaPct} />
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
