// Data page sections: entity counts, subscriptions, inference counters, season completeness per region and crop.
import { useMemo } from "react";
import { Radio } from "lucide-react";
import type { Cell, CropSummary, LiveHealthResponse, ObservationSeason, ObservationsResponse, Region, SubscriptionRow, TypesResponse } from "@/shared/types";
import { BarChart, CompletenessBar, cropColor, TableToggle, VIZ } from "../../charts";
import { cropLabel, fmtAgo, fmtDate, fmtDateTime, fmtNum, fmtShare, regionLabel } from "../../lib/format";
import { Badge, EmptyState, Panel, Stat, StatusBadge, Table, type Column } from "../../components/ui";

const IN_SCOPE = new Set(["Farm", "Parcel", "ClimateGridCell", "WeatherObserved", "YieldPrediction", "LoadLog"]);

export function EntityCounts({ data }: { data: TypesResponse }) {
  const rows = [...data.types].sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
  const total = rows.reduce((a, r) => a + (r.count ?? 0), 0);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: "t", header: "Type", render: (r) => <span className="font-mono text-xs">{r.type}</span>, sortValue: (r) => r.type },
    { key: "s", header: "Used here", render: (r) => (IN_SCOPE.has(r.type) ? <Badge tone="brand">yield</Badge> : <span className="text-xs text-muted">other track</span>), sortValue: (r) => (IN_SCOPE.has(r.type) ? 0 : 1) },
    { key: "c", header: "Records", align: "right", render: (r) => fmtNum(r.count), sortValue: (r) => r.count },
  ];
  return (
    <Panel title="What is in the broker" subtitle={`${fmtNum(total)} records across ${rows.length} types. Green bars are the ones this app uses for yield; the rest belong to the climate and nature tracks.`}>
      <TableToggle table={{ columns: cols, rows, rowKey: (r) => r.type, caption: "Entity counts per type" }}>
        <BarChart
          ariaLabel="Records per entity type"
          rowHeight={20}
          data={rows.map((r) => ({ key: r.type, label: r.type, value: r.count, color: IN_SCOPE.has(r.type) ? VIZ.estimate : "var(--viz-other)" }))}
          format={(v) => fmtNum(v)}
        />
      </TableToggle>
    </Panel>
  );
}

const subName = (id: string) => (id.endsWith(":apetit-yield") ? "Weather → yield model" : id.endsWith(":weather-aggregator") ? "Weather → weather aggregator" : id.split(":").pop() ?? id);

