import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { handleApi, matchRoute } from "../src/server/routes";
import { camelDeep, clearWhatIfCache, INSIGHT_SPECS, parseWhatIf, WhatIfGuard, whatIfGuard } from "../src/server/insights";
import { cache } from "../src/server/cache";
import { config } from "../src/server/config";

// A fake inference service: records every call and answers by path.
const calls: { method: string; path: string; query: string; body: string }[] = [];
let mode: "ok" | "old" | "broken" = "ok";
let fake: ReturnType<typeof Bun.serve>;
const realUrl = config.inferenceUrl;

beforeAll(() => {
  fake = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url);
      const body = req.method === "POST" ? await req.text() : "";
      if (u.pathname === "/insights/meta") return Response.json({ model_version: "abc123def456", files: [{ file: "a.csv", generated_at: "2026-11-07T13:26:59Z" }] });
      calls.push({ method: req.method, path: u.pathname, query: u.search, body });
      if (u.pathname === "/insights/advice" && u.searchParams.get("crop") === "carrot") return Response.json({ detail: "No climate results for carrot in SE_SKANE." }, { status: 404 });
      if (mode === "broken" && u.pathname === "/insights/outlook") return Response.json({ detail: [{ loc: ["query", "crop"], msg: "bad" }] }, { status: 422 });
      if (mode === "broken" && u.pathname === "/insights/euro-risk") return Response.json({ detail: "outputs/C3_euro_risk.csv is missing.", file: "C3_euro_risk.csv" }, { status: 503 });
      if (u.pathname === "/insights/what-if") {
        if (mode === "old") return Response.json({ detail: "Not Found" }, { status: 404 });
        return Response.json({ prediction: { yield_t_ha: 3.6, effects: { "Drought stress": -0.04 }, weather: { sow_doy: 121 } }, base_t_ha: 3.3, notes: [{ code: "x", template: "{bad_years}", values: { bad_years: [0.1, ".0%"] }, text: "10%" }] });
      }
      if (u.pathname === "/predict/field") return Response.json({ yield_t_ha: 3.6, baseline_t_ha: 3.2 });
      return Response.json({ path: u.pathname, some_key: { nested_key: 1 }, change_below_2c: -0.01, basis: { kind: "batch", model_version: "abc123def456", stale_vs_model: false } });
    },
  });
  config.inferenceUrl = `http://127.0.0.1:${fake.port}`;
});
afterAll(() => {
  config.inferenceUrl = realUrl;
  fake.stop(true);
});
beforeEach(() => {
  calls.length = 0;
  mode = "ok";
  cache.clear();
  clearWhatIfCache();
  whatIfGuard.reset();
});

const get = (p: string) => handleApi(new Request(`http://x${p}`));
const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  handleApi(new Request("http://x/api/insights/what-if", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }));
const good = { parcelId: "F0001-P03", crop: "pea", weather: "history", year: 2018, irrigation: "usual" };

const VALID: Record<string, string> = {
  "/api/insights/meta": "",
  "/api/insights/options": "?region=SE_SKANE&crop=pea&farm=S0381",
  "/api/insights/advice": "?region=FI_SW&crop=turnip_rape&story=current_policies",
  "/api/insights/policy": "",
  "/api/insights/outlook": "?region=FI_SW&crop=pea",
  "/api/insights/climate-risk": "?scenario=ssp585",
  "/api/insights/euro-risk": "",
  "/api/insights/farms": "?region=FI_SW&crop=pea",
  "/api/insights/soil-effects": "?region=FI_SW&crop=pea",
  "/api/insights/farms/:farmId": "?crop=pea&story=below_2c",
  "/api/insights/fields/:parcelId": "?crop=pea&story=below_2c",
  "/api/insights/trust": "?test=loyo",
  "/api/insights/trust/seasons": "?region=FI_SW&crop=pea&test=forward&farm=F0003",
  "/api/insights/trust/live-replay": "?test=loyo&scope=FI_SW/pea",
  "/api/insights/trust/corrections": "",
};
const concrete = (pattern: string) => pattern.replace(":farmId", "F0028").replace(":parcelId", "F0028-P18");

