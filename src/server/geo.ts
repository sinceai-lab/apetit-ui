// Real Finnish field-parcel shapes from the Finnish Food Authority (Ruokavirasto) open INSPIRE WFS
// (GSAA agricultural parcels, i.e. "kasvulohkot"). Read-only, keyless, CC BY 4.0.
// Requests are snapped to fixed tiles so the cache is shared between viewers and pans.
import { TtlCache } from "./cache";
import { HttpError, json } from "./http";

const WFS = "https://inspire.ruokavirasto-awsa.com/geoserver/wfs";
export const FIELD_YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;
export const FIELD_YEAR_DEFAULT = 2025;
/** Tile size in degrees (lat × lon). About 5.5 km × 5.4 km at 61° N. */
export const TILE_LAT = 0.05;
export const TILE_LON = 0.1;
/** Finland's bounding box; tiles outside it are refused. */
const FI = { w: 19, s: 59.5, e: 31.6, n: 70.1 };
const MAX_FEATURES = 6000;

const geoCache = new TtlCache(3000);
const DAY = 24 * 60 * 60_000;

type Ring = [number, number][];
interface WfsFeature {
  id?: string;
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] } | null;
  properties: Record<string, unknown>;
}

const round = (r: Ring): Ring => r.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);

async function loadTile(year: number, x: number, y: number) {
  const s = y * TILE_LAT;
  const w = x * TILE_LON;
  const n = s + TILE_LAT;
  const e = w + TILE_LON;
  if (n < FI.s || s > FI.n || e < FI.w || w > FI.e) return { type: "FeatureCollection" as const, features: [], truncated: false };
  const q = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: `inspire:LandUse.ExistingLandUse.GSAAAgriculturalParcel.${year}`,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: String(MAX_FEATURES),
    // WFS 2.0 with EPSG:4326 uses lat,lon axis order.
    bbox: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`,
  });
  let res: Response;
  try {
    res = await fetch(`${WFS}?${q}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new HttpError(503, `field register ${(err as Error)?.name === "TimeoutError" ? "timed out" : "unreachable"}`);
  }
  if (!res.ok) throw new HttpError(502, `field register answered ${res.status}`);
  const body = (await res.json()) as { features?: WfsFeature[] };
  const src = body.features ?? [];
  const features = src.flatMap((f) => {
    if (!f.geometry) return [];
    const p = f.properties;
    const geometry =
      f.geometry.type === "Polygon"
        ? { type: "Polygon" as const, coordinates: f.geometry.coordinates.map(round) }
        : { type: "MultiPolygon" as const, coordinates: f.geometry.coordinates.map((poly) => poly.map(round)) };
    return [
      {
        type: "Feature" as const,
        id: String(f.id ?? p.TUNNUS ?? ""),
        geometry,
        properties: {
          block: (p.PERUSLOHKOTUNNUS as string | undefined) ?? null,
          areaHa: typeof p.PINTA_ALA === "number" ? p.PINTA_ALA : null,
          cropCode: (p.KASVIKOODI as string | undefined) ?? null,
          cropFi: (p.KASVIKOODI_SELITE_FI as string | undefined) ?? null,
          cropSv: (p.KASVIKOODI_SELITE_SV as string | undefined) ?? null,
          organic: p.LUOMUVILJELY === 1,
        },
      },
    ];
  });
  return { type: "FeatureCollection" as const, features, truncated: src.length >= MAX_FEATURES };
}

/** GET /api/geo/fields?tile=x,y[&year=2025]: x = floor(lon / 0.1), y = floor(lat / 0.05). */
export async function getFieldTile(url: URL): Promise<Response> {
  const t = url.searchParams.get("tile") ?? "";
  const m = /^(-?\d{1,4}),(-?\d{1,4})$/.exec(t);
  if (!m) throw new HttpError(400, "invalid tile (x,y)");
  const year = Number(url.searchParams.get("year") ?? FIELD_YEAR_DEFAULT);
  if (!(FIELD_YEARS as readonly number[]).includes(year)) throw new HttpError(400, `invalid year (${FIELD_YEARS.join(" | ")})`);
  const x = Number(m[1]);
  const y = Number(m[2]);
  const c = await geoCache.get(`fields:${year}:${x}:${y}`, DAY, () => loadTile(year, x, y));
  return json({ fetchedAt: c.fetchedAt, cached: c.cached || undefined, year, tile: [x, y], ...c.value }, 200, { "cache-control": "public, max-age=3600" });
}