export function Subscriptions({ subs }: { subs: SubscriptionRow[] }) {
  if (!subs.length) return <EmptyState title="No subscriptions">Nothing is listening for broker changes, so new weather will not reach the yield model.</EmptyState>;
  return (
    <ul className="grid grid-cols-1 gap-3">
      {subs.map((s) => {
        const ok = s.status === "active" && s.notificationStatus === "ok";
        return (
          <li key={s.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <Radio className="mt-0.5 size-4 text-brand-vivid" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{subName(s.id)}</div>
                <div className="truncate text-xs text-muted" title={s.description ?? s.id}>{s.description ?? s.id}</div>
              </div>
              <StatusBadge status={ok ? "up" : s.status === "active" ? "degraded" : "down"} label={ok ? "Delivering" : `${s.status} / ${s.notificationStatus ?? "?"}`} />
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted">Watches</dt>
                <dd className="text-ink">{s.entityTypes.join(", ")}</dd>
              </div>
              <div>
                <dt className="text-muted">Pushes sent</dt>
                <dd className="tnum font-semibold text-ink">{fmtNum(s.timesSent)}</dd>
              </div>
              <div title={`Last success ${s.lastSuccess ?? "never"} (wall clock)`}>
                <dt className="text-muted">Last push</dt>
                <dd className="text-ink">{s.lastNotification ? `${fmtDateTime(s.lastNotification)}` : "never"}</dd>
              </div>
            </dl>
            {s.endpoint && <div className="mt-1 truncate font-mono text-[11px] text-muted">→ {s.endpoint}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function InferenceCounters({ health, obs }: { health: LiveHealthResponse | null; obs: ObservationsResponse | null }) {
  const c = { ...(obs?.counters ?? {}), ...(health?.health.counters ?? {}) } as Record<string, number | undefined>;
  const wb = health?.health.writeback;
  const last = health?.health.last_notification;
  const rejected = obs?.recent_rejected ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Weather pushes received" value={fmtNum(c.notifications)} foot={last?.received_at ? `last ${fmtAgo(last.received_at)} (real time)` : undefined} source="inference /health counters" />
        <Stat label="New daily readings" value={fmtNum(c.readings_new)} foot="stored for the model" source="inference /health counters" />
        <Stat label="Outside growing season" value={fmtNum(c.readings_out_of_season)} foot="kept, not used" source="inference /health counters" />
        <Stat label="Duplicates ignored" value={fmtNum(c.readings_duplicate)} foot="same day sent twice" source="inference /health counters" />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {health && <Badge tone="neutral">via {health.source}</Badge>}
        {health?.health.models?.version && <Badge tone="neutral">model {health.health.models.version.slice(0, 8)}</Badge>}
        {wb && <Badge tone={wb.has_error ? "berry" : "brand"}>write-back {wb.enabled ? "on" : "off"} · {fmtNum(wb.pending)} pending{wb.has_error ? " · error" : ""}</Badge>}
      </div>
      <div>
        <h3 className="mb-1.5 font-heading text-sm font-bold text-heading">Recently rejected readings</h3>
        {rejected.length ? (
          <ul className="relative max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2 font-mono text-xs">
            {rejected.slice(0, 50).map((r, i) => (
              <li key={i} className="truncate" title={JSON.stringify(r)}>{typeof r === "string" ? r : JSON.stringify(r)}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">None. Every reading that arrived was valid.</p>
        )}
      </div>
    </div>
  );
}

interface RegionCoverage {
  region: Region;
  cells: number;
  reporting: number;
  observed: number;
  filledGap: number;
  filledAhead: number;
  total: number;
  missing: number;
  parcels: number;
  lastDate: string | null;
}

const modal = (xs: number[]) => {
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
};

export function regionCoverage(seasons: ObservationSeason[], cells: Cell[]): RegionCoverage[] {
  const reg = new Map(cells.map((c) => [c.cellId, c.region]));
  const out: RegionCoverage[] = [];
  for (const r of ["FI_SW", "SE_SKANE"] as Region[]) {
    const ss = seasons.filter((s) => reg.get(s.cell_id) === r);
    const cs = cells.filter((c) => c.region === r);
    if (!ss.length && !cs.length) continue;
    out.push({
      region: r,
      cells: cs.length,
      reporting: ss.filter((s) => s.observed_days > 0).length,
      observed: modal(ss.map((s) => s.observed_days)),
      filledGap: modal(ss.map((s) => s.filled_gap_days)),
      filledAhead: modal(ss.map((s) => s.filled_future_days)),
      total: modal(ss.map((s) => s.total_days)),
      missing: ss.reduce((a, s) => a + s.missing_doys_before_last.length, 0),
      parcels: ss.reduce((a, s) => a + s.contract_parcels, 0),
      lastDate: ss.map((s) => s.last_date).filter((d): d is string => !!d).sort().pop() ?? null,
    });
  }
  return out;
}

export function Completeness({ seasons, cells, kpis }: { seasons: ObservationSeason[]; cells: Cell[]; kpis: CropSummary[] }) {
  const regions = useMemo(() => regionCoverage(seasons, cells), [seasons, cells]);
  const reg = useMemo(() => new Map(cells.map((c) => [c.cellId, c.region])), [cells]);
  const cols: Column<ObservationSeason>[] = [
    { key: "c", header: "Cell", render: (s) => <a className="link font-mono text-xs" href={`#/weather/${s.cell_id}`}>{s.cell_id}</a>, sortValue: (s) => s.cell_id },
    { key: "r", header: "Region", render: (s) => { const r = reg.get(s.cell_id); return r ? regionLabel(r) : "–"; }, sortValue: (s) => reg.get(s.cell_id) ?? "" },
    { key: "p", header: "Contract parcels", align: "right", render: (s) => fmtNum(s.contract_parcels), sortValue: (s) => s.contract_parcels },
    { key: "o", header: "Observed", align: "right", render: (s) => `${fmtNum(s.observed_days)} / ${fmtNum(s.total_days)}`, sortValue: (s) => (s.total_days ? s.observed_days / s.total_days : 0) },
    { key: "g", header: "Gap-filled", align: "right", render: (s) => fmtNum(s.filled_gap_days), sortValue: (s) => s.filled_gap_days },
    { key: "f", header: "Filled ahead", align: "right", render: (s) => fmtNum(s.filled_future_days), sortValue: (s) => s.filled_future_days },
    { key: "m", header: "Missing", align: "right", render: (s) => fmtNum(s.missing_doys_before_last.length), sortValue: (s) => s.missing_doys_before_last.length },
    { key: "d", header: "Duplicates", align: "right", render: (s) => fmtNum(s.duplicates), sortValue: (s) => s.duplicates },
    { key: "l", header: "Last day", render: (s) => fmtDate(s.last_date), sortValue: (s) => s.last_date },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {regions.map((r) => (
          <div key={r.region} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{regionLabel(r.region)}</span>
              <span className="text-xs text-muted">weather up to {fmtDate(r.lastDate)}</span>
            </div>
            <CompletenessBar observed={r.observed} filledGap={r.filledGap} filledAhead={r.filledAhead} total={r.total} />
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-muted">Cells reporting</div><div className="tnum font-semibold text-ink">{r.reporting} of {r.cells}</div></div>
              <div><div className="text-muted">Contract parcels</div><div className="tnum font-semibold text-ink">{fmtNum(r.parcels)}</div></div>
              <div><div className="text-muted">Missing days</div><div className="tnum font-semibold text-ink">{r.missing ? fmtNum(r.missing) : "none"}</div></div>
            </div>
          </div>
        ))}
      </div>

      {kpis.length > 0 && (
        <div>
          <h3 className="mb-1.5 font-heading text-sm font-bold text-heading">Per crop (as used by the estimates)</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k) => (
              <li key={`${k.region}-${k.crop}`} className="rounded-lg bg-surface-2 p-2.5" title={`YieldPrediction · model ${k.modelVersion.slice(0, 8)} · data as of ${fmtDate(k.asOfDate)}`}>
                <div className="mb-1 flex items-center gap-1.5 text-sm">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: cropColor(k.crop) }} aria-hidden />
                  <span className="font-medium text-ink">{cropLabel(k.crop)}</span>
                  <span className="text-xs text-muted">· {regionLabel(k.region)}</span>
                  <span className="ml-auto text-xs text-muted">{fmtNum(k.parcels)} parcels</span>
                </div>
                <CompletenessBar observed={k.completeness.observedDays} filledAhead={k.completeness.filledFutureDays} total={k.completeness.totalDays} showLegend={false} />
                <div className="mt-1 text-[11px] text-muted">
                  {fmtNum(k.completeness.observedDays)} of {fmtNum(k.completeness.totalDays)} days observed
                  {k.outOfRangeShare > 0 ? ` · ${fmtShare(k.outOfRangeShare)} outside training range` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group">
        <summary className="link cursor-pointer text-sm">All {seasons.length} grid cells</summary>
        <div className="mt-2">
          <Table dense columns={cols} rows={seasons} rowKey={(s) => `${s.cell_id}-${s.year}`} maxHeight={420} initialSort={{ key: "p", dir: "desc" }} />
        </div>
      </details>
    </div>
  );
}
