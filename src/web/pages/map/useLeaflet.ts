// Leaflet map bound to a div: canvas renderer, Esri grey light/dark basemap that follows the theme, or Esri satellite imagery.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useIsDark } from "../../lib/prefs";

// Esri grey canvas: keyless (CARTO tiles now render an "API key required" watermark).
const TILE = (dark: boolean) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? "Dark" : "Light"}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
const ATTR = 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
// Esri World Imagery: keyless satellite/aerial photos.
const SAT_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTR = 'Imagery &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export type BasemapStyle = "map" | "satellite";

export function useLeaflet(opts: { basemap?: boolean; interactive?: boolean; style?: BasemapStyle } = {}) {
  const { basemap = true, interactive = true, style = "map" } = opts;
  const ref = useRef<HTMLDivElement | null>(null);
  const [inst, setInst] = useState<{ map: L.Map; renderer: L.Canvas } | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const dark = useIsDark();

  useEffect(() => {
    if (!ref.current) return;
    const renderer = L.canvas({ padding: 0.3, tolerance: 4 });
    const m = L.map(ref.current, {
      preferCanvas: true,
      renderer,
      zoomControl: interactive,
      scrollWheelZoom: interactive,
      dragging: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
      attributionControl: true,
      center: [61, 22.6],
      zoom: 8,
    });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(ref.current);
    setInst({ map: m, renderer });
    return () => {
      ro.disconnect();
      setInst(null);
      m.remove();
    };
  }, [interactive]);
  const map = inst?.map ?? null;
  const renderer = inst?.renderer ?? null;

  useEffect(() => {
    if (!map || !basemap) return;
    let errors = 0;
    const sat = style === "satellite";
    const layer = L.tileLayer(sat ? SAT_TILE : TILE(dark), { attribution: sat ? SAT_ATTR : ATTR, maxNativeZoom: sat ? 18 : 16, maxZoom: 18, crossOrigin: true });
    layer.on("tileerror", () => {
      if (++errors >= 4) setTilesFailed(true);
    });
    layer.on("tileload", () => setTilesFailed(false));
    layer.addTo(map);
    layer.bringToBack();
    return () => {
      layer.remove();
    };
  }, [map, dark, basemap, style]);

  return { ref, map, renderer: renderer!, dark, tilesFailed };
}

/** Bounds of a set of [lon, lat] points, padded a little. */
export function boundsOf(points: [number, number][], pad = 0.1): L.LatLngBounds | null {
  if (!points.length) return null;
  return L.latLngBounds(points.map(([lon, lat]) => [lat, lon] as [number, number])).pad(pad);
}

/** Leaflet canvas can't read CSS vars, so these mirror the styles.css tokens (light, dark). */
export const mapInk = (dark: boolean) =>
  dark
    ? { grid: "#4d584b", cell: "#9daa9b", empty: "#212821", other: "#9daa9b", surface: "#1a201a", brand: "#7fbf7f" }
    : { grid: "#a9b5a5", cell: "#6b7a6b", empty: "#f4f6f2", other: "#6b7a6b", surface: "#ffffff", brand: "#3f7d3f" };

export { L };