describe("insights allowlist", () => {
  test("every contract route resolves for its method only", () => {
    expect(INSIGHT_SPECS.map((s) => s.pattern).sort()).toEqual(Object.keys(VALID).sort());
    for (const p of Object.keys(VALID)) {
      const m = matchRoute("GET", concrete(p));
      expect("route" in m && m.route.pattern, p).toBe(p);
      expect(matchRoute("POST", concrete(p)), p).toMatchObject({ status: 405, allow: ["GET"] });
      expect(matchRoute("DELETE", concrete(p)), p).toMatchObject({ status: 405 });
    }
    expect(matchRoute("POST", "/api/insights/what-if")).toMatchObject({ route: { pattern: "/api/insights/what-if" } });
    expect(matchRoute("GET", "/api/insights/what-if")).toMatchObject({ status: 405, allow: ["POST"] });
    for (const p of ["/api/insights", "/api/insights/raw", "/api/insights/farms/F0028/fields", "/api/insights/trust/x", "/api/predict/field"]) expect(matchRoute("GET", p), p).toMatchObject({ status: 404 });
  });

  test("rejects unknown, repeated, missing and malformed params with 400 and no upstream call", async () => {
    const bad = [
      "/api/insights/meta?x=1",
      "/api/insights/policy?region=FI_SW",
      "/api/insights/options?crop=pea",
      "/api/insights/options?farm_id=F0001",
      "/api/insights/options?region=XX",
      "/api/insights/advice?region=FI_SW&crop=pea",
      "/api/insights/advice?region=FI_SW&crop=pea&story=ssp585",
      "/api/insights/advice?region=both&crop=pea&story=below_2c",
      "/api/insights/advice?region=FI_SW&region=SE_SKANE&crop=pea&story=below_2c",
      "/api/insights/outlook?region=FI_SW&crop=Pea",
      "/api/insights/climate-risk",
      "/api/insights/climate-risk?scenario=ssp245",
      "/api/insights/farms?region=FI_SW&crop=pea&limit=5",
      "/api/insights/farms/F0028%2F..%2Fmeta?crop=pea&story=below_2c",
      "/api/insights/farms/X0028?crop=pea&story=below_2c",
      "/api/insights/fields/F0028-P18;drop?crop=pea&story=below_2c",
      "/api/insights/fields/F0028-P18?crop=pea",
      "/api/insights/trust?test=all",
      "/api/insights/trust/seasons?region=FI_SW&crop=pea&test=loyo&farm=F1",
      "/api/insights/trust/live-replay?test=loyo&scope=../meta",
      "/api/insights/trust/corrections?rows=1",
    ];
    for (const p of bad) {
      const r = await get(p);
      expect(r.status, p).toBe(400);
      expect(typeof (await r.json()).error, p).toBe("string");
    }
    expect(calls).toEqual([]);
  });

  test("valid requests reach the matching upstream path with mapped params, camelCased", async () => {
    for (const [p, q] of Object.entries(VALID)) {
      const r = await get(concrete(p) + q);
      expect(r.status, p).toBe(200);
      const b = await r.json();
      expect(typeof b.fetchedAt, p).toBe("string");
    }
    const byPath = Object.fromEntries(calls.map((c) => [c.path, c.query]));
    expect(byPath["/insights/options"]).toBe("?crop=pea&farm_id=S0381&region=SE_SKANE");
    expect(byPath["/insights/farms/F0028"]).toBe("?crop=pea&story=below_2c");
    expect(byPath["/insights/fields/F0028-P18"]).toBe("?crop=pea&story=below_2c");
    expect(byPath["/insights/trust/seasons"]).toBe("?crop=pea&farm_id=F0003&region=FI_SW&test=forward");
    expect(byPath["/insights/trust/live-replay"]).toBe("?scope=FI_SW%2Fpea&test=loyo");
    const b = await (await get("/api/insights/policy")).json();
    expect(b).toMatchObject({ someKey: { nestedKey: 1 }, changeBelow2c: -0.01, basis: { kind: "batch", modelVersion: "abc123def456", staleVsModel: false }, cached: true });
  });

  test("upstream errors: 404 stays 404, 422 becomes 400, 503 stays 503, unreachable is 503", async () => {
    mode = "broken";
    const r404 = await get("/api/insights/advice?region=SE_SKANE&crop=carrot&story=below_2c");
    expect(r404.status).toBe(404);
    expect((await r404.json()).error).toContain("No climate results");
    const r422 = await get("/api/insights/outlook?region=FI_SW&crop=pea");
    expect(r422.status).toBe(400);
    expect((await r422.json()).error).toContain("crop: bad");
    const r503 = await get("/api/insights/euro-risk");
    expect(r503.status).toBe(503);
    expect(await r503.json()).toMatchObject({ upstream: "inference" });
    config.inferenceUrl = "http://127.0.0.1:9";
    try {
      const down = await get("/api/insights/trust?test=loyo");
      expect(down.status).toBe(503);
      expect(await down.json()).toMatchObject({ error: "inference unreachable", upstream: "inference" });
    } finally {
      config.inferenceUrl = `http://127.0.0.1:${fake.port}`;
    }
  });

  test("camelDeep keeps data keys (labels, feature codes, template slots)", () => {
    expect(camelDeep({ yield_t_ha: 1, values: { bad_years: 1 }, effects: { "This farm": 1 }, weather: { sow_doy: 1 }, rows: [{ c1_self_check: 1, FI_SW: 2 }] })).toEqual({
      yieldTHa: 1,
      values: { bad_years: 1 },
      effects: { "This farm": 1 },
      weather: { sow_doy: 1 },
      rows: [{ c1SelfCheck: 1, FI_SW: 2 }],
    });
  });
});

