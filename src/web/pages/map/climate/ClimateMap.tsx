// Map climate layer (contract §10.3, Map additions): farms coloured by 2041–2060 yield change, side panel, contact table, soils.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, MousePointerClick } from "lucide-react";
import type { Crop, Region } from "@/shared/types";
import { STORIES, type ClimateFarm, type Story } from "@/shared/insights";
import { Async, Card, EmptyState, ErrorState, Panel, Segmented, Table } from "../../../components/ui";
import { BarChart, TableToggle } from "../../../charts";
import { useClimateFarms, useInsightsOptions, useSoilEffects } from "../../../lib/insights";
import { cropLabel, fmtFixed, fmtHa, fmtNum, fmtShare, regionLabel } from "../../../lib/format";
import { useRegion } from "../../../lib/prefs";
import { href, navigate, setQuery } from "../../../lib/router";
import { L, mapInk, useLeaflet } from "../useLeaflet";
import { BasisChip, pct, pickRegion, RegionPicker, StaleNotice, storyColor } from "../../try/common";
import { BandLegend, bandsOf, farmChange } from "./scale";
import { ClimateSidePanel, type ClimateSel } from "./SidePanel";

const STORY_LABEL: Record<Story, string> = { below_2c: "Below 2 °C", current_policies: "Hothouse" };

