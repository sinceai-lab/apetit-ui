// Weather per grid cell: observed 2027 season (WeatherObserved) and long-term climate (temporal API) (contract §6.5).
import { useMemo } from "react";
import { CloudOff } from "lucide-react";
import type { ObservationSeason } from "@/shared/types";
import type { PageProps } from "./types";
import { api } from "../lib/api";
import { useRegion } from "../lib/prefs";
import { useApi } from "../lib/usePoll";
import { navigate } from "../lib/router";
import { fmtDate, fmtDateTime, fmtNum, regionLabel } from "../lib/format";
import { CompletenessBar } from "../charts";
import { Async, Badge, Card, EmptyState, ErrorState, LinkButton, PageHeader, Panel, Skeleton } from "../components/ui";
import { CellPicker } from "./weather/CellPicker";
import { DailyWeather } from "./weather/DailyWeather";
import { ClimatePanel } from "./weather/ClimatePanel";

export function WeatherPage({ params }: PageProps) {
  const [region] = useRegion();
  const cells = useApi((s) => api.cells(undefined, s), []);
  const obs = useApi((s) => api.observations({}, s), []);

  const parcels = useMemo(() => new Map((obs.data?.seasons ?? []).map((s) => [s.cell_id, s.contract_parcels])), [obs.data]);
  const visible = useMemo(() => (cells.data?.cells ?? []).filter((c) => region === "both" || c.region === region), [cells.data, region]);
  // Default to the cell with the most contract parcels in the chosen region.
  const fallback = useMemo(() => [...visible].sort((a, b) => (parcels.get(b.cellId) ?? 0) - (parcels.get(a.cellId) ?? 0) || a.cellId.localeCompare(b.cellId))[0]?.cellId ?? null, [visible, parcels]);
  const cellId = params.cellId?.toUpperCase() ?? fallback;
  const cell = cells.data?.cells.find((c) => c.cellId === cellId) ?? null;
  const season = obs.data?.seasons.find((s) => s.cell_id === cellId) ?? null;
  const pick = (id: string) => navigate(`/weather/${id}`);

  return (
    <div>
      <PageHeader
        title={cellId ? `Weather · ${cellId}` : "Weather"}
        subtitle="Daily weather of the 2027 season for one 25 km grid cell, and how its climate is expected to change."
        actions={
          cell && (
            <>
              <Badge tone="neutral">{regionLabel(cell.region)}</Badge>
              <Badge tone="neutral">{fmtNum(cell.elevationM)} m above sea</Badge>
              {season?.contract_parcels ? <Badge tone="brand">{fmtNum(season.contract_parcels)} contract parcels</Badge> : null}
              <LinkButton href={`#/map`} variant="ghost" className="text-xs">See on map</LinkButton>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="p-4">
            <Async state={cells} loading={<Skeleton className="h-48" />}>
              {() =>
                visible.length ? (
                  <CellPicker cells={visible} selected={cellId} parcels={parcels} onPick={pick} />
                ) : (
                  <EmptyState title="No grid cells">The broker has no ClimateGridCell entities for {regionLabel(region)}.</EmptyState>
                )
              }
            </Async>
          </Card>
          <Coverage season={season} loading={obs.loading && !obs.data} error={obs.error} cellId={cellId} />
        </aside>

        <div className="min-w-0 space-y-4">
          {cellId && cells.data && !cell && <ErrorState error={`There is no grid cell called ${cellId}. Pick one from the list.`} />}
          {cellId && (cell || !cells.data) ? <CellWeather cellId={cellId} /> : !cellId && cells.loading ? <Skeleton className="h-72" /> : null}
          {cellId && cell && <ClimatePanel cellId={cellId} />}
        </div>
      </div>
    </div>
  );
}

function CellWeather({ cellId }: { cellId: string }) {
  const w = useApi((s) => api.weather(cellId, {}, s), [cellId]);
  return (
    <Async state={w} loading={<Skeleton className="h-96" />}>
      {(d) =>
        d.days.length ? (
          <DailyWeather cellId={d.cellId} scenario={d.scenario} days={d.days} />
        ) : (
          <Card className="flex flex-col items-center gap-2 p-8 text-center">
            <CloudOff className="size-6 text-muted" aria-hidden />
            <div className="font-medium text-ink">No weather readings for {cellId} yet</div>
            <div className="text-sm text-muted">Readings arrive day by day from the weather stream. Check the Data page for the stream status.</div>
          </Card>
        )
      }
    </Async>
  );
}

function Coverage({ season, loading, error, cellId }: { season: ObservationSeason | null; loading: boolean; error: Error | null; cellId: string | null }) {
  return (
    <Panel title="Data coverage" subtitle="What the yield model has received for this cell">
      {loading ? (
        <Skeleton className="h-24" />
      ) : error ? (
        <ErrorState error={error} />
      ) : !season ? (
        <p className="text-sm text-muted">The inference service has no season record for {cellId ?? "this cell"}.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <CompletenessBar observed={season.observed_days} filledGap={season.filled_gap_days} filledAhead={season.filled_future_days} total={season.total_days} />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted">Season {season.year}</dt>
            <dd className="text-right text-ink">{fmtDate(season.first_date)} – {fmtDate(season.last_date)}</dd>
            <dt className="text-muted">Days stored</dt>
            <dd className="tnum text-right text-ink">{fmtNum(season.stored_days)}</dd>
            <dt className="text-muted">In growing window</dt>
            <dd className="tnum text-right text-ink">{fmtNum(season.in_window_days)}</dd>
            <dt className="text-muted">Missing days</dt>
            <dd className="tnum text-right text-ink">{season.missing_doys_before_last.length ? fmtNum(season.missing_doys_before_last.length) : "none"}</dd>
            <dt className="text-muted">Duplicates ignored</dt>
            <dd className="tnum text-right text-ink">{fmtNum(season.duplicates)}</dd>
            <dt className="text-muted" title="Wall-clock time the last reading reached the inference service">Last reading received</dt>
            <dd className="text-right text-ink">{fmtDateTime(season.last_received_at)}</dd>
          </dl>
          <p className="text-[11px] text-muted">Dates are the simulated 2027 season. "Received" is real time.</p>
        </div>
      )}
    </Panel>
  );
}
