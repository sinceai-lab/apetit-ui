// Daily 2027 season weather for one cell: temperature band, daily rain, water balance, month by month.
import { useMemo } from "react";
import type { WeatherDay } from "@/shared/types";
import { BarChart, dateX, Legend, LineChart, SCENARIO_COLOR, TableToggle, VIZ, type Series } from "../../charts";
import { fmtDate, fmtDayMonth, fmtFixed, fmtNum } from "../../lib/format";
import { Badge, Panel, Stat } from "../../components/ui";
import { cumulative, monthly, seasonStats, type MonthRow } from "./stats";

const mm = (v: number) => `${fmtNum(v)} mm`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

export function DailyWeather({ cellId, scenario, days }: { cellId: string; scenario: string; days: WeatherDay[] }) {
  const s = useMemo(() => seasonStats(days), [days]);
  const months = useMemo(() => monthly(days), [days]);
  const cum = useMemo(() => cumulative(days), [days]);
  const src = `WeatherObserved · cell ${cellId} · scenario ${scenario} · ${fmtDate(s.from)} – ${fmtDate(s.to)}`;

  const tempSeries: Series[] = [
    { id: "band", label: "Daily min – max", color: VIZ.temp, kind: "band", points: days.map((d) => ({ x: dateX(d.date), y: null, lo: d.tMin, hi: d.tMax })) },
    { id: "mean", label: "Daily mean", color: VIZ.temp, points: days.map((d) => ({ x: dateX(d.date), y: d.tMean })) },
  ];
  const rainSeries: Series[] = [{ id: "rain", label: "Rain", color: VIZ.precip, kind: "bars", points: days.map((d) => ({ x: dateX(d.date), y: d.precip })) }];
  const balSeries: Series[] = [
    { id: "rain", label: "Rain so far", color: VIZ.precip, points: cum.map((d) => ({ x: dateX(d.date), y: d.rain })) },
    { id: "et0", label: "Evaporation demand so far (ET0)", color: VIZ.et0, dashed: true, points: cum.map((d) => ({ x: dateX(d.date), y: d.et0 })) },
  ];
  const dayFmt = (x: number) => fmtDayMonth(new Date(x).toISOString().slice(0, 10));
  const dayCols = [
    { key: "date", header: "Date", render: (d: WeatherDay) => fmtDate(d.date), sortValue: (d: WeatherDay) => d.date },
    { key: "min", header: "Min °C", align: "right" as const, render: (d: WeatherDay) => fmtFixed(d.tMin), sortValue: (d: WeatherDay) => d.tMin },
    { key: "mean", header: "Mean °C", align: "right" as const, render: (d: WeatherDay) => fmtFixed(d.tMean), sortValue: (d: WeatherDay) => d.tMean },
    { key: "max", header: "Max °C", align: "right" as const, render: (d: WeatherDay) => fmtFixed(d.tMax), sortValue: (d: WeatherDay) => d.tMax },
    { key: "rain", header: "Rain mm", align: "right" as const, render: (d: WeatherDay) => fmtFixed(d.precip), sortValue: (d: WeatherDay) => d.precip },
    { key: "et0", header: "ET0 mm", align: "right" as const, render: (d: WeatherDay) => fmtFixed(d.et0, 2), sortValue: (d: WeatherDay) => d.et0 },
  ];
  const dayTable = { columns: dayCols, rows: days, rowKey: (d: WeatherDay) => d.date, caption: `Daily weather, cell ${cellId}` };

  const monthCols = [
    { key: "m", header: "Month", render: (r: MonthRow) => `${monthName(r.month)} ${r.month.slice(0, 4)}`, sortValue: (r: MonthRow) => r.month },
    { key: "days", header: "Days", align: "right" as const, render: (r: MonthRow) => fmtNum(r.days) },
    { key: "t", header: "Mean °C", align: "right" as const, render: (r: MonthRow) => fmtFixed(r.tMean), sortValue: (r: MonthRow) => r.tMean },
    { key: "hi", header: "Warmest °C", align: "right" as const, render: (r: MonthRow) => fmtFixed(r.tMax), sortValue: (r: MonthRow) => r.tMax },
    { key: "lo", header: "Coldest °C", align: "right" as const, render: (r: MonthRow) => fmtFixed(r.tMin), sortValue: (r: MonthRow) => r.tMin },
    { key: "rain", header: "Rain mm", align: "right" as const, render: (r: MonthRow) => fmtFixed(r.rain), sortValue: (r: MonthRow) => r.rain },
    { key: "et0", header: "ET0 mm", align: "right" as const, render: (r: MonthRow) => fmtFixed(r.et0), sortValue: (r: MonthRow) => r.et0 },
    { key: "bal", header: "Rain − ET0", align: "right" as const, render: (r: MonthRow) => <span className={r.balance < 0 ? "text-degraded" : "text-ink"}>{r.balance > 0 ? "+" : r.balance < 0 ? "−" : ""}{fmtFixed(Math.abs(r.balance))}</span>, sortValue: (r: MonthRow) => r.balance },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 rounded-card border border-border bg-surface p-4 lg:grid-cols-5" title={src}>
        <Stat label="Mean temperature" value={fmtFixed(s.tMean)} unit="°C" foot={`${fmtNum(s.frostDays)} frost nights`} source={src} />
        <Stat label="Rain this season" value={fmtNum(s.rain)} unit="mm" foot={`${fmtNum(s.rainDays)} days with ≥ 1 mm`} source={src} />
        <Stat label="Evaporation demand" value={fmtNum(s.et0)} unit="mm" foot="reference ET0" source={src} />
        <Stat
          label="Water balance"
          value={`${s.balance >= 0 ? "+" : "−"}${fmtNum(Math.abs(s.balance))}`}
          unit="mm"
          foot={s.balance >= 0 ? "▲ more rain than evaporation" : "▼ drier: evaporation beat rain"}
          source={src}
        />
        <Stat label="Hot days" value={fmtNum(s.hotDays)} unit="days" foot={s.warmest ? `warmest ${fmtFixed(s.warmest.tMax)} °C on ${fmtDayMonth(s.warmest.date)}` : "max ≥ 27 °C"} source={src} />
      </div>

      <Panel
        title="Temperature"
        subtitle={`Daily minimum to maximum (shaded) and mean, ${fmtDate(s.from)} – ${fmtDate(s.to)}`}
        actions={<Badge tone="rapeseed" title="Simulated season, replayed as live readings">Observed · {scenario}</Badge>}
      >
        <TableToggle table={dayTable} toolbar={<Legend items={[{ label: "Daily min – max", color: VIZ.temp, shape: "rect" }, { label: "Daily mean", color: VIZ.temp, shape: "line" }]} />}>
          <LineChart series={tempSeries} xType="time" formatX={dayFmt} formatY={(v) => `${Math.round(v)}°`} ariaLabel={`Daily temperature for ${cellId}`} height={240} />
        </TableToggle>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Rain per day" subtitle={s.wettest ? `Wettest day: ${fmtFixed(s.wettest.precip)} mm on ${fmtDayMonth(s.wettest.date)}` : undefined}>
          <TableToggle table={dayTable} toolbar={<Legend items={[{ label: "Rain (mm/day)", color: VIZ.precip }]} />}>
            <LineChart series={rainSeries} xType="time" formatX={dayFmt} formatY={(v) => `${Math.round(v)}`} ariaLabel={`Daily rain for ${cellId}`} height={200} />
          </TableToggle>
        </Panel>
        <Panel title="Water balance" subtitle="Rain so far against how much water the crop could lose to evaporation (ET0). A widening gap below means drought stress.">
          <TableToggle table={{ columns: monthCols, rows: months, rowKey: (r) => r.month }} toolbar={<Legend items={[{ label: "Rain so far", color: VIZ.precip, shape: "line" }, { label: "ET0 so far", color: VIZ.et0, shape: "dash" }]} />}>
            <LineChart series={balSeries} xType="time" formatX={dayFmt} formatY={(v) => `${Math.round(v)}`} includeZero ariaLabel={`Cumulative rain vs evapotranspiration for ${cellId}`} height={200} />
          </TableToggle>
        </Panel>
      </div>

      <Panel title="Month by month" subtitle="Rain and evaporation per month. Ask about any month here instead of adding up days.">
        <TableToggle table={{ columns: monthCols, rows: months, rowKey: (r) => r.month }} defaultView="chart" toolbar={<Legend items={[{ label: "Rain", color: VIZ.precip }, { label: "ET0", color: VIZ.et0 }]} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Rain (mm)</div>
              <BarChart
                ariaLabel="Monthly rain"
                data={months.map((r) => ({ key: r.month, label: monthName(r.month), value: r.rain, color: VIZ.precip, detail: [{ label: "Days", value: String(r.days) }, { label: "Mean temp", value: `${fmtFixed(r.tMean)} °C` }] }))}
                format={(v) => fmtNum(v)}
                rowHeight={24}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Rain minus evaporation (mm)</div>
              <BarChart
                ariaLabel="Monthly water balance"
                data={months.map((r) => ({ key: r.month, label: monthName(r.month), value: r.balance, color: r.balance < 0 ? SCENARIO_COLOR.ssp245 : VIZ.precip }))}
                format={(v) => `${v > 0 ? "+" : ""}${fmtNum(v)}`}
                rowHeight={24}
              />
            </div>
          </div>
        </TableToggle>
        <p className="mt-2 text-[11px] text-muted">Months with fewer days are only partly in the data window ({fmtDate(s.from)} – {fmtDate(s.to)}). {mm(s.rain)} in total.</p>
      </Panel>
    </div>
  );
}
