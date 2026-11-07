// Insight codes and response types (contract §10; upstream shapes in model-inference/docs/INSIGHTS_API.md), camelCased.
// Every figure here comes from the inference service. Pages format and sort them, never compute them.
import type { Crop, Envelope, Region } from "./types";

export type Story = "below_2c" | "current_policies";
export type ClimateScenario = "ssp126" | "ssp585";
export type BacktestTest = "loyo" | "forward";
export type WeatherSet = "history" | "c1" | "low" | "middle" | "high";
export type Irrigation = "usual" | "irrigated" | "rainfed";

export const STORIES: Story[] = ["below_2c", "current_policies"];
export const CLIMATE_SCENARIOS: ClimateScenario[] = ["ssp126", "ssp585"];
export const BACKTEST_TESTS: BacktestTest[] = ["loyo", "forward"];
export const IRRIGATIONS: Irrigation[] = ["usual", "irrigated", "rainfed"];

/** Plain weather-set codes the browser sends; the server maps them to model scenarios. */
export const WEATHER_SETS: Record<WeatherSet, { scenario: "historical" | "ssp126" | "ssp245" | "ssp585"; years: [number, number] }> = {
  history: { scenario: "historical", years: [1991, 2026] },
  c1: { scenario: "ssp245", years: [2027, 2031] },
  low: { scenario: "ssp126", years: [2041, 2060] },
  middle: { scenario: "ssp245", years: [2041, 2060] },
  high: { scenario: "ssp585", years: [2041, 2060] },
};
export const IRRIGATION_SHARE: Record<Irrigation, number | null> = { usual: null, irrigated: 1, rainfed: 0 };
export const STORY_SSP: Record<Story, ClimateScenario> = { below_2c: "ssp126", current_policies: "ssp585" };

export interface WhatIfBody {
  parcelId: string;
  crop: Crop;
  weather: WeatherSet;
  year: number;
  irrigation: Irrigation;
}

export interface Basis {
  kind: "batch" | "model";
  label: string;
  modelVersion: string | null;
  sources: { file: string; generatedAt: string | null }[];
  staleVsModel: boolean;
}

/** A plain-language sentence; `template`/`values` let a Finnish UI format it itself. */
export interface Sentence {
  code: string;
  template: string;
  values: Record<string, [number | string, string]>;
  text: string;
}
export interface Action extends Sentence {
  rule: string;
  decision: string;
  evidence: string;
}
export interface Coded {
  code: string;
  label: string;
}
export interface ModelBaseline {
  model: number | null;
  baseline: number | null;
}

export interface InsightEnvelope extends Envelope {
  basis?: Basis;
}

export interface InsightsMeta extends InsightEnvelope {
  modelVersion: string | null;
  modelsFileDate: string | null;
  modelLoadError: string | null;
  files: { file: string; generatedAt: string | null; rows: number | null; loadError: string | null; staleVsModel: boolean }[];
  synthetic: boolean;
  disclaimer: string;
}

export interface InsightsOptions extends InsightEnvelope {
  regions: (Coded & { code: Region; crops: Crop[] })[];
  crops: (Coded & { code: Crop })[];
  stories: (Coded & { code: Story; ssp: ClimateScenario; blurb: string })[];
  advicePairs: { region: Region; crop: Crop; confidence: string }[];
  tests: (Coded & { code: BacktestTest })[];
  weatherSets: (Coded & { code: WeatherSet; scenario: string; years: [number, number] })[];
  irrigation: (Coded & { code: Irrigation; share: number | null; regions: Region[] })[];
  irrigationNote: string;
  farms?: string[];
  parcels?: { parcelId: string; areaHa: number; soil: string; drainage: string; cellId: string }[];
}

export interface StoryResult {
  story: Story;
  label: string;
  ssp: ClimateScenario;
  yieldChange: number | null;
  yieldChangeLow: number | null;
  yieldChangeHigh: number | null;
  badYearChance: number | null;
  addedImportCostEurYr: number | null;
}

