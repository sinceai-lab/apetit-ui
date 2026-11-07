// Region-wide yield change and drought stress by soil (/api/insights/soil-effects).
import type { Crop, Region } from "@/shared/types";
import { Badge, EmptyState } from "../../components/ui";
import { TableToggle } from "../../charts";
import { useSoilEffects } from "../../lib/insights";
import { cropLabel, fmtFixed, fmtHa, fmtNum } from "../../lib/format";
import { StoryBars } from "./charts";
import { InsightAsync, InsightPanel, fmtChange, regionName, tickChange, useStories } from "./kit";

export function SoilEffects({ region, crop, title }: { region: Region; crop: Crop; title?: string }) {
  const s = useSoilEffects(region, crop);
  const story = useStories();
  const label = (k: "below_2c" | "current_policies") => story(k).label;
  return (
    <InsightPanel title={title ?? `How soil changes the picture, ${regionName(region)}`} basis={s.data?.basis ?? null} subtitle={`Region-wide ${cropLabel(crop).toLowerCase()} yield change by soil, 2041–2060 against 1991–2020`}>
      <InsightAsync state={s}>
        {(d) =>
          !d.soils.length ? (
            <EmptyState title="No soil breakdown for this crop" />
          ) : (
            <div className="flex flex-col gap-3">
              <TableToggle
                table={{
                  rows: d.soils,
                  rowKey: (r) => r.soil,
                  columns: [
                    { key: "s", header: "Soil", render: (r) => <span className="inline-flex items-center gap-1.5">{r.label}{r.droughty && <Badge tone="rapeseed">Holds least water</Badge>}</span> },
                    { key: "n", header: "Fields", align: "right", render: (r) => fmtNum(r.nFields), sortValue: (r) => r.nFields },
                    { key: "a", header: "Area", align: "right", render: (r) => fmtHa(r.areaHa), sortValue: (r) => r.areaHa },
                    { key: "b", header: `Change, ${label("below_2c")}`, align: "right", render: (r) => fmtChange(r.changeBelow2c), sortValue: (r) => r.changeBelow2c },
                    { key: "c", header: `Change, ${label("current_policies")}`, align: "right", render: (r) => fmtChange(r.changeCurrentPolicies), sortValue: (r) => r.changeCurrentPolicies },
                    { key: "st", header: "Drought stress today (0–1)", align: "right", render: (r) => fmtFixed(r.stressToday, 2) },
                    { key: "sb", header: `Stress, ${label("below_2c")}`, align: "right", render: (r) => fmtFixed(r.stressBelow2c, 2) },
                    { key: "sc", header: `Stress, ${label("current_policies")}`, align: "right", render: (r) => fmtFixed(r.stressCurrentPolicies, 2) },
                  ],
                }}
              >
                <StoryBars
                  ariaLabel="Yield change by soil"
                  format={(v) => fmtChange(v)}
                  axisFormat={tickChange}
                  storyLabel={label}
                  rows={d.soils.map((r) => ({ key: r.soil, label: r.droughty ? `${r.label} (holds least water)` : r.label, values: { below_2c: r.changeBelow2c, current_policies: r.changeCurrentPolicies } }))}
                />
              </TableToggle>
              <p className="text-xs text-muted">{d.note}</p>
            </div>
          )
        }
      </InsightAsync>
    </InsightPanel>
  );
}
