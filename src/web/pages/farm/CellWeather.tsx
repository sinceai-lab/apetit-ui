// Mini weather for the farm's nearest grid cell: daily temperature band + mean, and daily rain.
import { ArrowRight } from "lucide-react";
import type { WeatherDay } from "@/shared/types";
import { ErrorState, Skeleton } from "../../components/ui";
import { dateX, Legend, LineChart, TableToggle, VIZ } from "../../charts";
import { api } from "../../lib/api";
import { fmtDate, fmtFixed, fmtNum } from "../../lib/format";
import { href } from "../../lib/router";
import { useApi } from "../../lib/usePoll";

const monthFmt = (x: number) => new Date(x).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

interface MonthRow {
  month: string;
  tMean: number | null;
  rain: number;
  et0: number;
  days: number;
}

function monthly(days: WeatherDay[]): MonthRow[] {
  const m = new Map<string, WeatherDay[]>();
  for (const d of days) m.set(d.date.slice(0, 7), [...(m.get(d.date.slice(0, 7)) ?? []), d]);
  return [...m.entries()].map(([month, ds]) => {
    const t = ds.filter((d) => d.tMean != null);
    return {
      month,
      tMean: t.length ? t.reduce((s, d) => s + d.tMean!, 0) / t.length : null,
      rain: ds.reduce((s, d) => s + (d.precip ?? 0), 0),
      et0: ds.reduce((s, d) => s + (d.et0 ?? 0), 0),
      days: ds.length,
    };
  });
}

export function CellWeather({ cellId }: { cellId: string }) {
  const w = useApi((s) => api.weather(cellId, {}, s), [cellId]);
  if (w.error && !w.data) return <ErrorState error={w.error} onRetry={w.refresh} />;
  if (!w.data) return <Skeleton className="h-72" />;
  const days = w.data.days;
  if (!days.length) return <p className="text-sm text-muted">No weather readings for {cellId} yet.</p>;
  const xs = days.map((d) => dateX(d.date));
  const rows = monthly(days);
  const totalRain = rows.reduce((s, r) => s + r.rain, 0);
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {fmtDate(days[0]!.date)} – {fmtDate(days[days.length - 1]!.date)} · {fmtNum(days.length)} days observed · scenario {w.data.scenario} ·{" "}
        <span className="tnum">{fmtNum(totalRain)} mm rain in total</span>
      </p>
      <TableToggle
        table={{
          rows,
          rowKey: (r) => r.month,
          columns: [
            { key: "m", header: "Month", render: (r) => new Date(`${r.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) },
            { key: "t", header: "Mean temp", align: "right", render: (r) => `${fmtFixed(r.tMean)} °C` },
            { key: "r", header: "Rain", align: "right", render: (r) => `${fmtNum(r.rain)} mm` },
            { key: "e", header: "Evaporation (ET0)", align: "right", render: (r) => `${fmtNum(r.et0)} mm` },
            { key: "d", header: "Days", align: "right", render: (r) => fmtNum(r.days) },
          ],
        }}
        toolbar={
          <Legend
            items={[
              { label: "Daily min–max °C", color: VIZ.temp, shape: "rect" },
              { label: "Mean °C", color: VIZ.temp, shape: "line" },
              { label: "Rain mm/day", color: VIZ.precip, shape: "rect" },
            ]}
          />
        }
      >
        <LineChart
          height={150}
          xType="time"
          formatX={monthFmt}
          formatY={(v) => `${Math.round(v)}°`}
          ariaLabel={`Daily temperature for cell ${cellId}`}
          series={[
            { id: "band", label: "Min–max", color: VIZ.temp, kind: "band", points: days.map((d, i) => ({ x: xs[i]!, y: null, lo: d.tMin, hi: d.tMax })) },
            { id: "mean", label: "Mean", color: VIZ.temp, points: days.map((d, i) => ({ x: xs[i]!, y: d.tMean })) },
          ]}
        />
        <LineChart
          height={100}
          xType="time"
          formatX={monthFmt}
          formatY={(v) => `${Math.round(v)}`}
          ariaLabel={`Daily rain for cell ${cellId}`}
          series={[{ id: "rain", label: "Rain mm", color: VIZ.precip, kind: "bars", points: days.map((d, i) => ({ x: xs[i]!, y: d.precip })) }]}
        />
      </TableToggle>
      <a href={href(`/weather/${cellId}`)} className="link mt-2 inline-flex items-center gap-1 text-sm">
        Full weather and climate for {cellId} <ArrowRight className="size-3.5" aria-hidden />
      </a>
    </div>
  );
}
