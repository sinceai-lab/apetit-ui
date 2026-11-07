// "This season (live)" vs "Climate outlook 2041–2060": the two never share a map.
import type { PageProps } from "../../types";
import { Segmented } from "../../../components/ui";
import { setQuery } from "../../../lib/router";
import { ClimateMap } from "./ClimateMap";

export type MapLayer = "live" | "climate";
export const mapLayer = (q: URLSearchParams): MapLayer => (q.get("layer") === "climate" ? "climate" : "live");

export function MapLayerSwitch({ value }: { value: MapLayer }) {
  return (
    <Segmented
      ariaLabel="Map layer"
      value={value}
      onChange={(v) => setQuery({ layer: v === "live" ? null : v, story: null, crop: null })}
      options={[
        { value: "live", label: "This season (live)" },
        { value: "climate", label: "Climate 2041–2060", title: "Climate outlook 2041–2060 (scenario results)" },
      ]}
    />
  );
}

export function ClimateMapPage({ query }: PageProps) {
  return <ClimateMap query={query} layerSwitch={<MapLayerSwitch value="climate" />} />;
}
