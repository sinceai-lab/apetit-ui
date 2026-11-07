// Number/date formatting (en-GB default). Data dates are the simulated season's dates, never the wall clock.
import type { Region } from "@/shared/types";

const nf = (d: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const nfFixed = (d: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export const fmtNum = (v: number | null | undefined, digits = 0) => (ok(v) ? nf(digits).format(v) : "–");
export const fmtFixed = (v: number | null | undefined, digits = 1) => (ok(v) ? nfFixed(digits).format(v) : "–");
/** Compact: 37 812 -> "37.8k". */
export const fmtCompact = (v: number | null | undefined) =>
  ok(v) ? new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(v) : "–";
export const fmtHa = (v: number | null | undefined) => (ok(v) ? `${nf(v < 100 ? 1 : 0).format(v)} ha` : "–");
export const fmtTonnes = (v: number | null | undefined) => (ok(v) ? `${nf(0).format(v)} t` : "–");
export const fmtTHa = (v: number | null | undefined) => (ok(v) ? `${nfFixed(2).format(v)} t/ha` : "–");
/** Signed percent: +4.2 %, −3.1 %. */
export const fmtDelta = (v: number | null | undefined, digits = 1) =>
  ok(v) ? `${v > 0 ? "+" : v < 0 ? "−" : "±"}${nfFixed(digits).format(Math.abs(v))} %` : "–";
export const fmtShare = (v: number | null | undefined, digits = 0) => (ok(v) ? `${nfFixed(digits).format(v * 100)} %` : "–");

const parseDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "27 Oct 2027" (date-only values are treated as UTC days). */
export const fmtDate = (s: string | null | undefined) =>
  parseDate(s)?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) ?? "–";
export const fmtDayMonth = (s: string | null | undefined) =>
  parseDate(s)?.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) ?? "–";
/** Wall-clock timestamps (computedAt, notifications): "7 Nov 15:58". */
export const fmtDateTime = (s: string | null | undefined) =>
  parseDate(s)?.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) ?? "–";
export const fmtTime = (s: string | null | undefined) => parseDate(s)?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) ?? "–";
export function fmtAgo(s: string | null | undefined, now = Date.now()) {
  const d = parseDate(s);
  if (!d) return "–";
  const sec = Math.round((now - d.getTime()) / 1000);
  if (sec < 60) return `${Math.max(0, sec)} s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} d ago`;
}
export const shortHash = (s: string | null | undefined, n = 8) => (s ? s.slice(0, n) : "–");

const CROP_LABELS: Record<string, string> = {
  pea: "Pea",
  turnip_rape: "Turnip rape",
  potato: "Potato",
  carrot: "Carrot",
  spinach: "Spinach",
  grass_ley: "Grass ley",
  barley: "Barley",
  wheat: "Wheat",
  oats: "Oats",
  fallow: "Fallow",
};
export const cropLabel = (c: string) => CROP_LABELS[c] ?? c.replace(/_/g, " ");
export const regionLabel = (r: Region | "both") => (r === "FI_SW" ? "Finland" : r === "SE_SKANE" ? "Sweden" : "Both regions");
export const regionShort = (r: Region) => (r === "FI_SW" ? "FI" : "SE");
