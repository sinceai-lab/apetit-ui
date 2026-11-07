// Side-by-side comparison of what-if runs. The user builds a list of queries (the current picks, or several weather
// sets for the same field at once), presses Compare, and every query that has no result yet is run; then the chart shows.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Circle, Loader2, Play, Plus, X } from "lucide-react";
import type { WhatIfBody, WhatIfResponse, WeatherSet } from "@/shared/insights";
import { WEATHER_SETS } from "@/shared/insights";
import { Badge, Button, EmptyState, Panel } from "../../components/ui";
import { BarChart, Legend, SCENARIO_COLOR, TableToggle } from "../../charts";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";
import { insightsApi } from "../../lib/insights";
import { cropLabel, fmtFixed, fmtTHa } from "../../lib/format";
import { BasisChip, pct } from "./common";
import { IRRIGATION_SHORT, parcelShort, WEATHER_SHORT } from "./labels";

export interface Run {
  key: string;
  body: WhatIfBody;
  data: WhatIfResponse;
}
export const runKey = (b: WhatIfBody) => `${b.parcelId}|${b.crop}|${b.weather}|${b.year}|${b.irrigation}`;
/** The what-if service allows 20 runs a minute, so a comparison holds at most this many. */
export const MAX_RUNS = 8;
/** The server runs 2 what-ifs at once. */
const CONCURRENCY = 2;
const SET_ORDER: WeatherSet[] = ["history", "c1", "low", "middle", "high"];

export const isFutureYear = (y: number) => y >= WEATHER_SETS.low.years[0] && y <= WEATHER_SETS.low.years[1];
/** The season used when a weather set is added for a field: the picked season if the set has it, else 2050 for the
 *  2041–2060 sets and the latest season for the others. */
const yearFor = (w: WeatherSet, picked: number, future: number) => {
  const [a, b] = WEATHER_SETS[w].years;
  if (picked >= a && picked <= b) return picked;
  return w === "low" || w === "middle" || w === "high" ? future : b;
};

type Status = { state: "queued" } | { state: "running" } | { state: "done"; data: WhatIfResponse } | { state: "error"; error: ApiError };

