// Try the model: run the trained model for one field, crop, weather set and season (contract §10.3). Builder B.
import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import type { Crop } from "@/shared/types";
import { IRRIGATIONS, WEATHER_SETS, type Irrigation, type WeatherSet, type WhatIfBody } from "@/shared/insights";
import type { PageProps } from "./types";
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader, Skeleton } from "../components/ui";
import { useInsightsOptions, useWhatIf } from "../lib/insights";
import { cropLabel, fmtHa, regionLabel } from "../lib/format";
import { useRegion } from "../lib/prefs";
import { setQuery } from "../lib/router";
import { Notice, pickRegion, RegionPicker, Select } from "./try/common";
import { WhatIfResult } from "./try/Result";
import { ComparePanel, isFutureYear, runKey, useComparison } from "./try/Compare";
import { IRRIGATION_SHORT, parcelShort, soilLabel } from "./try/labels";

const isWeather = (w: string | null): w is WeatherSet => !!w && w in WEATHER_SETS;
const yearsOf = (w: WeatherSet) => {
  const [a, b] = WEATHER_SETS[w].years;
  return Array.from({ length: b - a + 1 }, (_, i) => b - i);
};

export function TryPage({ query }: PageProps) {
  const [global] = useRegion();
  const region = pickRegion(global, query.get("region"));
  const prefix = region === "SE_SKANE" ? "S" : "F";
  const base = useInsightsOptions({ region });
  const regionCrops = base.data?.regions.find((r) => r.code === region)?.crops ?? [];

  const qCrop = query.get("crop") as Crop | null;
  const crop: Crop | null = qCrop && regionCrops.includes(qCrop) ? qCrop : (regionCrops[0] ?? null);
  const qParcel = query.get("parcel");
  const parcelId = qParcel?.startsWith(prefix) ? qParcel : null;
  const qFarm = query.get("farm") ?? parcelId?.split("-")[0] ?? null;
  const cropOpts = useInsightsOptions({ region, crop: crop ?? undefined });
  const farms = cropOpts.data?.farms ?? [];
  const farm = qFarm && farms.includes(qFarm) ? qFarm : null;
  const farmOpts = useInsightsOptions({ region, crop: crop ?? undefined, farm: farm ?? undefined });
  const parcels = farm ? (farmOpts.data?.parcels ?? []) : [];
  const parcel = parcels.find((p) => p.parcelId === parcelId) ?? null;

  const weather: WeatherSet = isWeather(query.get("weather")) ? (query.get("weather") as WeatherSet) : "high";
  const years = yearsOf(weather);
  const qYear = Number(query.get("year"));
  const year = years.includes(qYear) ? qYear : years[0]!;
  const qIrr = query.get("irrigation") as Irrigation | null;
  const irrigation: Irrigation = region === "SE_SKANE" && qIrr && IRRIGATIONS.includes(qIrr) ? qIrr : "usual";

  // Pick the first farm and field once the lists arrive, so the page is never blank.
  useEffect(() => {
    if (!crop || !cropOpts.data || !farms.length || farm) return;
    setQuery({ farm: farms[0], parcel: null });
  }, [crop, cropOpts.data, farms, farm]);
  useEffect(() => {
    if (!farm || !farmOpts.data?.parcels?.length || parcel) return;
    setQuery({ parcel: farmOpts.data.parcels[0]!.parcelId });
  }, [farm, farmOpts.data, parcel]);

  const body: WhatIfBody | null = parcel && crop ? { parcelId: parcel.parcelId, crop, weather, year, irrigation } : null;
  const whatIf = useWhatIf();
  const cmp = useComparison();
  const bodyKey = body ? runKey(body) : null;

  // A shared link (e.g. from Farm, "Try this field") runs once on arrival; picker changes never do.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !body || !qParcel || qParcel !== body.parcelId) return;
    autoRan.current = true;
    whatIf.run(body);
  }, [body, qParcel]); // eslint-disable-line react-hooks/exhaustive-deps

  // A result belongs to the picks it was run with: once the pickers move away, clear it (and cancel a run in flight).
  const { reset, body: ranBody } = whatIf;
  useEffect(() => {
    if (ranBody && runKey(ranBody) !== bodyKey) reset();
  }, [bodyKey, ranBody, reset]);
  const current = !!(whatIf.body && bodyKey && runKey(whatIf.body) === bodyKey);
  const storyYear = isFutureYear(year) ? year : 2050;
  const irrHelp = base.data?.irrigationNote;
  const irrOptions = (base.data?.irrigation ?? IRRIGATIONS.map((c) => ({ code: c, label: IRRIGATION_SHORT[c], regions: ["SE_SKANE"] }))).filter((o) => region === "SE_SKANE" || o.code === "usual");
  const optsErr = [base, cropOpts, farmOpts].find((s) => s.error && !s.data)?.error;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Try the model"
        subtitle={`Pick a field, a crop and a season's weather. This runs the final trained model and shows why it landed on that number. ${regionLabel(region)}.`}
        actions={<RegionPicker global={global} value={region} onChange={(r) => setQuery({ region: r, crop: null, farm: null, parcel: null, irrigation: null })} />}
      />

      {optsErr && <ErrorState error={optsErr} onRetry={() => [base, cropOpts, farmOpts].forEach((s) => s.refresh())} />}

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Select<Crop>
            label="Crop"
            value={crop ?? ""}
            onChange={(c) => setQuery({ crop: c, farm: null, parcel: null })}
            options={regionCrops.map((c) => ({ value: c, label: base.data?.crops.find((x) => x.code === c)?.label ?? cropLabel(c) }))}
            disabled={!regionCrops.length}
          />
          <Select
            label={farms.length ? `Farm (${farms.length} grow it)` : "Farm"}
            value={farm ?? ""}
            onChange={(f) => setQuery({ farm: f, parcel: null })}
            options={farms.map((f) => ({ value: f, label: f }))}
            disabled={!farms.length}
          />
          <Select
            label="Field"
            value={parcel?.parcelId ?? ""}
            onChange={(p) => setQuery({ parcel: p })}
            options={parcels.map((p) => ({ value: p.parcelId, label: `${parcelShort(p.parcelId)} · ${soilLabel(p.soil)} · ${fmtHa(p.areaHa)}` }))}
            disabled={!parcels.length}
          />
          <Select<WeatherSet>
            label="Weather"
            className="col-span-2 md:col-span-1"
            value={weather}
            onChange={(w) => setQuery({ weather: w, year: yearsOf(w).includes(year) ? year : null })}
            options={(base.data?.weatherSets ?? []).map((w) => ({ value: w.code, label: w.label }))}
          />
          <Select label="Season" value={String(year)} onChange={(y) => setQuery({ year: y })} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
          <Select<Irrigation>
            label="Irrigation"
            value={irrigation}
            onChange={(i) => setQuery({ irrigation: i === "usual" ? null : i })}
            options={irrOptions.map((o) => ({ value: o.code, label: o.label }))}
            disabled={region !== "SE_SKANE"}
          />
        </div>
        {region !== "SE_SKANE" && irrHelp && <p className="mt-2 text-xs text-muted">Irrigation: {irrHelp}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary px-5 py-2 text-sm" disabled={!body || whatIf.loading} onClick={() => body && whatIf.run(body)}>
            <Play className="size-4" aria-hidden />
            {whatIf.loading ? "Running…" : "Run"}
          </button>
          <span className="text-xs text-muted">Changing a picker clears the result. Press Run when ready.</span>
        </div>
        {farmOpts.loading && farm && !parcels.length && <Loading label="Loading fields…" className="py-2" />}
        {cropOpts.data && crop && !farms.length && <EmptyState className="mt-3" title="No farm grows this crop in the model data" />}
      </Card>

      {whatIf.error && current ? (
        <ErrorState error={whatIfMessage(whatIf.error)} onRetry={body ? () => whatIf.run(body) : undefined} />
      ) : whatIf.data && whatIf.body && current ? (
        <WhatIfResult
          data={whatIf.data}
          body={whatIf.body}
          pinned={cmp.queries.some((q) => runKey(q) === runKey(whatIf.body!))}
          onPin={() => cmp.addRun({ key: runKey(whatIf.body!), body: whatIf.body!, data: whatIf.data! })}
        />
      ) : whatIf.loading ? (
        <Skeleton className="h-64" />
      ) : (
        <EmptyState title="No run yet">Choose a field and a season's weather above, then press Run.</EmptyState>
      )}

      <ComparePanel cmp={cmp} current={body} availableSets={base.data?.weatherSets ?? []} storyYear={storyYear} />

      <Notice>What-if results come from the trained model for a chosen weather set. They are scenario results, kept apart from the live in-season estimates on Overview and Live season. Finland and Sweden are separate operations.</Notice>
    </div>
  );
}

function whatIfMessage(e: { status: number; message: string }) {
  if (e.status === 404) return `No weather for this field, crop and weather set. ${e.message}`;
  if (e.status === 429) return "Too many what-if runs in a minute. Wait a moment and press Run again.";
  if (e.status === 400) return `The service didn't accept this choice: ${e.message}`;
  return e.message;
}
