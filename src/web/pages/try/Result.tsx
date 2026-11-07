// One what-if result: three stats, fair check, out-of-range warning, "Why this number", notes, weather table.
import { Plus } from "lucide-react";
import type { WhatIfBody, WhatIfResponse } from "@/shared/insights";
import { Button, Panel, Stat } from "../../components/ui";
import { BarChart, TableToggle } from "../../charts";
import { cropLabel, fmtFixed, fmtNum, fmtTHa } from "../../lib/format";
import { useIsDark } from "../../lib/prefs";
import { Delta } from "../season/common";
import { BasisChip, Expander, Notice, pct, StaleNotice } from "./common";
import { featureLabel, IRRIGATION_SHORT, parcelShort, soilLabel, WEATHER_SHORT } from "./labels";

const fmtVal = (v: number, field = "") => (field === "year" || field.endsWith("_doy") ? String(v) : Math.abs(v) >= 100 ? fmtNum(v) : fmtFixed(v, 2));

export function WhatIfResult({ data, body, stale, onPin, pinned }: { data: WhatIfResponse; body: WhatIfBody; stale: boolean; onPin?: () => void; pinned?: boolean }) {
  const dark = useIsDark();
  const p = data.prediction;
  const oor = p.outOfTrainingRange ?? [];
  const drivers = (data.drivers ?? []).filter((d) => Math.abs(d.effect) >= 0.001);
  const up = dark ? "var(--viz-above-1)" : "var(--viz-above-2)";
  const down = dark ? "var(--viz-below-1)" : "var(--viz-below-2)";
  const fc = data.fairCheck;
  const title = `${parcelShort(p.parcelId)} on farm ${p.farmId} · ${cropLabel(p.crop)} · ${WEATHER_SHORT[body.weather]} ${p.year}`;

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title={title}
        subtitle={data.basis?.label ?? "What-if with the final trained model"}
        actions={
          onPin && (
            <Button variant="outline" onClick={onPin} disabled={pinned} className="text-xs">
              <Plus className="size-3.5" aria-hidden />
              {pinned ? "In comparison" : "Add to comparison"}
            </Button>
          )
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <BasisChip basis={data.basis ?? { kind: "model", label: "", modelVersion: p.modelVersion, sources: [], staleVsModel: false }} whatIf />
          <span className="text-xs text-muted">
            {IRRIGATION_SHORT[body.irrigation]}
            {data.parcel ? ` · ${soilLabel(data.parcel.soil)} · ${fmtFixed(data.parcel.areaHa, 1)} ha` : ""} · not a forecast, not live
          </span>
        </div>
        <StaleNotice basis={data.basis} className="mb-3" />
        {stale && <Notice className="mb-3">The pickers have changed since this run. Press Run to update the result.</Notice>}

        <div className="grid gap-5 sm:grid-cols-3">
          <Stat
            label="Our model"
            value={fmtFixed(p.yieldTHa, 2)}
            unit="t/ha"
            delta={data.vsBaseline != null ? <Delta value={data.vsBaseline * 100} /> : undefined}
            foot={fc ? "This field, using the final model, which trained on this season" : "Against the baseline"}
            source={`${p.modelName} · model ${p.modelVersion.slice(0, 8)} · technology year ${p.technologyYear}`}
          />
          <Stat label="Baseline: farm average" value={fmtFixed(p.baselineTHa, 2)} unit="t/ha" foot="The same for any weather" />
          <Stat
            label="Actual for this farm"
            value={fc?.actualTHa != null ? fmtFixed(fc.actualTHa, 2) : "Not available"}
            unit={fc?.actualTHa != null ? "t/ha" : undefined}
            foot={fc?.actualTHa != null ? "Whole farm" : (data.actualNote ?? "Future season, or the farm didn't report")}
          />
        </div>
        {fc?.text && <Notice className="mt-4">{fc.text}</Notice>}
        {oor.length > 0 && (
          <Notice tone="warn" className="mt-4">
            <div className="font-medium">Some of this season's weather is outside what the model saw in training.</div>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {oor.map((o) => (
                <li key={o.field}>
                  {featureLabel(o.field)}: <span className="tnum">{fmtVal(o.value, o.field)}</span> (training range <span className="tnum">{fmtVal(o.trainingMin, o.field)}–{fmtVal(o.trainingMax, o.field)}</span>)
                </li>
              ))}
            </ul>
            <div className="mt-1 text-xs text-muted">Read the number as a rough guide: the model is stretching beyond its data here.</div>
          </Notice>
        )}
      </Panel>

      {data.degraded ? (
        <Notice>The inference service didn't send the drivers for this run, so "Why this number" is hidden. Update the inference service to see them.</Notice>
      ) : (
        <Panel title="Why this number" subtitle={data.baseTHa != null ? `Starting from ${fmtTHa(data.baseTHa)} for an average field and season.` : undefined}>
          <TableToggle
            table={{
              columns: [
                { key: "d", header: "Driver", render: (r) => r.driver },
                { key: "e", header: "Effect on yield", align: "right", render: (r) => pct(r.effect), sortValue: (r) => r.effect },
              ],
              rows: data.drivers ?? [],
              rowKey: (r) => r.driver,
            }}
          >
            {drivers.length ? (
              <BarChart
                ariaLabel="Effect of each driver on the modelled yield"
                data={drivers.map((d) => ({ key: d.driver, label: d.driver, value: d.effect * 100, color: d.effect >= 0 ? up : down }))}
                format={(v) => `${v > 0 ? "+" : ""}${fmtFixed(v, 1)} %`}
                rowHeight={26}
              />
            ) : (
              <p className="text-sm text-muted">No driver moves the result by 0.1 % or more.</p>
            )}
          </TableToggle>
          {data.driversNote && <p className="mt-3 text-xs text-muted">{data.driversNote}</p>}
        </Panel>
      )}

      {(data.notes?.length || data.weatherTable?.length) && (
        <Panel title="Good to know">
          {data.notes?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {data.notes.map((n) => (
                <li key={n.code}>{n.text}</li>
              ))}
            </ul>
          ) : null}
          {data.weatherTable?.length ? (
            <Expander title="Weather values used" className="mt-3">
              <table className="w-full text-sm">
                <tbody>
                  {data.weatherTable.map((w) => (
                    <tr key={w.measure} className="border-t border-border first:border-t-0">
                      <td className="py-1.5 pr-3">{w.measure}</td>
                      <td className="tnum py-1.5 text-right">{w.value == null ? "–" : fmtNum(w.value, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Expander>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
