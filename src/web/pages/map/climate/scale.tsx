// Story-change bands for the climate layer (edges from /insights/farms) and their legend.
import type { ClimateFarm, Story } from "@/shared/insights";
import { fmtNum } from "../../../lib/format";
import { storyColor } from "../../try/common";

export const farmChange = (f: ClimateFarm, story: Story) => (story === "below_2c" ? f.changeBelow2c : f.changeCurrentPolicies);

export interface Band {
  lo: number | null;
  hi: number | null;
  label: string;
  mid: number;
}

const p = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${fmtNum(Math.abs(x * 100))} %`;

/** Edges [-0.06 … 0.06] -> open-ended bins; `mid` is only used to pick a colour. */
export function bandsOf(edges: number[]): Band[] {
  if (!edges.length) return [];
  const out: Band[] = [{ lo: null, hi: edges[0]!, label: `below ${p(edges[0]!)}`, mid: edges[0]! }];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i]!;
    const b = edges[i + 1]!;
    out.push({ lo: a, hi: b, label: a < 0 && b > 0 ? `${p(a)} to ${p(b)} (about the same)` : `${p(a)} to ${p(b)}`, mid: a < 0 && b > 0 ? 0 : (a + b) / 2 });
  }
  out.push({ lo: edges[edges.length - 1]!, hi: null, label: `above ${p(edges[edges.length - 1]!)}`, mid: edges[edges.length - 1]! });
  return out;
}

export const inBand = (v: number | null, b: Band) => v != null && (b.lo == null || v >= b.lo) && (b.hi == null || v < b.hi);

export function BandLegend({ bands, farms, story, dark }: { bands: Band[]; farms: ClimateFarm[]; story: Story; dark: boolean }) {
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {[...bands].reverse().map((b) => (
        <li key={b.label} className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3 shrink-0 rounded-full border border-border" style={{ background: storyColor(b.mid, dark) }} />
          <span className="min-w-0 flex-1">{b.label}</span>
          <span className="tnum text-muted">{fmtNum(farms.filter((f) => inBand(farmChange(f, story), b)).length)} farms</span>
        </li>
      ))}
    </ul>
  );
}
