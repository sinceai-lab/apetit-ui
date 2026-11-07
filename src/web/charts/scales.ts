/** Minimal scales and tick helpers for hand-built SVG charts (no chart library). */

export type LinearScale = {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  /** Pixel -> data value. */
  invert: (px: number) => number;
  /** Nice tick values inside the domain. */
  ticks: (count?: number) => number[];
};

/** Linear scale. `nice: true` extends the domain to round tick values. */
export function linearScale(domain: [number, number], range: [number, number], opts: { nice?: boolean; clamp?: boolean; tickCount?: number } = {}): LinearScale {
  let [d0, d1] = domain;
  if (d0 === d1) {
    const pad = Math.abs(d0) * 0.1 || 1;
    d0 -= pad;
    d1 += pad;
  }
  if (opts.nice) [d0, d1] = niceDomain(d0, d1, opts.tickCount ?? 5);
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0);
  const f = ((v: number) => {
    const x = opts.clamp ? Math.max(Math.min(d0, d1), Math.min(Math.max(d0, d1), v)) : v;
    return r0 + (x - d0) * k;
  }) as LinearScale;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  f.invert = (px) => d0 + (px - r0) / k;
  f.ticks = (count = opts.tickCount ?? 5) => niceTicks(d0, d1, count);
  return f;
}

/** Step size for ~count ticks: 1, 2, 2.5 or 5 x 10^n. */
export function tickStep(min: number, max: number, count = 5): number {
  const span = Math.abs(max - min) || 1;
  const raw = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  const m = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 2.25 ? 2.5 : err >= 1.5 ? 2 : 1;
  return m * pow;
}

/** Round tick values covering [min, max] (inclusive where they land). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const step = tickStep(lo, hi, count);
  const start = Math.ceil(lo / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Domain extended outward to tick multiples. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const step = tickStep(min, max, count);
  return [Math.floor(min / step + 1e-9) * step, Math.ceil(max / step - 1e-9) * step];
}

export type BandScale = {
  (key: string): number;
  keys: string[];
  bandwidth: number;
  step: number;
  range: [number, number];
};

/** Band scale for categorical positions; returns the band start. */
export function bandScale(keys: string[], range: [number, number], opts: { paddingInner?: number; paddingOuter?: number } = {}): BandScale {
  const { paddingInner = 0.25, paddingOuter = 0.15 } = opts;
  const [r0, r1] = range;
  const n = Math.max(1, keys.length);
  const step = (r1 - r0) / Math.max(1, n - paddingInner + paddingOuter * 2);
  const bandwidth = step * (1 - paddingInner);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const f = ((key: string) => r0 + step * paddingOuter + step * (idx.get(key) ?? 0)) as BandScale;
  f.keys = keys;
  f.bandwidth = bandwidth;
  f.step = step;
  f.range = [r0, r1];
  return f;
}

/** [min, max] of finite values (nulls / NaN ignored). Returns [0, 1] for empty input. */
export function extent(values: Iterable<number | null | undefined>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

/** Pad a domain by a fraction of its span on both sides. */
export const padDomain = ([a, b]: [number, number], frac = 0.05): [number, number] => {
  const s = (b - a) * frac || Math.abs(a) * frac || 1;
  return [a - s, b + s];
};

/** Rough rendered width of a label in px (system sans): good enough for margins and fit checks. */
export const textWidth = (s: string, fontSize = 11) => s.length * fontSize * 0.58;

/** Index of the value in a sorted numeric array closest to x. */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i]! - x);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// Bar path with a 4px rounded data end and a square baseline end.
// `end` names the data end: "top" (column up), "bottom" (column down), "right" (bar right), "left" (bar left).
export function barPath(x: number, y: number, w: number, h: number, end: "top" | "bottom" | "left" | "right" | "none", radius = 4): string {
  if (w <= 0 || h <= 0) return "";
  const r = Math.min(radius, end === "top" || end === "bottom" ? w / 2 : h / 2, end === "top" || end === "bottom" ? h : w);
  if (end === "none" || r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  switch (end) {
    case "top":
      return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    case "bottom":
      return `M${x},${y}H${x + w}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}Z`;
    case "right":
      return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    case "left":
      return `M${x + w},${y}V${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`;
  }
}

/** SVG path for a polyline; null values break the line into segments. */
export function linePath(xs: number[], ys: (number | null | undefined)[]): string {
  let d = "";
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y == null || !Number.isFinite(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${xs[i]!.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** SVG path for a closed band between lo and hi (gaps break the band). */
export function bandPath(xs: number[], lo: (number | null | undefined)[], hi: (number | null | undefined)[]): string {
  let d = "";
  let seg: number[] = [];
  const flush = () => {
    if (seg.length > 1) {
      d += seg.map((i, k) => `${k ? "L" : "M"}${xs[i]!.toFixed(1)},${hi[i]!.toFixed(1)}`).join("");
      d += [...seg].reverse().map((i) => `L${xs[i]!.toFixed(1)},${lo[i]!.toFixed(1)}`).join("") + "Z";
    }
    seg = [];
  };
  for (let i = 0; i < xs.length; i++) {
    const a = lo[i];
    const b = hi[i];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) flush();
    else seg.push(i);
  }
  flush();
  return d;
}

/** Calendar ticks for a UTC epoch-ms domain: month starts (thinned to ≤ max), or Jan 1sts for long spans. */
export function timeTicks(a: number, b: number, max = 6): number[] {
  const d = new Date(a);
  let y = d.getUTCFullYear(), mo = d.getUTCMonth();
  const months: number[] = [];
  for (let t = Date.UTC(y, mo, 1); t <= b; t = Date.UTC(y, ++mo, 1)) if (t >= a) months.push(t);
  if (months.length > max * 12) return niceTicks(new Date(a).getUTCFullYear(), new Date(b).getUTCFullYear(), max).map((yr) => Date.UTC(yr, 0, 1)).filter((t) => t >= a && t <= b);
  const step = [1, 2, 3, 6, 12].find((s) => Math.ceil(months.length / s) <= max) ?? Math.ceil(months.length / max);
  return months.filter((t) => new Date(t).getUTCMonth() % step === 0 || step > 12);
}
