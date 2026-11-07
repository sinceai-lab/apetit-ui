// Farm detail without an id: search all farms by id, crop or segment.
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { RegionFilter } from "@/shared/types";
import { Async, PageHeader, Panel, Segmented, Table } from "../../components/ui";
import { api } from "../../lib/api";
import { cropLabel, regionShort } from "../../lib/format";
import { navigate } from "../../lib/router";
import { useApi } from "../../lib/usePoll";
import { CropDot } from "../season/common";

export function FarmFinder() {
  const [region, setRegion] = useState<RegionFilter>("both");
  const [q, setQ] = useState("");
  const farms = useApi((s) => api.farms("both", s), []);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (farms.data?.farms ?? []).filter(
      (f) => (region === "both" || f.region === region) && (!t || f.farmId.toLowerCase().includes(t) || f.segment.includes(t) || f.contractCrops.some((c) => c.includes(t) || cropLabel(c).toLowerCase().includes(t))),
    );
  }, [farms.data, q, region]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Find a farm" subtitle="Pick a farm to see its contract facts, parcels, live yield estimates and local weather." />
      <Panel
        title="All farms"
        actions={
          <Segmented
            size="sm"
            ariaLabel="Region"
            value={region}
            onChange={setRegion}
            options={[
              { value: "FI_SW", label: "Finland" },
              { value: "SE_SKANE", label: "Sweden" },
              { value: "both", label: "Both" },
            ]}
          />
        }
      >
        <label className="field mb-3 flex items-center gap-2 px-3 py-2 focus-within:border-focus focus-within:shadow-[0_0_0_0.2rem_var(--focus-ring)]">
          <Search className="size-4 text-muted" aria-hidden />
          <span className="sr-only">Search farms</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Farm id (F0001, S0381) or crop (pea, carrot)…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" autoFocus />
        </label>
        <Async state={farms}>
          {() => (
            <Table
              dense
              rows={list}
              rowKey={(f) => f.farmId}
              maxHeight={560}
              onRowClick={(f) => navigate(`/farm/${f.farmId}`)}
              initialSort={{ key: "id", dir: "asc" }}
              empty={<p className="py-6 text-center text-sm text-muted">No farm matches “{q}”.</p>}
              columns={[
                { key: "id", header: "Farm", render: (f) => <span className="font-medium text-brand">{f.farmId}</span>, sortValue: (f) => f.farmId },
                { key: "r", header: "Region", render: (f) => regionShort(f.region), sortValue: (f) => f.region },
                { key: "seg", header: "Segment", render: (f) => f.segment, sortValue: (f) => f.segment },
                {
                  key: "crops",
                  header: "Contract crops",
                  render: (f) =>
                    f.contractCrops.length ? (
                      <span className="inline-flex flex-wrap gap-x-2">
                        {f.contractCrops.map((c) => (
                          <span key={c} className="inline-flex items-center gap-1">
                            <CropDot crop={c} className="size-2" />
                            {cropLabel(c)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">not recorded</span>
                    ),
                },
                { key: "org", header: "Organic", render: (f) => (f.organic ? "yes" : "no"), sortValue: (f) => (f.organic ? 1 : 0) },
              ]}
            />
          )}
        </Async>
      </Panel>
    </div>
  );
}