export interface InsightsAdvice extends InsightEnvelope {
  region: Region;
  crop: Crop;
  story: Story;
  confidence: string;
  stories: StoryResult[];
  badYearsSoFar: { badYearChanceToday: number | null; seen: number | null; seasons: number | null };
  actions: Action[];
  actionsNote: string;
  themes: { theme: string; below2c: number | null; currentPolicies: number | null }[];
  themesNote: string;
  seasonShift: { measure: string; label: string; unit: string; below2c: number | null; currentPolicies: number | null }[];
  seasonTable: { measure: string; today: number | null; below2c: number | null; currentPolicies: number | null }[];
  seasonNote: string;
  why: Sentence[];
}

export interface InsightsPolicy extends InsightEnvelope {
  paths: { story: Story; label: string; year: number; fertiliserChange: number | null; dieselChange: number | null; carbonEurT: number | null }[];
  inputs: { region: Region; crop: Crop; nKgHa: number | null; dieselLHa: number | null }[];
  note: string;
}

export interface InsightsOutlook extends InsightEnvelope {
  region: Region;
  crop: Crop;
  history: { year: number; actualTHa: number | null }[];
  forecast: { year: number; modelTHa: number | null; baselineTHa: number | null }[];
  note: string;
  warning: string;
}

export interface InsightsClimateRisk extends InsightEnvelope {
  scenario: ClimateScenario;
  story: Story;
  label: string;
  rows: {
    region: Region;
    crop: Crop;
    meanYieldChangePct: number | null;
    changeMinPct: number | null;
    changeMaxPct: number | null;
    badYearChance: number | null;
    baselineChangePct: number | null;
    baselineBadYearChance: number | null;
    confidence: string;
  }[];
  note: string;
}

export interface InsightsEuroRisk extends InsightEnvelope {
  /** One row per region; never add the two up. */
  totals: { region: Region; baseline: number | null; ssp126: number | null; ssp585: number | null }[];
  scenarios: Coded[];
  byCrop: {
    region: Region;
    crop: Crop;
    scenario: string;
    areaHa: number | null;
    priceEurT: number | null;
    premium: number | null;
    baselineT: number | null;
    meanShortfallT: number | null;
    expectedCostEurYr: number | null;
    badYearP90CostEur: number | null;
    addedVsTodaysClimateEurYr: number | null;
  }[];
  note: string;
}

export interface ClimateFarm {
  farmId: string;
  lat: number;
  lon: number;
  nFields: number;
  areaHa: number;
  dryFields: number;
  dryHa: number;
  dryShare: number;
  plannedFields: number;
  plannedHa: number;
  plannedDryHa: number;
  changeBelow2c: number | null;
  changeCurrentPolicies: number | null;
}

export interface InsightsFarms extends InsightEnvelope {
  region: Region;
  crop: Crop;
  farms: ClimateFarm[];
  /** "Farms to contact first", in the upstream's order. */
  labelled: string[];
  bands: { edges: number[] };
  orderNote: string;
  note: string;
}

export interface InsightsSoilEffects extends InsightEnvelope {
  region: Region;
  crop: Crop;
  soils: {
    soil: string;
    label: string;
    droughty: boolean;
    nFields: number;
    areaHa: number;
    changeBelow2c: number | null;
    changeCurrentPolicies: number | null;
    stressToday: number | null;
    stressBelow2c: number | null;
    stressCurrentPolicies: number | null;
  }[];
  note: string;
}

export interface ClimateField {
  parcelId: string;
  areaHa: number;
  soil: string;
  drainage: string;
  droughty: boolean;
  yieldTodayTHa: number | null;
  changeBelow2c: number | null;
  changeCurrentPolicies: number | null;
  soilChangeBelow2c: number | null;
  soilChangeCurrentPolicies: number | null;
  stressToday: number | null;
  lastGrown: number | null;
  nextPlanned: number | null;
}

export interface InsightsFarm extends InsightEnvelope {
  farmId: string;
  region: Region;
  crop: Crop;
  story: Story;
  headline: {
    yieldChange: number | null;
    yieldChangeOtherStory: number | null;
    regionYieldChange: number | null;
    dryShare: number | null;
    dryFields: number;
    nFields: number;
    plannedFields: number;
    plannedDryHa: number | null;
    usualIrrigatedShare: number | null;
  };
  risk: Sentence;
  why: Sentence[];
  yieldBySoil: { soil: string; label: string; yieldTodayTHa: number | null }[];
  fields: ClimateField[];
  fieldsWarning: string;
  fieldsNote: string;
  actions: Action[];
  actionsNote: string;
}

