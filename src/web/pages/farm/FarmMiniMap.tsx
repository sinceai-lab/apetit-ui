// Small map of one farm: its parcels (contract ones coloured by Δ), the farm point and its weather cell.
import { useEffect } from "react";
import { Map as MapIcon, Satellite } from "lucide-react";
import type { Cell, Farm, Parcel, Prediction } from "@/shared/types";
import { deltaColor } from "../../charts";
import { Segmented } from "../../components/ui";
import { boundsOf, L, mapInk, useLeaflet, type BasemapStyle } from "../map/useLeaflet";
import { useMapStyle } from "../../lib/prefs";

export function FarmMiniMap({ farm, parcels, preds, cell }: { farm: Farm; parcels: Parcel[]; preds: Prediction[]; cell: Cell | null }) {
  const [style, setStyle] = useMapStyle();
  const sat = style === "satellite";
  const { ref, map, renderer, dark, tilesFailed } = useLeaflet({ style });

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
        { renderer, weight: 1, dashArray: "4 3", color: sat ? "#ffffff" : mapInk(dark).cell, fillOpacity: 0.04, interactive: false },
      ).addTo(g);
    }
    for (const p of parcels) {
      const pr = byParcel.get(p.parcelId);
      const [lon, lat] = p.location;
      const m = pr
        ? L.circleMarker([lat, lon], { renderer, radius: 6, weight: 1.5, color: mapInk(dark).surface, fillOpacity: 0.95, fillColor: deltaColor(pr.deltaPct, dark) })
        : L.circleMarker([lat, lon], { renderer, radius: 3.5, weight: 0, fillOpacity: 0.7, fillColor: mapInk(dark).other });
      m.bindTooltip(`${p.parcelId}${pr ? ` · ${pr.crop}` : ` · ${p.crop} (no contract)`}`).addTo(g);
    }
    const [flon, flat] = farm.location;
    L.circleMarker([flat, flon], { renderer, radius: 7, weight: 3, color: mapInk(dark).brand, fillColor: mapInk(dark).surface, fillOpacity: 1 })
      .bindTooltip(`Farm ${farm.farmId}`)
      .addTo(g);
    g.addTo(map);
    return () => {
      g.remove();
    };
  }, [map, renderer, dark, sat, farm, parcels, preds, cell]);

  // Fit to the farm only when the farm or its parcels change, so switching basemap or theme keeps the user's zoom.
  useEffect(() => {
    if (!map) return;
    const b = boundsOf([farm.location, ...parcels.map((p) => p.location)], 0.25);
    if (b) map.fitBounds(b, { maxZoom: 14 });
  }, [map, farm, parcels]);

  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-border">
      <div ref={ref} className="h-64 w-full" role="region" aria-label={`Map of farm ${farm.farmId} and its parcels`} />
      {/* Same Map / Satellite switch as the main Map page. Top-right: the attribution wraps to two lines at phone width
          and would run under it at the bottom; the zoom buttons hold the top-left. */}
      <div className="absolute right-2 top-2 z-[500]">
        <Segmented
          size="sm"
          ariaLabel="Basemap"
          value={style}
          onChange={setStyle}
          className="shadow-md"
          options={[
            { value: "map" as BasemapStyle, label: <><MapIcon className="size-3.5" aria-hidden />Map</> },
            { value: "satellite" as BasemapStyle, label: <><Satellite className="size-3.5" aria-hidden />Satellite</> },
          ]}
        />
      </div>
      {tilesFailed && <span className="absolute right-2 top-12 z-[500] rounded-card bg-rapeseed-soft px-2.5 py-0.5 text-xs text-ink">Basemap unavailable</span>}
    </div>
  );
}