export function ClimateMap({ query, layerSwitch }: { query: URLSearchParams; layerSwitch: ReactNode }) {
  const [global] = useRegion();
  const region: Region = pickRegion(global, query.get("region"));
  const story: Story = (STORIES as string[]).includes(query.get("story") ?? "") ? (query.get("story") as Story) : "current_policies";
  const opts = useInsightsOptions({ region });
  const crops = opts.data?.regions.find((r) => r.code === region)?.crops ?? [];
  const crop: Crop | null = crops.includes(query.get("crop") as Crop) ? (query.get("crop") as Crop) : (crops[0] ?? null);
  const farms = useClimateFarms(crop ? region : null, crop);
  const soils = useSoilEffects(crop ? region : null, crop);
  const [sel, setSel] = useState<ClimateSel>(null);
  useEffect(() => setSel(null), [region, crop]);

  const { ref, map, renderer, dark, tilesFailed } = useLeaflet();
  const data = farms.data;
  const bands = useMemo(() => bandsOf(data?.bands.edges ?? []), [data]);

  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !data?.farms.length) return;
    const k = `${region}-${crop}`;
    if (fitted.current === k) return;
    map.fitBounds(L.latLngBounds(data.farms.map((f) => [f.lat, f.lon] as [number, number])).pad(0.15));
    fitted.current = k;
  }, [map, data, region, crop]);

  useEffect(() => {
    if (!map || !data) return;
    const g = L.layerGroup();
    for (const f of data.farms) {
      const on = sel?.kind === "farm" && sel.id === f.farmId;
      L.circleMarker([f.lat, f.lon], { renderer, radius: Math.max(5, Math.min(18, Math.sqrt(f.areaHa) * 1.2)), weight: on ? 3 : 1, color: on ? mapInk(dark).brand : mapInk(dark).surface, fillColor: storyColor(farmChange(f, story), dark), fillOpacity: 0.92 })
        .bindTooltip(`${f.farmId} · ${pct(farmChange(f, story))} · ${fmtHa(f.areaHa)}`)
        .on("click", () => setSel({ kind: "farm", id: f.farmId }))
        .addTo(g);
    }
    g.addTo(map);
    return () => {
      g.remove();
    };
  }, [map, renderer, data, story, dark, sel]);

  const byId = useMemo(() => new Map((data?.farms ?? []).map((f) => [f.farmId, f] as const)), [data]);
  const contact = (data?.labelled ?? []).map((id) => byId.get(id)).filter((f): f is ClimateFarm => !!f);
  const err = (opts.error && !opts.data) || farms.error ? (farms.error ?? opts.error) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-title text-2xl font-semibold text-heading sm:text-[32px] sm:leading-tight">Map</h1>
          <p className="mt-1.5 max-w-3xl text-[15px] text-muted">Climate outlook 2041–2060: farms coloured by the model's estimated yield change against 1991–2020. {regionLabel(region)}.</p>
        </div>
        {layerSwitch}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RegionPicker global={global} value={region} onChange={(r) => setQuery({ region: r, crop: null })} />
        <Segmented size="sm" ariaLabel="Crop" value={crop ?? ""} onChange={(c) => setQuery({ crop: c })} options={crops.map((c) => ({ value: c, label: cropLabel(c) }))} />
        <Segmented size="sm" ariaLabel="Climate story" value={story} onChange={(s) => setQuery({ story: s })} options={STORIES.map((s) => ({ value: s, label: STORY_LABEL[s], title: opts.data?.stories.find((x) => x.code === s)?.blurb }))} />
        {data && <BasisChip basis={data.basis} />}
      </div>
      <StaleNotice basis={data?.basis} />
      {err && <ErrorState error={err} onRetry={() => [opts, farms].forEach((s) => s.refresh())} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Card className="relative isolate overflow-hidden">
            <div ref={ref} className="h-[56dvh] min-h-[360px] w-full" role="region" aria-label="Map of farms coloured by estimated climate yield change" />
            <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex flex-wrap justify-end gap-1.5">
              {farms.loading && !data && <span className="rounded-card border border-border bg-surface px-3 py-1 text-xs text-muted">Loading farms…</span>}
              {data && !data.farms.length && <span className="rounded-card border border-border bg-surface px-3 py-1 text-xs text-muted">No farms grow this crop here</span>}
              {tilesFailed && <span className="rounded-card bg-rapeseed-soft px-3 py-1 text-xs text-ink">Basemap unavailable, data still shown</span>}
            </div>
          </Card>
          {data?.note && <p className="text-xs text-muted">{data.note}</p>}
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-degraded" aria-hidden />
            Farm positions are synthetic, so don't read anything into exact locations. The live in-season layer is hidden here, so live estimates and scenario results never share a map.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-4">
            {crop ? (
              <ClimateSidePanel sel={sel} setSel={setSel} region={region} crop={crop} story={story} />
            ) : (
              <div className="flex items-start gap-2 text-sm text-muted">
                <MousePointerClick className="mt-0.5 size-4 shrink-0 text-brand-vivid" aria-hidden />
                Pick a crop to see the climate outlook.
              </div>
            )}
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold text-heading">Estimated yield change, 2041–2060 against 1991–2020</div>
            {data ? <BandLegend bands={bands} farms={data.farms} story={story} dark={dark} /> : <p className="text-xs text-muted">Loading…</p>}
            <p className="mt-2 text-xs text-muted">Circle size follows farm area for this crop. {STORY_LABEL[story]} story.</p>
          </Card>
        </div>
      </div>

      <Panel title="Farms to contact first" subtitle={data?.orderNote} actions={data && <BasisChip basis={data.basis} />}>
        {data ? (
          <Table
            rows={contact}
            rowKey={(f) => f.farmId}
            onRowClick={(f) => setSel({ kind: "farm", id: f.farmId })}
            empty={<EmptyState title="No farms to list for this crop" />}
            columns={[
              { key: "f", header: "Farm", render: (f) => <a className="link" href={href(`/farm/${f.farmId}`)} onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/farm/${f.farmId}`); }}>{f.farmId}</a> },
              { key: "n", header: "Fields", align: "right", render: (f) => fmtNum(f.nFields) },
              { key: "a", header: "Area", align: "right", render: (f) => fmtHa(f.areaHa) },
              { key: "d", header: "On sand or fine sand (ha)", align: "right", render: (f) => fmtFixed(f.dryHa, 1) },
              { key: "s", header: "Share", align: "right", render: (f) => fmtShare(f.dryShare) },
              { key: "p", header: "Planned 2027–2028 on sand or fine sand (ha)", align: "right", render: (f) => fmtFixed(f.plannedDryHa, 1) },
              { key: "c", header: "Yield change", align: "right", render: (f) => pct(farmChange(f, story)) },
            ]}
          />
        ) : farms.error ? null : (
          <p className="text-sm text-muted">Loading…</p>
        )}
        <p className="mt-2 text-xs text-muted">Click a row to see the farm's story in the side panel.</p>
      </Panel>

      <Panel title="Yield change by soil" subtitle={soils.data?.note} actions={soils.data && <BasisChip basis={soils.data.basis} />}>
        <Async state={soils} empty={(d) => !d.soils.length}>
          {(d) => (
            <TableToggle
              table={{
                columns: [
                  { key: "s", header: "Soil", render: (r) => r.label },
                  { key: "n", header: "Fields", align: "right", render: (r) => fmtNum(r.nFields) },
                  { key: "a", header: "Area", align: "right", render: (r) => fmtHa(r.areaHa) },
                  { key: "b", header: "Change, Below 2 °C", align: "right", render: (r) => pct(r.changeBelow2c) },
                  { key: "h", header: "Change, Hothouse", align: "right", render: (r) => pct(r.changeCurrentPolicies) },
                  { key: "t", header: "Drought stress today", align: "right", render: (r) => fmtFixed(r.stressToday, 2) },
                  { key: "f", header: `Drought stress, ${STORY_LABEL[story]}`, align: "right", render: (r) => fmtFixed(story === "below_2c" ? r.stressBelow2c : r.stressCurrentPolicies, 2) },
                ],
                rows: d.soils,
                rowKey: (r) => r.soil,
              }}
            >
              <BarChart
                ariaLabel={`Estimated yield change by soil, ${STORY_LABEL[story]}`}
                data={d.soils.map((s) => {
                  const v = story === "below_2c" ? s.changeBelow2c : s.changeCurrentPolicies;
                  return { key: s.soil, label: `${s.label}${s.droughty ? " *" : ""}`, value: v == null ? null : v * 100, color: storyColor(v, dark), detail: [{ label: "fields", value: fmtNum(s.nFields) }, { label: "area", value: fmtHa(s.areaHa) }] };
                })}
                format={(v) => `${v > 0 ? "+" : ""}${fmtFixed(v, 1)} %`}
              />
              <p className="mt-1 text-xs text-muted">* Soils we assume hold the least water. {STORY_LABEL[story]} story, 2041–2060 against 1991–2020.</p>
            </TableToggle>
          )}
        </Async>
      </Panel>
    </div>
  );
}
