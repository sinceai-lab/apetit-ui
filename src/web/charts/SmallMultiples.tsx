// Small multiples grid + a minimal Sparkline for one series per panel.
import type { ReactNode } from "react";
import { extent, linePath, linearScale } from "./scales";
import { useMeasure } from "./useMeasure";
import { VIZ } from "./colors";

export interface Panel {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Render the panel body at the measured inner width. */
  render: (width: number) => ReactNode;
}

/** Responsive grid of equal panels; `minPanelWidth` controls how many fit per row. */
export function SmallMultiples({ panels, minPanelWidth = 200 }: { panels: Panel[]; minPanelWidth?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minPanelWidth}px, 100%), 1fr))` }}>
      {panels.map((p) => (
        <PanelBox key={p.id} panel={p} />
      ))}
    </div>
  );
}

function PanelBox({ panel }: { panel: Panel }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-sm font-medium text-ink">{panel.title}</div>
      {panel.subtitle && <div className="text-xs text-muted">{panel.subtitle}</div>}
      <div ref={ref} className="mt-2">
        {width > 0 && panel.render(width)}
      </div>
    </div>
  );
}

export interface SparklineProps {
  values: (number | null)[];
  width: number;
  height?: number;
  color?: string;
  /** Optional dashed reference (e.g. baseline). */
  reference?: number | null;
  domain?: [number, number];
  ariaLabel: string;
}

export function Sparkline({ values, width, height = 36, color = VIZ.estimate, reference, domain, ariaLabel }: SparklineProps) {
  const pad = 3;
  const xs = values.map((_, i) => i);
  const ext = domain ?? extent([...values, reference ?? null]);
  const x = linearScale([0, Math.max(1, values.length - 1)], [pad, width - pad]);
  const y = linearScale(ext, [height - pad, pad]);
  const last = [...values].reverse().find((v) => v != null);
  const lastI = values.lastIndexOf(last ?? null);
  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel}>
      {reference != null && <line x1={pad} x2={width - pad} y1={y(reference)} y2={y(reference)} style={{ stroke: VIZ.baseline }} strokeDasharray="3 3" />}
      <path d={linePath(xs.map(x), values.map((v) => (v == null ? null : y(v))))} fill="none" style={{ stroke: color }} strokeWidth={1.75} strokeLinejoin="round" />
      {last != null && <circle cx={x(lastI)} cy={y(last)} r={2.5} style={{ fill: color }} />}
    </svg>
  );
}