export interface InsightsField extends InsightEnvelope {
  parcelId: string;
  farmId: string;
  region: Region;
  crop: Crop;
  story: Story;
  soil: string;
  areaHa: number;
  drainage: string;
  droughty: boolean;
  yieldChange: number | null;
  regionYieldChange: number | null;
  yieldTodayTHa: number | null;
  stressToday: number | null;
  stressFuture: number | null;
  localYieldChange: number | null;
  lastGrown: number | null;
  nextPlanned: number | null;
  risk: Sentence;
  why: Sentence[];
  /** "This grid square only" caveat. */
  localNote: Sentence;
}

export interface FieldPrediction {
  parcelId: string;
  farmId: string;
  cellId: string;
  crop: Crop;
  scenario: string;
  year: number;
  yieldTHa: number | null;
  baselineTHa: number | null;
  usualIrrigation: number | null;
  irrigation: number | null;
  modelName: string;
  modelVersion: string;
  technologyYear: number;
  outOfTrainingRange: { field: string; value: number; trainingMin: number; trainingMax: number }[];
  /** Keys are driver labels, kept as the model returns them. */
  effects: Record<string, number>;
  /** Keys are model feature codes (snake_case, matching outOfTrainingRange.field). */
  weather: Record<string, number>;
}

export interface WhatIfResponse extends InsightEnvelope {
  prediction: FieldPrediction;
  /** Absent when the upstream predates /insights/what-if; hide "Why this number" then. */
  degraded?: "drivers unavailable";
  baseTHa?: number | null;
  vsBaseline?: number | null;
  drivers?: { driver: string; effect: number }[];
  driversNote?: string;
  parcel?: { soil: string; areaHa: number; region: Region; drainage?: string };
  weatherTable?: { measure: string; value: number | null }[];
  notes?: Sentence[];
  fairCheck?: { actualTHa: number | null; modelTHa: number | null; baselineTHa: number | null; text: string } | null;
  actualNote?: string;
}

export interface InsightsTrust extends InsightEnvelope {
  test: BacktestTest;
  label: string;
  /** Pooled across regions, as Streamlit shows it; prefer headlineByRegion. */
  headline: { productionError: ModelBaseline; yieldErrorNrmse: ModelBaseline; pooled: boolean; note: string };
  headlineByRegion: { region: Region; label: string; productionError: ModelBaseline; yieldErrorNrmse: ModelBaseline }[];
  headlineNote: string;
  caveat: string;
  methods: (Coded & { text: string })[];
  byCrop: {
    region: Region;
    crop: Crop;
    label: string;
    seasons: number;
    baselineProductionError: number | null;
    modelProductionError: number | null;
    baselineYieldError: number | null;
    modelYieldError: number | null;
    improvement: number | null;
  }[];
  byCropNote: string;
  peaModels: { region: Region; method: string; label: string; productionError: number | null; yieldError: number | null }[];
  peaModelsNote: string;
  scorer: { model: number | null; baseline: number | null; note: string };
  c1SelfCheck: { maxDiffTHa: number | null; rows: number; note: string } | null;
}

export interface InsightsTrustSeasons extends InsightEnvelope {
  region: Region;
  crop: Crop;
  test: BacktestTest;
  seasons: { year: number; actualTHa: number | null; baselineTHa: number | null; modelTHa: number | null; baselineMiss: number | null; modelMiss: number | null }[];
  farms: string[];
  note: string;
}

export interface InsightsLiveReplay extends InsightEnvelope {
  test: BacktestTest;
  scope: string;
  pooled: boolean;
  scopes: string[];
  points: {
    knownUntil: string;
    baselineProductionError: number | null;
    baselineYieldErrorNrmse: number | null;
    estimateProductionError: number | null;
    estimateYieldErrorNrmse: number | null;
    shareOfSeasonsBeatingBaseline: number | null;
    plainCountsProductionError: number | null;
    regionCropSeasons: number;
    farmSeasons: number;
  }[];
  /** "none" when the estimate already beats the farm average before any weather. */
  firstBetter: string | null;
  note: string;
}

export interface InsightsCorrections extends InsightEnvelope {
  survey: number;
  erp: number;
  used: number;
  summary: Sentence;
  rows: { recordKey: string; field: string; oldValue: number | string | null; newValue: number | string | null; rule: string; source: string; usedForYield: boolean }[];
}
