// Real field-parcel outlines (Finland) drawn from /api/geo/fields tiles once the map is zoomed in far enough.
// The contract parcels are synthetic points: a real field is coloured when a contract parcel point falls inside it.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { getJson } from "../../lib/api";
import { L } from "./useLeaflet";

export const FIELD_MIN_ZOOM = 13;
const TILE_LAT = 0.05;
const TILE_LON = 0.1;
const MAX_TILES = 16;

export interface FieldProps {
  block: string | null;
  areaHa: number | null;
  cropCode: string | null;
  cropFi: string | null;
  cropSv: string | null;
  organic: boolean;
}
type FieldFeature = Feature<Polygon | MultiPolygon, FieldProps>;
interface TileResponse extends FeatureCollection<Polygon | MultiPolygon, FieldProps> {
  truncated?: boolean;
}

/** A contract parcel point to match against real fields: [lon, lat, parcelId, fill colour]. */
export type ParcelPoint = [number, number, string, string];

const tileCache = new Map<string, Promise<TileResponse>>();
function fetchTile(year: number, x: number, y: number): Promise<TileResponse> {
  const k = `${year}:${x}:${y}`;
  let p = tileCache.get(k);
  if (!p) {
    p = getJson<TileResponse>("/api/geo/fields", { tile: `${x},${y}`, year });
    p.catch(() => tileCache.delete(k));
    tileCache.set(k, p);
  }
  return p;
}

function inRing(lon: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > lat !== yj! > lat && lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}
function inPolygon(lon: number, lat: number, rings: number[][][]) {
  if (!rings.length || !inRing(lon, lat, rings[0]!)) return false;
  for (let h = 1; h < rings.length; h++) if (inRing(lon, lat, rings[h]!)) return false;
  return true;
}
function contains(f: FieldFeature, lon: number, lat: number) {
  const g = f.geometry;
  return g.type === "Polygon" ? inPolygon(lon, lat, g.coordinates) : g.coordinates.some((p) => inPolygon(lon, lat, p));
}

export interface FieldShapeState {
  /** Map zoom is at or past FIELD_MIN_ZOOM. */
  zoomedIn: boolean;
  loading: boolean;
  failed: boolean;
  /** Fields drawn in the current view. */
  shown: number;
  /** Real fields that contain a contract parcel. */
  matched: number;
}

