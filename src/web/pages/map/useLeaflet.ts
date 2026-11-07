// Leaflet map bound to a div: canvas renderer, Esri grey light/dark basemap that follows the theme.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useIsDark } from "../../lib/prefs";

// Esri grey canvas: keyless (CARTO tiles now render an "API key required" watermark).
const TILE = (dark: boolean) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? "Dark" : "Light"}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
const ATTR = 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

export function useLeaflet(opts: { basemap?: boolean; interactive?: boolean } = {}) {
  const { basemap = true, interactive = true } = opts;
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
    const layer = L.tileLayer(TILE(dark), { attribution: ATTR, maxNativeZoom: 16, maxZoom: 18, crossOrigin: true });
    layer.on("tileerror", () => {
      if (++errors >= 4) setTilesFailed(true);
    });
    layer.on("tileload", () => setTilesFailed(false));
    layer.addTo(map);
    layer.bringToBack();
    return () => {
      layer.remove();
    };
  }, [map, dark, basemap]);

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
    ? { grid: "#50555a", cell: "#a4a9ad", empty: "#232523", other: "#a4a9ad", surface: "#1b1c1b", brand: "#7cc443" }
    : { grid: "#adb5bd", cell: "#5c636a", empty: "#f8f9fa", other: "#5c636a", surface: "#ffffff", brand: "#467b1e" };

export { L };
