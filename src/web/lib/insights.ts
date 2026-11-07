// Typed client and hooks for /api/insights/* (contract §10). Scenario results only: never mix with /api/live data.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Crop, Region } from "@/shared/types";
import type {
  BacktestTest,
  Basis,
  ClimateScenario,
  InsightsAdvice,
  InsightsClimateRisk,
  InsightsCorrections,
  InsightsEuroRisk,
  InsightsFarm,
  InsightsFarms,
  InsightsField,
  InsightsLiveReplay,
  InsightsMeta,
  InsightsOptions,
  InsightsOutlook,
  InsightsPolicy,
  InsightsSoilEffects,
  InsightsTrust,
  InsightsTrustSeasons,
  Story,
  WhatIfBody,
  WhatIfResponse,
} from "@/shared/insights";
import { ApiError, getJson } from "./api";
import { useApi, type AsyncState } from "./usePoll";
import { fmtDate, shortHash } from "./format";

type S = AbortSignal | undefined;
const enc = encodeURIComponent;

export const insightsApi = {
  meta: (s?: S) => getJson<InsightsMeta>("/api/insights/meta", undefined, s),
  options: (q: { region?: Region; crop?: Crop; farm?: string } = {}, s?: S) => getJson<InsightsOptions>("/api/insights/options", q, s),
  advice: (q: { region: Region; crop: Crop; story: Story }, s?: S) => getJson<InsightsAdvice>("/api/insights/advice", q, s),
  policy: (s?: S) => getJson<InsightsPolicy>("/api/insights/policy", undefined, s),
  outlook: (q: { region: Region; crop: Crop }, s?: S) => getJson<InsightsOutlook>("/api/insights/outlook", q, s),
  climateRisk: (scenario: ClimateScenario, s?: S) => getJson<InsightsClimateRisk>("/api/insights/climate-risk", { scenario }, s),
  euroRisk: (s?: S) => getJson<InsightsEuroRisk>("/api/insights/euro-risk", undefined, s),
  farms: (q: { region: Region; crop: Crop }, s?: S) => getJson<InsightsFarms>("/api/insights/farms", q, s),
  soilEffects: (q: { region: Region; crop: Crop }, s?: S) => getJson<InsightsSoilEffects>("/api/insights/soil-effects", q, s),
  farm: (farmId: string, q: { crop: Crop; story: Story }, s?: S) => getJson<InsightsFarm>(`/api/insights/farms/${enc(farmId)}`, q, s),
  field: (parcelId: string, q: { crop: Crop; story: Story }, s?: S) => getJson<InsightsField>(`/api/insights/fields/${enc(parcelId)}`, q, s),
  trust: (test: BacktestTest, s?: S) => getJson<InsightsTrust>("/api/insights/trust", { test }, s),
  trustSeasons: (q: { region: Region; crop: Crop; test: BacktestTest; farm?: string }, s?: S) => getJson<InsightsTrustSeasons>("/api/insights/trust/seasons", q, s),
  liveReplay: (q: { test: BacktestTest; scope?: string }, s?: S) => getJson<InsightsLiveReplay>("/api/insights/trust/live-replay", q, s),
  corrections: (s?: S) => getJson<InsightsCorrections>("/api/insights/trust/corrections", undefined, s),
  whatIf: async (body: WhatIfBody, s?: S): Promise<WhatIfResponse> => {
    let res: Response;
    try {
      res = await fetch("/api/insights/what-if", { method: "POST", signal: s, body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/json" } });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      throw new ApiError(0, "App server unreachable");
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, json?.error ?? `HTTP ${res.status}`, json?.upstream);
    return json as WhatIfResponse;
  },
};

/** Hooks load on navigation (no polling); pass `null` for a missing required input to skip the call. */
const on = (...xs: unknown[]) => xs.every((x) => x != null && x !== "");

export const useInsightsMeta = () => useApi((s) => insightsApi.meta(s), []);
export const useInsightsOptions = (q: { region?: Region; crop?: Crop; farm?: string } = {}) =>
  useApi((s) => insightsApi.options(q, s), [q.region, q.crop, q.farm], { enabled: !q.crop || !!q.region });
export const useAdvice = (region: Region | null, crop: Crop | null, story: Story) =>
  useApi((s) => insightsApi.advice({ region: region!, crop: crop!, story }, s), [region, crop, story], { enabled: on(region, crop) });
export const usePolicy = () => useApi((s) => insightsApi.policy(s), []);
export const useOutlook = (region: Region | null, crop: Crop | null) =>
  useApi((s) => insightsApi.outlook({ region: region!, crop: crop! }, s), [region, crop], { enabled: on(region, crop) });
export const useClimateRisk = (scenario: ClimateScenario) => useApi((s) => insightsApi.climateRisk(scenario, s), [scenario]);
export const useEuroRisk = () => useApi((s) => insightsApi.euroRisk(s), []);
export const useClimateFarms = (region: Region | null, crop: Crop | null) =>
  useApi((s) => insightsApi.farms({ region: region!, crop: crop! }, s), [region, crop], { enabled: on(region, crop) });
export const useSoilEffects = (region: Region | null, crop: Crop | null) =>
  useApi((s) => insightsApi.soilEffects({ region: region!, crop: crop! }, s), [region, crop], { enabled: on(region, crop) });
export const useFarmStory = (farmId: string | null, crop: Crop | null, story: Story) =>
  useApi((s) => insightsApi.farm(farmId!, { crop: crop!, story }, s), [farmId, crop, story], { enabled: on(farmId, crop) });
export const useFieldStory = (parcelId: string | null, crop: Crop | null, story: Story) =>
  useApi((s) => insightsApi.field(parcelId!, { crop: crop!, story }, s), [parcelId, crop, story], { enabled: on(parcelId, crop) });
export const useTrust = (test: BacktestTest) => useApi((s) => insightsApi.trust(test, s), [test]);
export const useTrustSeasons = (region: Region | null, crop: Crop | null, test: BacktestTest, farm?: string | null) =>
  useApi((s) => insightsApi.trustSeasons({ region: region!, crop: crop!, test, farm: farm ?? undefined }, s), [region, crop, test, farm], { enabled: on(region, crop) });
export const useLiveReplay = (test: BacktestTest, scope = "all") => useApi((s) => insightsApi.liveReplay({ test, scope }, s), [test, scope]);
export const useCorrections = () => useApi((s) => insightsApi.corrections(s), []);

export interface WhatIfState extends Omit<AsyncState<WhatIfResponse>, "refresh" | "updatedAt"> {
  run: (body: WhatIfBody) => void;
  body: WhatIfBody | null;
}

/** Runs only when `run` is called (the Run button), never on picker changes. */
export function useWhatIf(): WhatIfState {
  const [state, setState] = useState<{ data: WhatIfResponse | null; error: ApiError | null; loading: boolean; body: WhatIfBody | null }>({ data: null, error: null, loading: false, body: null });
  const ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);
  const run = useCallback((body: WhatIfBody) => {
    ac.current?.abort();
    const c = (ac.current = new AbortController());
    setState((p) => ({ ...p, loading: true, error: null, body }));
    insightsApi
      .whatIf(body, c.signal)
      .then((data) => !c.signal.aborted && setState({ data, error: null, loading: false, body }))
      .catch((e) => {
        if (c.signal.aborted || e?.name === "AbortError") return;
        setState({ data: null, error: e instanceof ApiError ? e : new ApiError(0, String(e?.message ?? e)), loading: false, body });
      });
  }, []);
  return { ...state, run };
}

/** "Scenario result · model 5cf88f33 · file 7 Nov 2026": the chip text next to an insight panel's title. */
export function basisChip(b: Basis | null | undefined): string {
  if (!b) return "Scenario result";
  const dates = b.sources.map((x) => x.generatedAt).filter((x): x is string => !!x).sort();
  const latest = dates[dates.length - 1];
  // Backtests, replays and the cleaning log are past-season batch files, not scenarios.
  const past = b.sources.length > 0 && b.sources.every((s) => /^(backtest_|live_season_replay|yield_corrections)/.test(s.file));
  return [past ? "Backtest result" : "Scenario result", b.modelVersion && `model ${shortHash(b.modelVersion)}`, latest && `file ${fmtDate(latest.slice(0, 10))}`].filter(Boolean).join(" · ");
}