export function useFieldShapes(opts: {
  map: L.Map | null;
  renderer: L.Canvas | null;
  enabled: boolean;
  year?: number;
  points: ParcelPoint[];
  satellite: boolean;
  dark: boolean;
  onParcel: (parcelId: string) => void;
}): FieldShapeState {
  const { map, renderer, enabled, year = 2025, points, satellite, dark } = opts;
  const onParcel = useRef(opts.onParcel);
  onParcel.current = opts.onParcel;
  const [view, setView] = useState<{ zoom: number; tiles: [number, number][] } | null>(null);
  const [tiles, setTiles] = useState<Map<string, TileResponse>>(new Map());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Track the visible tiles.
  useEffect(() => {
    if (!map) return;
    const update = () => {
      const zoom = map.getZoom();
      const b = map.getBounds();
      const out: [number, number][] = [];
      if (zoom >= FIELD_MIN_ZOOM) {
        for (let x = Math.floor(b.getWest() / TILE_LON); x <= Math.floor(b.getEast() / TILE_LON); x++)
          for (let y = Math.floor(b.getSouth() / TILE_LAT); y <= Math.floor(b.getNorth() / TILE_LAT); y++) out.push([x, y]);
      }
      setView({ zoom, tiles: out.slice(0, MAX_TILES) });
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [map]);

  const tileKey = view?.tiles.map(([x, y]) => `${x},${y}`).join(";") ?? "";

  // Fetch them (cached per session).
  useEffect(() => {
    if (!enabled || !view?.tiles.length) return;
    let live = true;
    setLoading(true);
    setFailed(false);
    Promise.allSettled(view.tiles.map(([x, y]) => fetchTile(year, x, y).then((t) => [`${x},${y}`, t] as const))).then((rs) => {
      if (!live) return;
      const m = new Map<string, TileResponse>();
      for (const r of rs) if (r.status === "fulfilled") m.set(r.value[0], r.value[1]);
      setTiles(m);
      setFailed(rs.some((r) => r.status === "rejected"));
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [enabled, tileKey, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // Match contract parcel points to the field that contains them.
  const matches = useMemo(() => {
    const m = new Map<FieldFeature, ParcelPoint>();
    if (!enabled) return m;
    for (const t of tiles.values())
      for (const f of t.features as FieldFeature[]) {
        const [w, s, e, n] = bbox(f);
        for (const p of points) if (p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n && contains(f, p[0], p[1])) {
          m.set(f, p);
          break;
        }
      }
    return m;
  }, [tiles, points, enabled]);

  // Draw.
  const zoomedIn = (view?.zoom ?? 0) >= FIELD_MIN_ZOOM;
  useEffect(() => {
    if (!map || !renderer || !enabled || !zoomedIn) return;
    const g = L.layerGroup();
    const edge = satellite ? "rgb(255 255 255 / 0.85)" : dark ? "#9daa9b" : "#5f6e5f";
    for (const t of tiles.values()) {
      L.geoJSON(t as never, {
        renderer,
        style: (f) => {
          const hit = matches.get(f as FieldFeature);
          return hit
            ? { weight: 1.5, color: satellite ? "#ffffff" : dark ? "#121612" : "#ffffff", fillColor: hit[3], fillOpacity: 0.85 }
            : { weight: 1, color: edge, opacity: satellite ? 0.9 : 0.75, fillColor: satellite ? "#ffffff" : edge, fillOpacity: satellite ? 0.06 : 0.08 };
        },
        onEachFeature: (f, layer) => {
          const hit = matches.get(f as FieldFeature);
          if (hit) layer.on("click", () => onParcel.current(hit[2]));
          else layer.bindPopup(() => fieldPopup(f.properties as FieldProps), { maxWidth: 260 });
        },
      } as L.GeoJSONOptions).addTo(g);
    }
    g.addTo(map);
    // Fields sit under the parcel dots and the grid.
    g.eachLayer((l) => (l as L.GeoJSON).bringToBack());
    return () => {
      g.remove();
    };
  }, [map, renderer, enabled, zoomedIn, tiles, matches, satellite, dark]);

  let shown = 0;
  if (zoomedIn) for (const t of tiles.values()) shown += t.features.length;
  return { zoomedIn, loading: enabled && zoomedIn && loading, failed: enabled && zoomedIn && failed, shown, matched: zoomedIn ? matches.size : 0 };
}

const bboxCache = new WeakMap<object, [number, number, number, number]>();
function bbox(f: FieldFeature): [number, number, number, number] {
  let b = bboxCache.get(f);
  if (b) return b;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const rings = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]!] : f.geometry.coordinates.map((p) => p[0]!);
  for (const r of rings)
    for (const [x, y] of r) {
      if (x! < w) w = x!;
      if (x! > e) e = x!;
      if (y! < s) s = y!;
      if (y! > n) n = y!;
    }
  b = [w, s, e, n];
  bboxCache.set(f, b);
  return b;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function fieldPopup(p: FieldProps): string {
  const crop = [p.cropFi, p.cropSv].filter(Boolean).join(" / ") || "Crop not given";
  return `<div style="font: 13px/1.45 var(--font-sans)">
    <div style="font-weight:700;color:var(--heading)">${esc(crop)}</div>
    <div style="color:var(--muted)">${p.areaHa != null ? `${p.areaHa.toLocaleString("en-GB")} ha` : ""}${p.organic ? " · organic" : ""}</div>
    ${p.block ? `<div style="color:var(--muted)">Field block ${esc(p.block)}</div>` : ""}
    <div style="margin-top:4px;font-size:11px;color:var(--muted)">Real field, not an Apetit contract parcel. Source: Finnish Food Authority 2025.</div>
  </div>`;
}
