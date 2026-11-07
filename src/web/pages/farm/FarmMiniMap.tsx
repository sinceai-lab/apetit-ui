// Small map of one farm: its parcels (contract ones coloured by Δ), the farm point and its weather cell.
import { useEffect } from "react";
import type { Cell, Farm, Parcel, Prediction } from "@/shared/types";
import { deltaColor } from "../../charts";
import { boundsOf, L, useLeaflet } from "../map/useLeaflet";

export function FarmMiniMap({ farm, parcels, preds, cell }: { farm: Farm; parcels: Parcel[]; preds: Prediction[]; cell: Cell | null }) {
  const { ref, map, renderer, dark, tilesFailed } = useLeaflet();

  useEffect(() => {
    if (!map) return;
    const byParcel = new Map(preds.map((p) => [p.parcelId, p]));
    const g = L.layerGroup();
    if (cell) {
      const [lon, lat] = cell.location;
      L.rectangle(
        [
          [lat - 0.125, lon - 0.125],
          [lat + 0.125, lon + 0.125],
        ],
        { renderer, weight: 1, dashArray: "4 3", color: dark ? "#8C8678" : "#8C8678", fillOpacity: 0.04, interactive: false },
      ).addTo(g);
    }
    for (const p of parcels) {
      const pr = byParcel.get(p.parcelId);
      const [lon, lat] = p.location;
      const m = pr
        ? L.circleMarker([lat, lon], { renderer, radius: 6, weight: 1.5, color: dark ? "#121510" : "#FFFFFF", fillOpacity: 0.95, fillColor: deltaColor(pr.deltaPct, dark) })
        : L.circleMarker([lat, lon], { renderer, radius: 3.5, weight: 0, fillOpacity: 0.7, fillColor: dark ? "#8A8678" : "#9C9684" });
      m.bindTooltip(`${p.parcelId}${pr ? ` · ${pr.crop}` : ` · ${p.crop} (no contract)`}`).addTo(g);
    }
    const [flon, flat] = farm.location;
    L.circleMarker([flat, flon], { renderer, radius: 7, weight: 3, color: dark ? "#8CC08A" : "#2F5D31", fillColor: dark ? "#1A1F17" : "#FFFFFF", fillOpacity: 1 })
      .bindTooltip(`Farm ${farm.farmId}`)
      .addTo(g);
    g.addTo(map);
    const b = boundsOf([farm.location, ...parcels.map((p) => p.location)], 0.25);
    if (b) map.fitBounds(b, { maxZoom: 14 });
    return () => {
      g.remove();
    };
  }, [map, renderer, dark, farm, parcels, preds, cell]);

  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-border">
      <div ref={ref} className="h-64 w-full" role="region" aria-label={`Map of farm ${farm.farmId} and its parcels`} />
      {tilesFailed && <span className="absolute right-2 top-2 z-[500] rounded-full bg-rapeseed-soft px-2.5 py-0.5 text-xs">Basemap unavailable</span>}
    </div>
  );
}
