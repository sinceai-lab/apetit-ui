// Land use on one farm this season: parcel area by crop as a donut, with a legend that names every slice and its figures.
// A parcel with an Apetit contract counts as its contract crop (what the estimates use); any other parcel as its rotation plan.
// Apetit crops keep their crop hue; rotation crops (barley, wheat, oats, grass ley, fallow) are a grey ramp.
import { useState } from "react";
import type { Farm, Parcel, Prediction } from "@/shared/types";
import { Panel } from "../../components/ui";
import { DonutChart, Key, LAND_USE_ORDER, TableToggle, landUseColor, type DonutDatum } from "../../charts";
import { cn } from "../../lib/cn";
import { cropLabel, fmtHa, fmtNum, fmtShare } from "../../lib/format";
import { useIsDark } from "../../lib/prefs";

interface Row extends DonutDatum {
  parcels: number;
  share: number;
  /** Area of this crop that is under an Apetit contract. */
  contractHa: number;
}

const rank = (crop: string) => {
  const i = LAND_USE_ORDER.indexOf(crop);
  return i < 0 ? LAND_USE_ORDER.length : i;
};

/** "contract" when all of the crop's area is contracted, "4.8 ha contract" when only part of it is. */
const contractTag = (r: Row) => (r.contractHa <= 0 ? null : r.contractHa >= r.value - 1e-6 ? "contract" : `${fmtHa(r.contractHa)} contract`);

export function LandUse({ farm, parcels, preds }: { farm: Farm; parcels: Parcel[]; preds: Prediction[] }) {
  const dark = useIsDark();
  const [active, setActive] = useState<string | null>(null);

  const predBy = new Map(preds.map((p) => [p.parcelId, p]));
  const by = new Map<string, { area: number; n: number; contract: number }>();
  const add = (crop: string, area: number, contract: boolean) => {
    const a = by.get(crop) ?? { area: 0, n: 0, contract: 0 };
    a.area += area;
    a.n += 1;
    if (contract) a.contract += area;
    by.set(crop, a);
  };
  for (const p of parcels) {
    const pr = predBy.get(p.parcelId);
    add(pr?.crop ?? p.crop, p.areaHa, !!pr);
  }
  // Contract parcels the parcel list doesn't have (the Parcels table shows these too).
  const known = new Set(parcels.map((p) => p.parcelId));
  for (const pr of preds) if (!known.has(pr.parcelId)) add(pr.crop, pr.areaHa, true);

  const total = [...by.values()].reduce((s, v) => s + v.area, 0);
  const rows: Row[] = [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([crop, v]) => ({
      key: crop,
      label: cropLabel(crop),
      value: v.area,
      color: landUseColor(crop, dark),
      parcels: v.n,
      share: total ? v.area / total : 0,
      contractHa: v.contract,
    }));

  if (!rows.length || total <= 0) return null;
  const contractShare = rows.reduce((s, r) => s + r.contractHa, 0) / total;
  const nParcels = rows.reduce((s, r) => s + r.parcels, 0);

  return (
    <Panel
      title="Land use"
      subtitle={`Area by crop this season across ${fmtNum(nParcels)} parcels: the contract crop where there is one, otherwise the rotation plan. Apetit crops in colour, rotation crops in grey.`}
    >
      <TableToggle
        table={{
          caption: `Land use on farm ${farm.farmId}`,
          rows,
          rowKey: (r) => r.key,
          columns: [
            { key: "c", header: "Crop", render: (r) => <span className="inline-flex items-center gap-1.5"><Key color={r.color} />{r.label}</span> },
            { key: "n", header: "Parcels", align: "right", render: (r) => fmtNum(r.parcels), sortValue: (r) => r.parcels },
            { key: "a", header: "Area", align: "right", render: (r) => fmtHa(r.value), sortValue: (r) => r.value },
            { key: "k", header: "Under contract", align: "right", render: (r) => (r.contractHa > 0 ? fmtHa(r.contractHa) : "–"), sortValue: (r) => r.contractHa },
            { key: "s", header: "Share", align: "right", render: (r) => fmtShare(r.share, 1), sortValue: (r) => r.share },
          ],
        }}
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <DonutChart
            data={rows}
            ariaLabel={`Land use on farm ${farm.farmId}: ${rows.map((r) => `${r.label} ${fmtShare(r.share)}`).join(", ")}`}
            active={active}
            onActive={setActive}
            tooltip={(d) => {
              const r = d as Row;
              const tag = contractTag(r);
              return {
                title: r.label,
                rows: [
                  { label: "of the farm", value: fmtShare(r.share, 1), color: r.color, shape: "rect" },
                  { label: `${fmtNum(r.parcels)} parcel${r.parcels === 1 ? "" : "s"}`, value: fmtHa(r.value) },
                ],
                note: tag ? (tag === "contract" ? "All under Apetit contract" : `${fmtHa(r.contractHa)} under Apetit contract`) : undefined,
              };
            }}
            center={
              <div>
                <div className="tnum font-display text-xl font-bold leading-tight text-heading">{fmtHa(total)}</div>
                <div className="text-xs text-muted">{fmtShare(contractShare)} under contract</div>
              </div>
            }
          />
          <ul className="flex w-full min-w-0 max-w-sm flex-col gap-0.5 text-sm" onMouseLeave={() => setActive(null)}>
            {rows.map((r) => {
              const tag = contractTag(r);
              return (
                <li
                  key={r.key}
                  onMouseEnter={() => setActive(r.key)}
                  className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto_3.5rem] items-center gap-2 rounded px-2 py-1 transition-colors", active === r.key && "bg-surface-2")}
                >
                  <Key color={r.color} />
                  <span className="truncate text-ink">
                    {r.label}
                    {tag && <span className="ml-1.5 text-xs text-muted">{tag}</span>}
                  </span>
                  <span className="tnum text-muted">{fmtHa(r.value)}</span>
                  <span className="tnum text-right font-medium text-ink">{fmtShare(r.share)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </TableToggle>
    </Panel>
  );
}
