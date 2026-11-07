// Fixed data colours (contract §7.1). SVG uses the CSS vars; canvas/Leaflet use the hex helpers.

export const VIZ = {
  grid: "var(--viz-grid)",
  axis: "var(--viz-axis)",
  muted: "var(--muted)",
  ink: "var(--text)",
  surface: "var(--surface)",
  estimate: "var(--viz-estimate)",
  baseline: "var(--viz-baseline)",
  temp: "var(--viz-temp)",
  precip: "var(--viz-precip)",
  et0: "var(--viz-et0)",
  observed: "var(--viz-observed)",
  filledGap: "var(--viz-filled-gap)",
  filledAhead: "var(--viz-filled-ahead)",
} as const;

export const SCENARIO_COLOR: Record<string, string> = {
  historical: "var(--viz-historical)",
  ssp126: "var(--viz-ssp126)",
  ssp245: "var(--viz-ssp245)",
  ssp585: "var(--viz-ssp585)",
};

const CROP_VARS = new Set(["pea", "turnip_rape", "potato", "carrot", "spinach"]);
export const cropColor = (crop: string) => (CROP_VARS.has(crop) ? `var(--viz-${crop})` : "var(--viz-other)");

const CROP_HEX: Record<string, [string, string]> = {
  pea: ["#4E9A3A", "#7CC266"],
  turnip_rape: ["#D29E00", "#E8BE3A"],
  potato: ["#7E57A6", "#B394D8"],
  carrot: ["#E07020", "#F29A55"],
  spinach: ["#1E6E73", "#4FB3B8"],
};
export const cropHex = (crop: string, dark = false) => CROP_HEX[crop]?.[dark ? 1 : 0] ?? "#8C8678";

/** Δ% domain clamp for the diverging estimate-vs-baseline scale. */
export const DELTA_CLAMP = 25;
const DIV_LIGHT = ["#A6611A", "#DFC27D", "#EDE7D9", "#80CDC1", "#01665E"];
const DIV_DARK = ["#A6611A", "#DFC27D", "#3A3A33", "#80CDC1", "#01665E"];

const hex2rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const rgb2hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Earthy BrBG diverging colour for a Δ% (brown below, teal above); null -> neutral. */
export function deltaColor(pct: number | null | undefined, dark = false): string {
  const stops = dark ? DIV_DARK : DIV_LIGHT;
  if (pct == null || !Number.isFinite(pct)) return stops[2]!;
  const t = (Math.max(-DELTA_CLAMP, Math.min(DELTA_CLAMP, pct)) + DELTA_CLAMP) / (2 * DELTA_CLAMP);
  const pos = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const a = hex2rgb(stops[i]!);
  const b = hex2rgb(stops[i + 1]!);
  const f = pos - i;
  return rgb2hex(a.map((v, k) => v + (b[k]! - v) * f));
}
export const DELTA_STOPS = (dark = false) => (dark ? DIV_DARK : DIV_LIGHT);

/** Resolve a CSS variable to its current value (for canvas renderers). */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
