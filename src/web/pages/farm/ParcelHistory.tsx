// Prediction-history sparkline for one parcel (from /api/live/history), with the usual yield dashed.
import { Sparkline } from "../../charts";
import { api } from "../../lib/api";
import { fmtDayMonth, fmtTHa } from "../../lib/format";
import { useApi } from "../../lib/usePoll";

export function ParcelHistory({ parcelId }: { parcelId: string }) {
  const h = useApi((s) => api.history(parcelId, s), [parcelId]);
  if (h.error) return <span className="text-xs text-muted" title={h.error.message}>unavailable</span>;
  if (!h.data) return <span aria-hidden className="inline-block h-6 w-24 animate-pulse rounded bg-surface-2" />;
  const pts = h.data.points;
  if (pts.length < 2) return <span className="text-xs text-muted">{pts.length} update</span>;
  const title = pts.map((p) => `${fmtDayMonth(p.asOfDate)}: ${fmtTHa(p.yieldTHa)}`).join("\n");
  return (
    <span className="inline-flex items-center gap-1.5" title={`Estimate over the season (data dates)\n${title}`}>
      <Sparkline values={pts.map((p) => p.yieldTHa)} reference={pts[pts.length - 1]!.baselineTHa} width={88} height={26} ariaLabel={`Estimate history for ${parcelId}: ${title.replace(/\n/g, ", ")}`} />
      <span className="tnum text-[11px] text-muted">{pts.length}×</span>
    </span>
  );
}
