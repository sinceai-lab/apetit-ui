// Side-by-side comparison of what-if runs (pinned runs, or the three 2041–2060 weather sets in one go).
import { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { WhatIfBody, WhatIfResponse, WeatherSet } from "@/shared/insights";
import { WEATHER_SETS } from "@/shared/insights";
import { Badge, Button, EmptyState, ErrorState, Loading, Panel } from "../../components/ui";
import { BarChart, Legend, SCENARIO_COLOR, TableToggle } from "../../charts";
import { ApiError } from "../../lib/api";
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
export const MAX_RUNS = 6;
const FUTURE: WeatherSet[] = ["low", "middle", "high"];

/** Runs the three 2041–2060 sets one after another (the server allows 2 at once, 20 a minute). */
export function useStoryRuns(add: (r: Run[]) => void) {
  const [state, setState] = useState<{ loading: boolean; error: ApiError | null }>({ loading: false, error: null });
  const ac = useRef<AbortController | null>(null);
  const run = useCallback(
    async (base: Omit<WhatIfBody, "weather" | "year">, year: number) => {
      ac.current?.abort();
      const c = (ac.current = new AbortController());
      setState({ loading: true, error: null });
      const out: Run[] = [];
      try {
        for (const w of FUTURE) {
          const body = { ...base, weather: w, year };
          out.push({ key: runKey(body), body, data: await insightsApi.whatIf(body, c.signal) });
        }
        add(out);
        setState({ loading: false, error: null });
      } catch (e) {
        if (c.signal.aborted || (e as Error)?.name === "AbortError") return;
        if (out.length) add(out);
        setState({ loading: false, error: e instanceof ApiError ? e : new ApiError(0, String(e)) });
      }
    },
    [add],
  );
  return { ...state, run };
}

export function ComparePanel({ runs, onRemove, onClear, storyRuns, canRunStories, storyYear, onRunStories }: { runs: Run[]; onRemove: (k: string) => void; onClear: () => void; storyRuns: { loading: boolean; error: ApiError | null }; canRunStories: boolean; storyYear: number; onRunStories: () => void }) {
  const label = (r: Run) => `${WEATHER_SHORT[r.body.weather]} ${r.body.year}`;
  const sameField = new Set(runs.map((r) => `${r.body.parcelId}|${r.body.crop}`)).size <= 1;
  const scenarios = [...new Set(runs.map((r) => r.data.prediction.scenario))];
  const basis = runs[0]?.data.basis;
  return (
    <Panel
      title="Compare scenarios side by side"
      subtitle="Each bar is a separate what-if run with the trained model. Results are shown as returned, not combined."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="text-xs" disabled={!canRunStories || storyRuns.loading} onClick={onRunStories} title={canRunStories ? undefined : "Pick a field first"}>
            Run all three 2041–2060 sets for {storyYear}
          </Button>
          {runs.length > 0 && (
            <Button variant="ghost" className="text-xs" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      }
    >
      {basis && (
        <div className="mb-3">
          <BasisChip basis={basis} whatIf />
        </div>
      )}
      {storyRuns.loading && <Loading label="Running the three climate sets…" />}
      {storyRuns.error && <ErrorState error={storyRuns.error} className="mb-3" />}
      {!runs.length && !storyRuns.loading ? (
        <EmptyState title="Nothing to compare yet">Run the model, then press "Add to comparison", or run all three 2041–2060 weather sets for this field at once.</EmptyState>
      ) : runs.length ? (
        <TableToggle
          toolbar={!sameField && <Badge tone="rapeseed">Different fields or crops: compare with care</Badge>}
          table={{
            columns: [
              { key: "w", header: "Weather and season", render: (r) => label(r) },
              { key: "f", header: "Field", render: (r) => `${parcelShort(r.body.parcelId)} · ${r.data.prediction.farmId} · ${cropLabel(r.body.crop)}` },
              { key: "i", header: "Irrigation", render: (r) => IRRIGATION_SHORT[r.body.irrigation] },
              { key: "y", header: "Our model", align: "right", render: (r) => fmtTHa(r.data.prediction.yieldTHa), sortValue: (r) => r.data.prediction.yieldTHa },
              { key: "v", header: "vs baseline", align: "right", render: (r) => pct(r.data.vsBaseline), sortValue: (r) => r.data.vsBaseline ?? null },
              { key: "b", header: "Baseline", align: "right", render: (r) => fmtTHa(r.data.prediction.baselineTHa) },
              { key: "o", header: "Outside training range", render: (r) => (r.data.prediction.outOfTrainingRange.length ? `${r.data.prediction.outOfTrainingRange.length} measure(s)` : "No") },
              { key: "x", header: "", render: (r) => <button type="button" className="link text-xs" onClick={() => onRemove(r.key)} aria-label={`Remove ${label(r)}`}><Trash2 className="size-3.5" aria-hidden /></button> },
            ],
            rows: runs,
            rowKey: (r) => r.key,
          }}
        >
          <BarChart
            ariaLabel="Modelled yield for each compared run"
            data={runs.map((r) => ({
              key: r.key,
              label: sameField ? label(r) : `${parcelShort(r.body.parcelId)} ${label(r)}`,
              value: r.data.prediction.yieldTHa,
              color: SCENARIO_COLOR[r.data.prediction.scenario] ?? "var(--brand)",
              detail: [
                { label: "vs baseline", value: pct(r.data.vsBaseline) },
                { label: "Baseline (farm average)", value: fmtTHa(r.data.prediction.baselineTHa) },
                { label: "Irrigation", value: IRRIGATION_SHORT[r.body.irrigation] },
              ],
            }))}
            format={(v) => fmtFixed(v, 1)}
            rowHeight={30}
          />
          <Legend className="mt-2" items={scenarios.map((s) => ({ label: s === "historical" ? "Historical weather" : s.toUpperCase().replace(/^SSP(\d)(\d)(\d)$/, "SSP$1-$2.$3"), color: SCENARIO_COLOR[s] ?? "var(--brand)" }))} />
          <p className="mt-2 text-xs text-muted">t/ha. The baseline (farm average) is the same for every weather set, so differences between bars come from weather{runs.some((r) => r.body.irrigation !== "usual") ? " and irrigation" : ""}.</p>
        </TableToggle>
      ) : null}
    </Panel>
  );
}

export const isFutureYear = (y: number) => y >= WEATHER_SETS.low.years[0] && y <= WEATHER_SETS.low.years[1];
