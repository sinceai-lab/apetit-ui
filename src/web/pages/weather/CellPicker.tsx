// Grid-cell picker: a small SVG map of the 0.25° cells per region plus an accessible <select>.
import { useMemo } from "react";
import type { Cell, Region } from "@/shared/types";
import { regionLabel } from "../../lib/format";
import { useMeasure } from "../../charts";

const HALF = 0.125;

export function CellPicker({ cells, selected, parcels, onPick }: { cells: Cell[]; selected: string | null; parcels: Map<string, number>; onPick: (cellId: string) => void }) {
  const byRegion = useMemo(() => {
    const m = new Map<Region, Cell[]>();
    for (const c of cells) m.set(c.region, [...(m.get(c.region) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [cells]);
  const max = Math.max(1, ...parcels.values());
  return (
    <div className="space-y-3">
      <label className="block text-[13px] text-muted">
        Grid cell
        <select
          value={selected ?? ""}
          onChange={(e) => onPick(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-ink"
        >
          {byRegion.map(([r, cs]) => (
            <optgroup key={r} label={regionLabel(r)}>
              {[...cs]
                .sort((a, b) => a.cellId.localeCompare(b.cellId))
                .map((c) => (
                  <option key={c.cellId} value={c.cellId}>
                    {c.cellId} · {c.elevationM} m{parcels.get(c.cellId) ? ` · ${parcels.get(c.cellId)} contract parcels` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {byRegion.map(([r, cs]) => (
        <MiniGrid key={r} region={r} cells={cs} selected={selected} parcels={parcels} max={max} onPick={onPick} />
      ))}
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-block size-3 rounded-sm border border-border" style={{ background: "var(--brand-soft)" }} />
        darker = more contract parcels
        <span className="ml-2 inline-block size-3 rounded-sm border-2" style={{ borderColor: "var(--rapeseed)" }} />
        selected
      </div>
    </div>
  );
}

function MiniGrid({ region, cells, selected, parcels, max, onPick }: { region: Region; cells: Cell[]; selected: string | null; parcels: Map<string, number>; max: number; onPick: (id: string) => void }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const lons = cells.map((c) => c.location[0]);
  const lats = cells.map((c) => c.location[1]);
  const x0 = Math.min(...lons) - HALF;
  const x1 = Math.max(...lons) + HALF;
  const y0 = Math.min(...lats) - HALF;
  const y1 = Math.max(...lats) + HALF;
  // Shrink longitude by cos(latitude) so the cells look square on screen.
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const aspect = (y1 - y0) / ((x1 - x0) * k);
  const w = width;
  const h = Math.min(220, w * aspect);
  const sx = (lon: number) => ((lon - x0) / (x1 - x0)) * w;
  const sy = (lat: number) => h - ((lat - y0) / (y1 - y0)) * h;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">{regionLabel(region)}</div>
      <div ref={ref} className="w-full">
        {w > 0 && (
          <svg width={w} height={h} role="group" aria-label={`${regionLabel(region)} grid cells`}>
            {cells.map((c) => {
              const [lon, lat] = c.location;
              const n = parcels.get(c.cellId) ?? 0;
              const on = c.cellId === selected;
              const cx = sx(lon - HALF);
              const cy = sy(lat + HALF);
              const cw = sx(lon + HALF) - cx;
              const ch = sy(lat - HALF) - cy;
              return (
                <g key={c.cellId} onClick={() => onPick(c.cellId)} style={{ cursor: "pointer" }}>
                  <title>{`${c.cellId} · ${c.elevationM} m · ${n} contract parcels`}</title>
                  <rect
                    x={cx + 1}
                    y={cy + 1}
                    width={Math.max(0, cw - 2)}
                    height={Math.max(0, ch - 2)}
                    rx={3}
                    style={{ fill: n ? "var(--brand)" : "var(--surface-2)", fillOpacity: n ? 0.15 + 0.7 * (n / max) : 1, stroke: on ? "var(--rapeseed)" : "var(--border)", strokeWidth: on ? 3 : 1 }}
                  />
                  {cw > 34 && (
                    <text x={cx + cw / 2} y={cy + ch / 2} dy="0.32em" textAnchor="middle" style={{ fontSize: 9, fill: n / max > 0.55 ? "var(--surface)" : "var(--muted)", pointerEvents: "none" }}>
                      {c.cellId.slice(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
