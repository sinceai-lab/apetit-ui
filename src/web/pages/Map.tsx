import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CloudSun, Layers, MousePointerClick, X } from "lucide-react";
import { CROPS, type Cell, type Farm, type ParcelMin, type Prediction } from "@/shared/types";
import type { PageProps } from "./types";
import { Button, Card, EmptyState, ErrorState, LinkButton, PageHeader, Segmented, UpstreamBanner } from "../components/ui";
import { deltaColor, DeltaLegend } from "../charts";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { cropLabel, fmtDate, fmtHa, fmtNum, fmtTHa, regionLabel } from "../lib/format";
import { useRegion } from "../lib/prefs";
import { href, setQuery } from "../lib/router";
import { POLL, useApi } from "../lib/usePoll";
import { boundsOf, L, mapInk, useLeaflet } from "./map/useLeaflet";
import { CropDot, Delta, LiveNote, regionFlag, weightedDelta } from "./season/common";

type Sel = { kind: "parcel" | "farm" | "cell"; id: string } | null;
type CropFilter = "all" | (typeof CROPS)[number];

export function MapPage({ query }: PageProps) {
  const [region] = useRegion();
  const crop = ((CROPS as string[]).includes(query.get("crop") ?? "") ? query.get("crop") : "all") as CropFilter;
  const [layers, setLayers] = useState({ cells: true, predicted: true, other: false, farms: false, basemap: true });
  const [sel, setSel] = useState<Sel>(null);

  const cells = useApi((s) => api.cells(region, s), [region]);
  const preds = useApi((s) => api.predictions({ region }, s), [region], { intervalMs: POLL.predictions });
  const parcels = useApi((s) => api.parcelsMin({ region }, s), [region]);
  const farms = useApi((s) => api.farms(region, s), [region]);

  const { ref, map, renderer, dark, tilesFailed } = useLeaflet({ basemap: layers.basemap });

  const parcelById = useMemo(() => new Map((parcels.data?.parcels ?? []).map((p) => [p[0], p] as const)), [parcels.data]);
  const rows = useMemo(() => (preds.data?.predictions ?? []).filter((p) => crop === "all" || p.crop === crop), [preds.data, crop]);
  const predByParcel = useMemo(() => {
    const m = new Map<string, Prediction[]>();
    for (const p of rows) m.set(p.parcelId, [...(m.get(p.parcelId) ?? []), p]);
    return m;
  }, [rows]);
  const byCell = useMemo(() => {
    const m = new Map<string, Prediction[]>();
    for (const p of rows) m.set(p.cellId, [...(m.get(p.cellId) ?? []), p]);
    return m;
  }, [rows]);

  // Fit the view once per region when the cells arrive.
  const fitted = useRef<{ map: unknown; region: string } | null>(null);
  useEffect(() => {
    if (!map || !cells.data || (fitted.current?.map === map && fitted.current.region === region)) return;
    const b = boundsOf(cells.data.cells.map((c) => c.location), 0.05);
    if (b) map.fitBounds(b);
    fitted.current = { map, region };
  }, [map, cells.data, region]);

  useEffect(() => {
    if (!map || !layers.cells || !cells.data) return;
    const g = L.layerGroup();
    for (const c of cells.data.cells) {
      const ps = byCell.get(c.cellId);
      const d = ps ? weightedDelta(ps) : null;
      const [lon, lat] = c.location;
      L.rectangle(
        [
          [lat - 0.125, lon - 0.125],
          [lat + 0.125, lon + 0.125],
        ],
        { renderer, weight: 1, color: mapInk(dark).grid, fillColor: ps ? deltaColor(d, dark) : mapInk(dark).empty, fillOpacity: ps ? 0.42 : 0.25 },
      )
        .on("click", () => setSel({ kind: "cell", id: c.cellId }))
        .addTo(g);
    }
    g.addTo(map);
    return () => {
      g.remove();
    };
  }, [map, renderer, layers.cells, cells.data, byCell, dark]);

  useEffect(() => {
    if (!map || !layers.other || !parcels.data) return;
    const g = L.layerGroup();
    for (const p of parcels.data.parcels) {
      if (predByParcel.has(p[0])) continue;
      L.circleMarker([p[5], p[4]], { renderer, radius: 2, weight: 0, fillOpacity: 0.55, fillColor: mapInk(dark).other })
        .on("click", () => setSel({ kind: "parcel", id: p[0] }))
        .addTo(g);
    }
    g.addTo(map);
    return () => {
      g.remove();
    };
  }, [map, renderer, layers.other, parcels.data, predByParcel, dark]);

  useEffect(() => {
    if (!map || !layers.predicted || !parcelById.size) return;
    const g = L.layerGroup();
    for (const [pid, ps] of predByParcel) {
      const loc = parcelById.get(pid);
      if (!loc) continue;
      const d = ps[0]!.deltaPct;
      L.circleMarker([loc[5], loc[4]], { renderer, radius: 4.5, weight: 1, color: mapInk(dark).surface, fillOpacity: 0.95, fillColor: deltaColor(d, dark) })
        .on("click", () => setSel({ kind: "parcel", id: pid }))
        .addTo(g);
    }
    g.addTo(map);
    return () => {
      g.remove();
    };
  }, [map, renderer, layers.predicted, predByParcel, parcelById, dark]);

  useEffect(() => {
    if (!map || !layers.farms || !farms.data) return;
    const g = L.layerGroup();
    for (const f of farms.data.farms) {
      const [lon, lat] = f.location;
      L.circleMarker([lat, lon], { renderer, radius: 6, weight: 2.5, color: mapInk(dark).brand, fillColor: mapInk(dark).surface, fillOpacity: 1 })
        .on("click", () => setSel({ kind: "farm", id: f.farmId }))
        .addTo(g);
    }
    g.addTo(map);
    return () => {
      g.remove();
    };
  }, [map, renderer, layers.farms, farms.data, dark]);

  const errs = [cells, preds, parcels].find((s) => s.error && !s.data)?.error;
  const loading = [cells, preds, parcels].some((s) => !s.data && !s.error);
  const toggle = (k: keyof typeof layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Map"
        subtitle={`Contract parcels coloured by estimated yield vs usual, on the 0.25° weather grid. ${regionLabel(region)}.`}
        actions={
          <Segmented
            size="sm"
            ariaLabel="Crop"
            value={crop}
            onChange={(c) => setQuery({ crop: c === "all" ? null : c })}
            options={[{ value: "all" as CropFilter, label: "All crops" }, ...CROPS.map((c) => ({ value: c as CropFilter, label: <><CropDot crop={c} />{cropLabel(c)}</> }))]}
          />
        }
      />
      {preds.data && <UpstreamBanner errors={preds.data.errors} stale={preds.data.stale} />}
      {errs && <ErrorState error={errs} onRetry={() => [cells, preds, parcels].forEach((s) => s.refresh())} />}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="relative isolate overflow-hidden">
          <div ref={ref} className="h-[62dvh] min-h-[380px] w-full" role="region" aria-label="Map of farms, parcels and weather cells" />
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex flex-wrap justify-end gap-1.5">
            {loading && <span className="pointer-events-auto rounded-card border border-border bg-surface px-3 py-1 text-xs text-muted">Loading map data…</span>}
            {tilesFailed && layers.basemap && <span className="pointer-events-auto rounded-card bg-rapeseed-soft px-3 py-1 text-xs text-ink">Basemap unavailable, data still shown</span>}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            {sel ? (
              <SelectionPanel sel={sel} onClose={() => setSel(null)} parcel={sel.kind === "parcel" ? parcelById.get(sel.id) : undefined} preds={preds.data?.predictions ?? []} cells={cells.data?.cells ?? []} farms={farms.data?.farms ?? []} />
            ) : (
              <div className="flex items-start gap-2 text-sm text-muted">
                <MousePointerClick className="mt-0.5 size-4 shrink-0 text-brand-vivid" aria-hidden />
                <div>
                  <div className="font-medium text-ink">Click a parcel, farm or grid square</div>
                  <div className="tnum mt-0.5">
                    {fmtNum(predByParcel.size)} contract parcels with estimates{crop !== "all" ? ` (${cropLabel(crop).toLowerCase()})` : ""}.
                  </div>
                  {preds.data && <LiveNote className="mt-2" asOfDate={preds.data.asOfDate} />}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-heading">
              <Layers className="size-4 text-brand-vivid" aria-hidden />
              Layers
            </h2>
            <div className="flex flex-col gap-1.5 text-sm">
              <LayerToggle on={layers.predicted} onClick={() => toggle("predicted")} swatch={<span className="size-3 rounded-full" style={{ background: deltaColor(-12, dark), boxShadow: `6px 0 0 ${deltaColor(12, dark)}` }} />}>
                Contract parcels with estimates
              </LayerToggle>
              <LayerToggle on={layers.cells} onClick={() => toggle("cells")} swatch={<span className="size-3 rounded-[2px] border border-border" style={{ background: deltaColor(8, dark), opacity: 0.6 }} />}>
                Weather grid (average of its parcels)
              </LayerToggle>
              <LayerToggle on={layers.other} onClick={() => toggle("other")} swatch={<span className="size-2 rounded-full bg-muted" />}>
                Other parcels {parcels.data ? `(${fmtNum(parcels.data.parcels.length - predByParcel.size)})` : ""}
              </LayerToggle>
              <LayerToggle on={layers.farms} onClick={() => toggle("farms")} swatch={<span className="size-3 rounded-full border-[2.5px] border-brand bg-surface" />}>
                Farms {farms.data ? `(${fmtNum(farms.data.farms.length)})` : ""}
              </LayerToggle>
              <LayerToggle on={layers.basemap} onClick={() => toggle("basemap")} swatch={<span className="size-3 rounded-[2px] bg-surface-2" />}>
                Basemap
              </LayerToggle>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1 text-xs text-muted">Estimate vs usual yield</div>
              <DeltaLegend />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LayerToggle({ on, onClick, swatch, children }: { on: boolean; onClick: () => void; swatch: ReactNode; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-2", on ? "text-ink" : "text-muted")}>
      <span aria-hidden className={cn("inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-brand" : "bg-border")}>
        <span className={cn("size-3 rounded-full bg-surface transition-transform", on && "translate-x-3")} />
      </span>
      <span className="inline-flex w-5 justify-center">{swatch}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function SelectionPanel({ sel, onClose, parcel, preds, cells, farms }: { sel: NonNullable<Sel>; onClose: () => void; parcel?: ParcelMin; preds: Prediction[]; cells: Cell[]; farms: Farm[] }) {
  const header = (title: string, sub: string) => (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <div className="eyebrow">{sub}</div>
        <h2 className="text-xl font-bold text-heading">{title}</h2>
      </div>
      <Button variant="ghost" aria-label="Clear selection" onClick={onClose}>
        <X className="size-4" />
      </Button>
    </div>
  );

  if (sel.kind === "parcel") {
    const ps = preds.filter((p) => p.parcelId === sel.id);
    const farmId = parcel?.[1] ?? sel.id.split("-P")[0]!;
    return (
      <div>
        {header(sel.id, "Parcel")}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Farm</dt>
          <dd>
            <a className="link" href={href(`/farm/${farmId}`)}>
              {farmId}
            </a>
          </dd>
          <dt className="text-muted">Area</dt>
          <dd className="tnum">{fmtHa(parcel?.[3])}</dd>
          <dt className="text-muted">Rotation plan</dt>
          <dd>{parcel ? cropLabel(parcel[2]) : "–"}</dd>
        </dl>
        {ps.length ? (
          ps.map((p) => (
            <div key={p.crop} className="mt-3 rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <CropDot crop={p.crop} />
                  {cropLabel(p.crop)} contract
                </span>
                <Delta value={p.deltaPct} />
              </div>
              <div className="tnum mt-1 text-sm">
                <b className="text-lg font-semibold">{fmtTHa(p.yieldTHa)}</b> <span className="text-muted">vs usual {fmtTHa(p.baselineTHa)}</span>
              </div>
              <LiveNote className="mt-1" asOfDate={p.asOfDate} observed={p.observedDays} total={p.totalDays} filledAhead={p.filledFutureDays} />
            </div>
          ))
        ) : (
          <p className="mt-3 text-xs text-muted">No Apetit contract crop on this parcel this season, so there is no yield estimate.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton variant="primary" href={href(`/farm/${farmId}`)}>
            Farm detail <ArrowRight className="size-4" aria-hidden />
          </LinkButton>
          {ps[0] && (
            <LinkButton href={href(`/weather/${ps[0].cellId}`)}>
              <CloudSun className="size-4" aria-hidden /> Weather {ps[0].cellId}
            </LinkButton>
          )}
        </div>
      </div>
    );
  }

  if (sel.kind === "farm") {
    const f = farms.find((x) => x.farmId === sel.id);
    const ps = preds.filter((p) => p.farmId === sel.id);
    return (
      <div>
        {header(sel.id, "Farm")}
        {f && (
          <p className="text-sm text-muted">
            {regionFlag(f.region)} · {f.segment}
            {f.organic ? " · organic" : ""}
          </p>
        )}
        {f?.contractCrops.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {f.contractCrops.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-xs">
                <CropDot crop={c} className="size-2" />
                {cropLabel(c)}
              </span>
            ))}
          </div>
        ) : null}
        {ps.length > 0 ? (
          <div className="mt-3 flex items-baseline gap-2 text-sm">
            <span className="tnum">{fmtNum(ps.length)} contract parcels · {fmtHa(ps.reduce((s, p) => s + p.areaHa, 0))}</span>
            <Delta value={weightedDelta(ps)} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">No live estimates for this farm.</p>
        )}
        <LinkButton variant="primary" className="mt-3" href={href(`/farm/${sel.id}`)}>
          Farm detail <ArrowRight className="size-4" aria-hidden />
        </LinkButton>
      </div>
    );
  }

  const c = cells.find((x) => x.cellId === sel.id);
  const ps = preds.filter((p) => p.cellId === sel.id);
  const farmsIn = new Set(ps.map((p) => p.farmId));
  return (
    <div>
      {header(sel.id, "Weather grid cell")}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Elevation</dt>
        <dd className="tnum">{c ? `${fmtNum(c.elevationM)} m` : "–"}</dd>
        <dt className="text-muted">Contract parcels</dt>
        <dd className="tnum">{fmtNum(ps.length)}</dd>
        <dt className="text-muted">Farms</dt>
        <dd className="tnum">{fmtNum(farmsIn.size)}</dd>
        <dt className="text-muted">vs usual</dt>
        <dd>{ps.length ? <Delta value={weightedDelta(ps)} /> : "–"}</dd>
      </dl>
      {ps[0] && <p className="mt-2 text-xs text-muted">Data as of {fmtDate(ps[0].asOfDate)}</p>}
      {!ps.length && <EmptyState className="mt-3" title="No contract parcels in this square" />}
      <LinkButton variant="primary" className="mt-3" href={href(`/weather/${sel.id}`)}>
        <CloudSun className="size-4" aria-hidden /> Weather for {sel.id}
      </LinkButton>
    </div>
  );
}
