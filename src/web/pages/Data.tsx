// Data & provenance: loaded files, broker contents, the weather stream, inference counters, completeness (contract §6.7).
import { useState } from "react";
import type { LoadLogRow } from "@/shared/types";
import type { PageProps } from "./types";
import { api } from "../lib/api";
import { useOverview } from "../lib/appData";
import { useApi } from "../lib/usePoll";
import { fmtDate, fmtDateTime, fmtNum, shortHash } from "../lib/format";
import { Async, Badge, Drawer, ErrorState, PageHeader, Panel, Skeleton, Stat, Table, type Column } from "../components/ui";
import { LoadLogDetail, ProvenancePanel } from "./data/Provenance";
import { Completeness, EntityCounts, InferenceCounters, Subscriptions } from "./data/Sections";

export function DataPage(_: PageProps) {
  const logs = useApi((s) => api.loadLogs(s), []);
  const types = useApi((s) => api.types(s), []);
  const subs = useApi((s) => api.subscriptions(s), []);
  const health = useApi((s) => api.liveHealth(s), []);
  const obs = useApi((s) => api.observations({}, s), []);
  const cells = useApi((s) => api.cells(undefined, s), []);
  const overview = useOverview();
  const [open, setOpen] = useState<LoadLogRow | null>(null);

  const rows = logs.data?.loadLogs ?? [];
  const totals = rows.reduce((a, l) => ({ read: a.read + l.rowsRead, loaded: a.loaded + l.rowsLoaded, rejected: a.rejected + l.rowsRejected, dropped: a.dropped + l.rowsDropped }), { read: 0, loaded: 0, rejected: 0, dropped: 0 });
  const entities = types.data?.types.reduce((a, t) => a + (t.count ?? 0), 0) ?? null;
  const lastLoad = rows.map((l) => l.loadedAt).sort().pop() ?? null;

  const cols: Column<LoadLogRow>[] = [
    { key: "file", header: "File", render: (l) => <span className="font-medium text-ink">{l.file}</span>, sortValue: (l) => l.file },
    { key: "schema", header: "Becomes", render: (l) => <span className="font-mono text-xs text-muted">{l.schema}</span>, sortValue: (l) => l.schema },
    { key: "read", header: "Read", align: "right", render: (l) => fmtNum(l.rowsRead), sortValue: (l) => l.rowsRead },
    { key: "loaded", header: "Loaded", align: "right", render: (l) => fmtNum(l.rowsLoaded), sortValue: (l) => l.rowsLoaded },
    { key: "dropped", header: "Dropped", align: "right", render: (l) => (l.rowsDropped ? <b className="text-degraded">{fmtNum(l.rowsDropped)}</b> : "0"), sortValue: (l) => l.rowsDropped },
    { key: "rejected", header: "Rejected", align: "right", render: (l) => (l.rowsRejected ? <b className="text-down">▲ {fmtNum(l.rowsRejected)}</b> : "0"), sortValue: (l) => l.rowsRejected },
    { key: "sha", header: "sha256", render: (l) => <code className="text-xs" title={l.sha256}>{shortHash(l.sha256)}</code> },
    { key: "by", header: "By", render: (l) => <span className="text-xs">{l.loadedBy}</span>, sortValue: (l) => l.loadedBy },
    { key: "at", header: "Loaded at", render: (l) => <span className="whitespace-nowrap text-xs" title={l.loadedAt}>{fmtDateTime(l.loadedAt)}</span>, sortValue: (l) => l.loadedAt },
    { key: "st", header: "Status", render: (l) => <Badge tone={l.status === "complete" ? "brand" : "rapeseed"}>{l.status}</Badge>, sortValue: (l) => l.status },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Data & provenance" subtitle="Which files were loaded, what the broker holds now, and whether the live weather stream is reaching the yield model." />

      <div className="grid grid-cols-2 gap-4 rounded-card border border-border bg-surface p-4 shadow-card lg:grid-cols-4">
        <Stat label="CSV files loaded" value={logs.data ? fmtNum(rows.length) : "…"} foot={lastLoad ? `last ${fmtDateTime(lastLoad)} (real time)` : undefined} source="LoadLog entities in the broker" />
        <Stat label="Rows loaded" value={logs.data ? fmtNum(totals.loaded) : "…"} foot={logs.data ? `of ${fmtNum(totals.read)} read` : undefined} source="Σ LoadLog.rowsLoaded" />
        <Stat label="Rows rejected" value={logs.data ? fmtNum(totals.rejected) : "…"} foot={logs.data ? (totals.rejected ? "▲ check the files below" : "every row passed") : undefined} source="Σ LoadLog.rowsRejected" />
        <Stat label="Records in broker" value={entities == null ? "…" : fmtNum(entities)} foot={types.data ? `${types.data.types.length} types` : undefined} source="broker count per type" />
      </div>

      <ProvenancePanel loadLogs={rows} />

      <Panel title="Loaded files" subtitle="One LoadLog per CSV. Click a row for the full record. Times are when the file was loaded (real time).">
        <Async state={logs} loading={<Skeleton className="h-64" />}>
          {() => <Table columns={cols} rows={rows} rowKey={(l) => l.id} onRowClick={setOpen} dense maxHeight={480} initialSort={{ key: "at", dir: "desc" }} caption="Loaded CSV files" />}
        </Async>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Async state={types} loading={<Skeleton className="h-96" />}>
          {(d) => <EntityCounts data={d} />}
        </Async>
        <div className="space-y-5">
          <Panel title="Live weather stream" subtitle="The broker pushes each new daily reading to these listeners.">
            <Async state={subs} loading={<Skeleton className="h-28" />}>
              {(d) => <Subscriptions subs={d.subscriptions} />}
            </Async>
          </Panel>
          <Panel title="Yield model inbox" subtitle="What the inference service has received from the stream.">
            {health.error && obs.error ? (
              <ErrorState error={health.error} onRetry={() => (health.refresh(), obs.refresh())} />
            ) : health.loading && obs.loading && !health.data && !obs.data ? (
              <Skeleton className="h-32" />
            ) : (
              <InferenceCounters health={health.data} obs={obs.data} />
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Season completeness"
        subtitle={`How many days of real weather the 2027 estimates are built on${overview.data?.season.asOfDate ? `, data as of ${fmtDate(overview.data.season.asOfDate)}` : ""}. Filled days are model guesses.`}
      >
        {obs.error ? (
          <ErrorState error={obs.error} onRetry={obs.refresh} />
        ) : !obs.data || !cells.data ? (
          cells.error ? <ErrorState error={cells.error} onRetry={cells.refresh} /> : <Skeleton className="h-40" />
        ) : (
          <Completeness seasons={obs.data.seasons} cells={cells.data.cells} kpis={overview.data?.kpis ?? []} />
        )}
      </Panel>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.file ?? "Load"}>
        {open && <LoadLogDetail log={open} />}
      </Drawer>
    </div>
  );
}