/** The comparison list: queries in the order added, plus each one's status/result (kept by key, so re-adding is free). */
export function useComparison() {
  const [queries, setQueries] = useState<WhatIfBody[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);

  const add = useCallback((bodies: WhatIfBody[]) => {
    setQueries((cur) => {
      const have = new Set(cur.map(runKey));
      const fresh = bodies.filter((b) => !have.has(runKey(b)) && have.add(runKey(b)));
      return [...cur, ...fresh].slice(0, MAX_RUNS);
    });
  }, []);
  /** Add a run that already has its result (the "Add to comparison" button on a finished run). */
  const addRun = useCallback(
    (r: Run) => {
      setStatus((s) => ({ ...s, [r.key]: { state: "done", data: r.data } }));
      add([r.body]);
    },
    [add],
  );
  const remove = useCallback((key: string) => setQueries((cur) => cur.filter((b) => runKey(b) !== key)), []);
  const clear = useCallback(() => {
    ac.current?.abort();
    setRunning(false);
    setQueries([]);
    setStatus((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v.state === "done")));
  }, []);

  const run = useCallback(async () => {
    const todo = queries.filter((b) => {
      const st = status[runKey(b)];
      return !st || st.state === "queued" || st.state === "error";
    });
    if (!todo.length) return;
    ac.current?.abort();
    const c = (ac.current = new AbortController());
    setRunning(true);
    setStatus((s) => ({ ...s, ...Object.fromEntries(todo.map((b) => [runKey(b), { state: "queued" } as Status])) }));
    let next = 0;
    const worker = async () => {
      while (next < todo.length && !c.signal.aborted) {
        const body = todo[next++]!;
        const key = runKey(body);
        setStatus((s) => ({ ...s, [key]: { state: "running" } }));
        try {
          const data = await insightsApi.whatIf(body, c.signal);
          if (!c.signal.aborted) setStatus((s) => ({ ...s, [key]: { state: "done", data } }));
        } catch (e) {
          if (c.signal.aborted || (e as Error)?.name === "AbortError") return;
          setStatus((s) => ({ ...s, [key]: { state: "error", error: e instanceof ApiError ? e : new ApiError(0, String(e)) } }));
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (!c.signal.aborted) setRunning(false);
  }, [queries, status]);

  const runs: Run[] = queries.flatMap((b) => {
    const st = status[runKey(b)];
    return st?.state === "done" ? [{ key: runKey(b), body: b, data: st.data }] : [];
  });
  const statusOf = (b: WhatIfBody): Status => status[runKey(b)] ?? { state: "queued" };
  const pending = queries.filter((b) => statusOf(b).state !== "done").length;
  return { queries, runs, statusOf, pending, running, add, addRun, remove, clear, run };
}
export type Comparison = ReturnType<typeof useComparison>;

const queryLabel = (b: WhatIfBody) => `${WEATHER_SHORT[b.weather]} ${b.year}`;
/** Short bar labels: the full weather-set names don't fit the chart's label column. */
const SET_CHART: Record<WeatherSet, string> = { history: "Historical", c1: "SSP2-4.5 C1", low: "SSP1-2.6", middle: "SSP2-4.5", high: "SSP5-8.5" };
const chartLabel = (b: WhatIfBody) => `${SET_CHART[b.weather]} ${b.year}`;
const fieldLabel = (b: WhatIfBody) => `${parcelShort(b.parcelId)} · ${cropLabel(b.crop)}`;

export function ComparePanel({ cmp, current, availableSets, storyYear }: { cmp: Comparison; current: WhatIfBody | null; availableSets: { code: WeatherSet; label: string }[]; storyYear: number }) {
  const [sets, setSets] = useState<WeatherSet[]>([]);
  const { queries, runs, running, pending } = cmp;
  const room = MAX_RUNS - queries.length;
  const inList = (b: WhatIfBody) => queries.some((q) => runKey(q) === runKey(b));
  const setBodies = current ? sets.map((w) => ({ ...current, weather: w, year: yearFor(w, current.year, storyYear) })).filter((b) => !inList(b)) : [];
  const ordered = SET_ORDER.filter((w) => availableSets.some((s) => s.code === w));

  // Chart and table in a fixed order (weather set, then season), not the order they were added.
  const shown = [...runs].sort((a, b) => SET_ORDER.indexOf(a.body.weather) - SET_ORDER.indexOf(b.body.weather) || a.body.year - b.body.year || a.key.localeCompare(b.key));
  const sameField = new Set(runs.map((r) => `${r.body.parcelId}|${r.body.crop}`)).size <= 1;
  const scenarios = [...new Set(runs.map((r) => r.data.prediction.scenario))];
  const basis = runs[0]?.data.basis;
  const errors = queries.map((b) => cmp.statusOf(b)).filter((s): s is Extract<Status, { state: "error" }> => s.state === "error");

  return (
    <Panel
      title="Compare scenarios side by side"
      subtitle={`Build a list of up to ${MAX_RUNS} what-if runs, then press Compare. Each bar is a separate run with the trained model; results are shown as returned, not combined.`}
      actions={
        queries.length > 0 && (
          <Button variant="ghost" className="text-xs" onClick={() => cmp.clear()}>
            Clear list
          </Button>
        )
      }
    >
      {/* Builder: the current picks, or several weather sets for the current field in one go. */}
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="text-xs" disabled={!current || inList(current) || room <= 0} onClick={() => current && cmp.add([current])} title={!current ? "Pick a field first" : undefined}>
            <Plus className="size-3.5" aria-hidden />
            {current && inList(current) ? "Current picks are in the list" : "Add current picks"}
          </Button>
          {current && <span className="text-xs text-muted">{fieldLabel(current)} · {queryLabel(current)} · {IRRIGATION_SHORT[current.irrigation]}</span>}
        </div>
        <fieldset className="flex flex-col gap-2" disabled={!current}>
          <legend className="mb-1 text-[13px] text-muted">Or add several weather sets for {current ? `field ${parcelShort(current.parcelId)}` : "the picked field"} at once</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {ordered.map((w) => {
              const on = sets.includes(w);
              const year = current ? yearFor(w, current.year, storyYear) : null;
              return (
                <button
                  key={w}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setSets((s) => (on ? s.filter((x) => x !== w) : [...s, w]))}
                  className={cn("inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50", on ? "seg-on" : "seg-off")}
                >
                  <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: SCENARIO_COLOR[WEATHER_SETS[w].scenario] }} />
                  {WEATHER_SHORT[w]}
                  {year != null && <span className={on ? "opacity-90" : "text-muted"}>{year}</span>}
                </button>
              );
            })}
            <Button
              variant="outline"
              className="text-xs"
              disabled={!setBodies.length || room <= 0}
              onClick={() => {
                cmp.add(setBodies);
                setSets([]);
              }}
            >
              <Plus className="size-3.5" aria-hidden />
              Add {setBodies.length || ""} to the list
            </Button>
          </div>
          {setBodies.length > room && room > 0 && <span className="text-xs text-degraded">Only {room} more fit; the rest won't be added.</span>}
        </fieldset>
      </div>

      {/* The list, with each query's status. */}
      {queries.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <ul className="flex flex-wrap gap-1.5" aria-label="Runs to compare">
            {queries.map((b) => {
              const st = cmp.statusOf(b);
              const k = runKey(b);
              return (
                <li key={k} className={cn("inline-flex items-center gap-1.5 rounded-card border bg-surface py-1 pl-2 pr-1 text-xs", st.state === "error" ? "border-berry" : "border-border")} title={st.state === "error" ? st.error.message : undefined}>
                  {st.state === "running" ? (
                    <Loader2 className="size-3.5 animate-spin text-muted" aria-label="Running" />
                  ) : st.state === "done" ? (
                    <Check className="size-3.5 text-brand" aria-label="Done" />
                  ) : st.state === "error" ? (
                    <AlertTriangle className="size-3.5 text-berry" aria-label="Failed" />
                  ) : (
                    <Circle className="size-3 text-muted" aria-label="Not run yet" />
                  )}
                  <span className="text-ink">{queryLabel(b)}</span>
                  <span className="text-muted">
                    {fieldLabel(b)}
                    {b.irrigation !== "usual" ? ` · ${IRRIGATION_SHORT[b.irrigation]}` : ""}
                  </span>
                  <button type="button" onClick={() => cmp.remove(k)} aria-label={`Remove ${queryLabel(b)}, ${fieldLabel(b)}`} className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-ink">
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary px-4 py-1.5 text-sm" disabled={running || pending === 0} onClick={() => void cmp.run()}>
              <Play className="size-4" aria-hidden />
              {running ? `Running… ${queries.length - pending} of ${queries.length} done` : pending ? `Compare (${pending} to run)` : "All runs done"}
            </button>
            <span className="text-xs text-muted">
              {queries.length} of {MAX_RUNS} in the list
              {errors.length ? ` · ${errors.length} failed: press Compare to retry` : ""}
            </span>
          </div>
          {errors.some((e) => e.error.status === 429) && <span className="text-xs text-degraded">The service allows 20 runs a minute. Wait a moment, then press Compare again.</span>}
        </div>
      )}

      <div className="mt-4">
        {!queries.length ? (
          <EmptyState title="Nothing to compare yet">Add the current picks, or pick several weather sets and add them, then press Compare.</EmptyState>
        ) : !runs.length ? (
          running ? null : <EmptyState title="Press Compare to run the list" />
        ) : (
          <>
            {basis && (
              <div className="mb-3">
                <BasisChip basis={basis} whatIf />
              </div>
            )}
            <TableToggle
              toolbar={!sameField ? <Badge tone="rapeseed">Different fields or crops: compare with care</Badge> : <span className="text-sm font-medium text-ink">Modelled yield, {fieldLabel(runs[0]!.body)}</span>}
              table={{
                columns: [
                  { key: "w", header: "Weather and season", render: (r) => queryLabel(r.body) },
                  { key: "f", header: "Field", render: (r) => `${parcelShort(r.body.parcelId)} · ${r.data.prediction.farmId} · ${cropLabel(r.body.crop)}` },
                  { key: "i", header: "Irrigation", render: (r) => IRRIGATION_SHORT[r.body.irrigation] },
                  { key: "y", header: "Our model", align: "right", render: (r) => fmtTHa(r.data.prediction.yieldTHa), sortValue: (r) => r.data.prediction.yieldTHa },
                  { key: "v", header: "vs baseline", align: "right", render: (r) => pct(r.data.vsBaseline), sortValue: (r) => r.data.vsBaseline ?? null },
                  { key: "b", header: "Baseline", align: "right", render: (r) => fmtTHa(r.data.prediction.baselineTHa) },
                  { key: "o", header: "Outside training range", render: (r) => (r.data.prediction.outOfTrainingRange.length ? `${r.data.prediction.outOfTrainingRange.length} measure(s)` : "No") },
                ],
                rows: shown,
                rowKey: (r) => r.key,
              }}
            >
              <BarChart
                ariaLabel="Modelled yield for each compared run"
                data={shown.map((r) => ({
                  key: r.key,
                  label: sameField ? chartLabel(r.body) : `${parcelShort(r.body.parcelId)} ${chartLabel(r.body)}`,
                  value: r.data.prediction.yieldTHa,
                  color: SCENARIO_COLOR[r.data.prediction.scenario] ?? "var(--brand)",
                  detail: [
                    { label: queryLabel(r.body), value: "" },
                    { label: "vs baseline", value: pct(r.data.vsBaseline) },
                    { label: "Baseline (farm average)", value: fmtTHa(r.data.prediction.baselineTHa) },
                    { label: "Irrigation", value: IRRIGATION_SHORT[r.body.irrigation] },
                  ],
                }))}
                format={(v) => fmtFixed(v, 1)}
                rowHeight={30}
              />
              <Legend className="mt-2" items={scenarios.map((s) => ({ label: s === "historical" ? "Historical weather" : s.toUpperCase().replace(/^SSP(\d)(\d)(\d)$/, "SSP$1-$2.$3"), color: SCENARIO_COLOR[s] ?? "var(--brand)" }))} />
              <p className="mt-2 text-xs text-muted">
                t/ha. The baseline (farm average) is the same for every weather set, so differences between bars come from weather{runs.some((r) => r.body.irrigation !== "usual") ? " and irrigation" : ""}.
                {runs.length < queries.length && !running ? ` ${queries.length - runs.length} run(s) in the list have no result yet.` : ""}
              </p>
            </TableToggle>
          </>
        )}
      </div>
    </Panel>
  );
}
