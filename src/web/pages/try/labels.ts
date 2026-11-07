// Plain names for model feature codes and short weather-set names (labels only, no figures).
import type { WeatherSet } from "@/shared/insights";

export const FEATURE_LABEL: Record<string, string> = {
  year: "Season (year)",
  sow_doy: "Sowing day of year",
  mat_doy: "Maturity day of year",
  gdd_gap: "Heat-sum shortfall",
  stress_early: "Drought stress, early stage (0–1)",
  stress_sens: "Drought stress, sensitive stage (0–1)",
  stress_late: "Drought stress, late stage (0–1)",
  hot_sens: "Heat days at 27 °C or above, sensitive stage",
  hot_season: "Heat days at 27 °C or above, whole season",
  t_sens: "Mean temperature, sensitive stage (°C)",
  rain_postsow: "Rain in 14 days after sowing (mm)",
  wet_postsow: "Wet days after sowing",
  rain_preharv: "Rain in 10 days before harvest (mm)",
  blight_days: "Warm, wet days, July–August",
  may_t: "May mean temperature (°C)",
  rain_season: "Season rain (mm)",
  pet_season: "Season evaporation demand (mm)",
};
export const featureLabel = (code: string) => FEATURE_LABEL[code] ?? code.replace(/_/g, " ");

export const WEATHER_SHORT: Record<WeatherSet, string> = {
  history: "Historical weather",
  c1: "SSP2-4.5 (C1 seasons)",
  low: "Low emissions (SSP1-2.6)",
  middle: "Middle emissions (SSP2-4.5)",
  high: "High emissions (SSP5-8.5)",
};

export const IRRIGATION_SHORT = { usual: "Usual practice", irrigated: "Irrigated", rainfed: "Not irrigated" } as const;

/** "F0028-P07" + soil + area -> "P07 · clay · 3.2 ha". */
export const parcelShort = (id: string) => id.split("-").pop() ?? id;
export const soilLabel = (s: string) => s.replace(/_/g, " ");