describe("POST /api/insights/what-if", () => {
  test("maps plain codes to the model's codes", () => {
    expect(parseWhatIf(good)).toEqual({ parcel_id: "F0001-P03", crop: "pea", scenario: "historical", year: 2018, irrigation: null });
    expect(parseWhatIf({ ...good, parcelId: "S0381-P01", weather: "high", year: 2050, irrigation: "rainfed" })).toMatchObject({ scenario: "ssp585", irrigation: 0 });
    expect(parseWhatIf({ ...good, parcelId: "S0381-P01", weather: "c1", year: 2027, irrigation: "irrigated" })).toMatchObject({ scenario: "ssp245", irrigation: 1 });
    expect(parseWhatIf({ ...good, weather: "middle", year: 2041 })).toMatchObject({ scenario: "ssp245" });
    expect(parseWhatIf({ ...good, weather: "low", year: 2060 })).toMatchObject({ scenario: "ssp126" });
  });

  test("rejects bad bodies before any upstream call", async () => {
    const bad: unknown[] = [
      { ...good, scenario: "ssp585" },
      { ...good, irrigation: undefined },
      { ...good, parcelId: "F0001" },
      { ...good, crop: "wheat" },
      { ...good, weather: "historical" },
      { ...good, weather: "constructor" },
      { ...good, year: 2030 },
      { ...good, year: 2018.5 },
      { ...good, year: "2018" },
      { ...good, weather: "high", year: 2030 },
      { ...good, irrigation: "irrigated" },
      { ...good, irrigation: 1 },
      [good],
      "null",
      "{not json",
    ];
    for (const b of bad) {
      const r = await post(b);
      expect(r.status, JSON.stringify(b)).toBe(400);
    }
    expect((await (await post({ ...good, extra: 1 })).json()).error).toBe("unknown key: extra");
    expect((await (await post({ ...good, irrigation: "rainfed" })).json()).error).toContain("Swedish");
    expect((await post({ ...good, pad: "x".repeat(2100) })).status).toBe(413);
    expect((await post(good, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post(good, {})).status).toBe(415);
    expect(calls).toEqual([]);
  });

  test("forwards the mapped body, camelCases the reply and caches identical bodies", async () => {
    const r = await post(good);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b).toMatchObject({ prediction: { yieldTHa: 3.6, effects: { "Drought stress": -0.04 }, weather: { sow_doy: 121 } }, baseTHa: 3.3 });
    expect(b.notes[0].values).toEqual({ bad_years: [0.1, ".0%"] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/insights/what-if" });
    expect(JSON.parse(calls[0]!.body)).toEqual({ parcel_id: "F0001-P03", crop: "pea", scenario: "historical", year: 2018, irrigation: null });
    expect((await (await post(good)).json()).cached).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("falls back to /predict/field when the upstream has no /insights/what-if", async () => {
    mode = "old";
    const b = await (await post(good)).json();
    expect(b).toMatchObject({ prediction: { yieldTHa: 3.6, baselineTHa: 3.2 }, degraded: "drivers unavailable" });
    expect(b.drivers).toBeUndefined();
    expect(calls.map((c) => c.path)).toEqual(["/insights/what-if", "/predict/field"]);
  });

  test("guard: 429 with retry-after on the 21st run in a minute", async () => {
    for (let i = 0; i < 20; i++) expect((await post(good)).status, `run ${i + 1}`).toBe(200);
    const r = await post(good);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await r.json()).error).toBe("Too many what-if runs. Wait a moment and try again.");
  });

  test("guard: token bucket refills, and at most 2 upstream calls run at once", async () => {
    let t = 0;
    const g = new WhatIfGuard(20, 2, () => t);
    for (let i = 0; i < 20; i++) expect(g.take("a")).toBe(0);
    expect(g.take("a")).toBeGreaterThan(0);
    expect(g.take("b")).toBe(0);
    t += 3000;
    expect(g.take("a")).toBe(0);
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const a = g.run(() => hold);
    const b = g.run(() => hold);
    await expect(g.run(async () => 1)).rejects.toMatchObject({ status: 429 });
    release();
    await Promise.all([a, b]);
    expect(await g.run(async () => 1)).toBe(1);
  });
});

describe("camelCase round trip on samples from the running service", () => {
  test("keys the pages read exist after camelCasing", async () => {
    const { sample } = await import("./fixtures");
    const advice = camelDeep(await sample("insights-advice.json")) as any;
    expect(Object.keys(advice.stories[0])).toEqual(expect.arrayContaining(["yieldChange", "badYearChance", "addedImportCostEurYr"]));
    expect(Object.keys(advice.themes[0])).toEqual(expect.arrayContaining(["below2c", "currentPolicies"]));
    expect(advice.basis).toMatchObject({ kind: "batch", staleVsModel: false });
    expect(advice.actions[0].values).toEqual(expect.any(Object));
    const farm = camelDeep(await sample("insights-farms-F0028.json")) as any;
    expect(Object.keys(farm.fields[0])).toEqual(expect.arrayContaining(["parcelId", "yieldTodayTHa", "soilChangeCurrentPolicies"]));
    const trust = camelDeep(await sample("insights-trust.json")) as any;
    expect(trust.c1SelfCheck).toHaveProperty("maxDiffTHa");
    const euro = camelDeep(await sample("insights-euro-risk.json")) as any;
    expect(euro.totals.map((t: any) => t.region)).toEqual(["FI_SW", "SE_SKANE"]);
    const w = camelDeep(await sample("insights-what-if.json")) as any;
    expect(Object.keys(w.prediction.weather)).toContain("sow_doy");
    expect(Object.keys(w.prediction.effects)).toContain("This farm");
    expect(w).toHaveProperty("baseTHa");
  });
});
