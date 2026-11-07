import { describe, expect, test } from "bun:test";
import { sample, sampleText } from "./fixtures";
import { cropSummaries, farmSummaries, filterPredictions, mode, needsAttention, weightedMean } from "../src/shared/aggregate";
import { predictionFromInference } from "../src/shared/normalize";
import { buildPipeline, countsFrom, historyPoints, sanitizeHealth, seasonInfo, shapeClimate, shapeLoadLogs, shapeSubscription, shapeWeather, stripKeys } from "../src/server/shape";
import { judge } from "../src/server/services";
import { TtlCache } from "../src/server/cache";
import { compactHistory, createSSEParser, type Msg } from "../src/shared/chat";
import type { Prediction, SubscriptionRow } from "../src/shared/types";

const P = (o: Partial<Prediction>): Prediction => ({
  parcelId: "F0001-P01", farmId: "F0001", cellId: "GF0000", region: "FI_SW", crop: "pea", year: 2027, asOfDate: "2027-10-27", areaHa: 1, yieldTHa: 3, baselineTHa: 3,
  deltaPct: 0, modelName: "m", modelVersion: "v1", label: "estimate", observedDays: 241, filledGapDays: 0, filledFutureDays: 0, totalDays: 241, outOfTrainingRange: [], computedAt: "", ...o,
});

describe("aggregation helpers", () => {
  test("weightedMean and mode", () => {
    expect(weightedMean([{ v: 2, w: 1 }, { v: 4, w: 3 }])).toBe(3.5);
    expect(weightedMean([{ v: null, w: 1 }])).toBeNull();
    expect(mode([241, 241, 200])).toBe(241);
    expect(mode([])).toBe(0);
  });

  test("cropSummaries: area-weighted, per region, never pooled", () => {
    const rows = [
      P({ parcelId: "F0001-P01", areaHa: 1, yieldTHa: 2, baselineTHa: 4, deltaPct: -50 }),
      P({ parcelId: "F0002-P01", farmId: "F0002", areaHa: 3, yieldTHa: 4, baselineTHa: 4, deltaPct: 0, outOfTrainingRange: ["mat_doy"] }),
      P({ parcelId: "S0381-P01", farmId: "S0381", region: "SE_SKANE", areaHa: 10, yieldTHa: 5, baselineTHa: null, deltaPct: null }),
    ];
    const s = cropSummaries(rows);
    expect(s.map((x) => x.region)).toEqual(["FI_SW", "SE_SKANE"]);
    const fi = s[0]!;
    expect(fi).toMatchObject({ crop: "pea", parcels: 2, farms: 2, areaHa: 4, estTHa: 3.5, baseTHa: 4, estTonnes: 14, baseTonnes: 16, belowBaselineShare: 0.25, outOfRangeShare: 0.5 });
    expect(fi.deltaPct).toBeCloseTo(-12.5);
    expect(fi.completeness).toEqual({ observedDays: 241, totalDays: 241, filledFutureDays: 0 });
    expect(s[1]).toMatchObject({ baseTHa: null, baseTonnes: null, deltaPct: null, estTonnes: 50 });
  });

  test("filter, farm summaries, needs attention", () => {
    const rows = [P({ farmId: "F0001", deltaPct: -20, yieldTHa: 2.4 }), P({ farmId: "F0002", parcelId: "F0002-P1", yieldTHa: 3.3 }), P({ farmId: "S0381", parcelId: "S0381-P1", region: "SE_SKANE", crop: "turnip_rape" })];
    expect(filterPredictions(rows, { region: "SE_SKANE" })).toHaveLength(1);
    expect(filterPredictions(rows, { region: "both", crop: "pea" })).toHaveLength(2);
    expect(farmSummaries(rows).map((f) => f.farmId)).toEqual(["F0001", "F0002", "S0381"]);
    expect(needsAttention(rows).map((f) => f.farmId)).toEqual(["F0001"]);
  });

  test("summary from the real inference sample", async () => {
    const body = await sample("inference-predictions-latest.json");
    const rows = body.predictions.map((r: any) => predictionFromInference(r));
    const [s] = cropSummaries(rows);
    expect(s!.parcels).toBe(rows.length);
    expect(s!.modelVersion).toBe("5cf88f338cb8");
    expect(s!.asOfDate).toBe("2027-10-27");
  });
});

describe("server shaping", () => {
  test("weather sorted ascending and filtered", async () => {
    const rows = await sample("broker-WeatherObserved-keyValues.json");
    const w = shapeWeather([...rows].reverse());
    expect(w.scenario).toBe("ssp245");
    expect(w.days.map((d) => d.date)).toEqual(["2027-06-01", "2027-06-02"]);
    expect(w.days[0]).toEqual({ date: "2027-06-01", tMean: 14.9, tMax: 19.6, tMin: 10.3, precip: 18.2, et0: 3.73 });
    expect(shapeWeather(rows, "2027-06-02").days).toHaveLength(1);
  });

  test("climate: historical before 2027, SSPs after", async () => {
    const t = await sample("broker-temporal-ClimateGridCell-temporalValues.json");
    const c = shapeClimate(t, ["pet_mm", "precip_mm"]);
    const pet = c.pet_mm!;
    expect(pet[0]).toEqual({ month: "2026-01", historical: 3.28 });
    expect(pet.find((p) => p.month === "2027-01")).toEqual({ month: "2027-01", ssp126: 2.92, ssp245: 2.42, ssp585: 2.74 });
    expect(pet.map((p) => p.month)).toEqual([...pet.map((p) => p.month)].sort());
  });

  test("load logs drop storedPath and sort newest first", async () => {
    const logs = shapeLoadLogs(await sample("broker-LoadLog-keyValues.json"));
    expect(JSON.stringify(logs)).not.toContain("storedPath");
    expect(JSON.stringify(logs)).not.toContain("/Users/");
    expect(logs[0]!.file).toBe("materials.csv");
    expect(logs[0]).toMatchObject({ schema: "Material", rowsRead: 48, status: "complete" });
    const norm = stripKeys(await sample("broker-LoadLog-normalized.json"), new Set(["storedPath"]));
    expect(JSON.stringify(norm)).not.toContain("storedPath");
  });

  test("subscriptions", async () => {
    const [s] = (await sample("broker-subscriptions.json")).map(shapeSubscription);
    expect(s).toMatchObject({ id: "urn:ngsi-ld:Subscription:weather-aggregator", entityTypes: ["WeatherObserved"], endpoint: "http://weather-aggregator:3200/notify", status: "active", notificationStatus: "ok", timesSent: 43 });
  });

  test("inference health is sanitized like the backend's", async () => {
    const h = sanitizeHealth(await sample("inference-health.json"));
    const s = JSON.stringify(h);
    expect(s).not.toContain("/Users/");
    expect(s).not.toContain("/private/");
    expect(s).not.toContain("localhost:1026");
    expect(h.writeback).toEqual({ enabled: true, pending: 0, has_error: false, written: 3731 });
    const b = sanitizeHealth(await sample("backend-live-health.json"));
    expect(b.writeback).toEqual({ enabled: true, pending: 0, has_error: false, written: null });
    expect(b.models?.version).toBe("5cf88f338cb8");
  });

  test("pipeline, counts, season", async () => {
    const subs = (await sample("broker-subscriptions.json")).map(shapeSubscription);
    const logs = shapeLoadLogs(await sample("broker-LoadLog-keyValues.json"));
    const health = sanitizeHealth(await sample("inference-health.json"));
    const typeCounts = [{ type: "Farm", count: 680 }, { type: "WeatherObserved", count: 20580 }, { type: "YieldPrediction", count: 2465 }, { type: "Site", count: null }];
    const p = buildPipeline({ loadLogs: logs, typeCounts, subscriptions: subs, health });
    expect(p.csv).toEqual({ loadLogs: 2, lastLoadAt: "2026-11-07T14:18:58.264Z", rowsRejected: 0 });
    expect(p.broker).toEqual({ up: true, entities: 680 + 20580 + 2465, weatherObserved: 20580 });
    expect(p.stream).toEqual({ subscriptions: 2, lastNotification: "2026-11-07T15:58:21.724Z", allOk: true });
    expect(p.inference).toMatchObject({ up: true, notifications: 43, readingsNew: 20580, modelVersion: "5cf88f338cb8" });
    expect(p.writeback).toEqual({ enabled: true, written: 3731, pending: 0, hasError: false, yieldPredictions: 2465 });
    const down = buildPipeline({ loadLogs: null, typeCounts: null, subscriptions: null, health: null });
    expect(down.broker.up).toBe(false);
    expect(down.inference.up).toBe(false);
    expect(countsFrom(typeCounts)).toMatchObject({ farms: 680, yieldPredictions: 2465, parcels: 0 });
    const obs = await sample("inference-observations-status.json");
    expect(seasonInfo([P({ asOfDate: "2027-10-27" })], obs.seasons, 84)).toEqual({ year: 2027, asOfDate: "2027-10-27", lastWeatherDate: "2027-10-31", cellsReporting: 2, cellsTotal: 84 });
  });

  test("history points sorted by as-of date", () => {
    const pts = historyPoints([{ as_of_date: "2027-10-27", yield_t_ha: 4, baseline_t_ha: 3, observed_days: 241, filled_future_days: 0 }, { as_of_date: "2027-06-01", yield_t_ha: 3.5, baseline_t_ha: 3, observed_days: 90, filled_future_days: 151 }]);
    expect(pts.map((p) => p.asOfDate)).toEqual(["2027-06-01", "2027-10-27"]);
  });

  test("service judge", async () => {
    const subs: SubscriptionRow[] = (await sample("broker-subscriptions.json")).map(shapeSubscription);
    const inf = await sampleText("inference-health.json");
    expect(judge("inference", { ok: true, status: 200, text: inf, latencyMs: 3 }, subs).status).toBe("up");
    const broken = JSON.stringify({ ...JSON.parse(inf), models: { load_error: "boom" } });
    expect(judge("inference", { ok: true, status: 200, text: broken, latencyMs: 3 }, subs).status).toBe("degraded");
    const badSubs = subs.map((s) => ({ ...s, notificationStatus: "failed" }));
    expect(judge("weather", { ok: true, status: 200, text: "", latencyMs: 3 }, badSubs).status).toBe("degraded");
    expect(judge("broker", { ok: false, status: null, text: "", latencyMs: null, error: "unreachable" }, null)).toEqual({ status: "down", detail: "unreachable" });
    expect(judge("broker", { ok: true, status: 200, text: '{"product":"coraine","version":"0.7.0"}', latencyMs: 1 }, null)).toEqual({ status: "up", detail: "coraine 0.7.0" });
  });
});

describe("cache", () => {
  test("single-flight, TTL, stale-while-error", async () => {
    let now = 0;
    const c = new TtlCache(10, () => now);
    let calls = 0;
    const load = async () => (++calls, calls);
    const [a, b] = await Promise.all([c.get("k", 100, load), c.get("k", 100, load)]);
    expect([a.value, b.value, calls]).toEqual([1, 1, 1]);
    expect((await c.get("k", 100, load)).cached).toBe(true);
    now = 200;
    const failed = await c.get("k", 100, async () => Promise.reject(new Error("down")));
    expect(failed).toMatchObject({ value: 1, stale: true });
    await expect(c.get("other", 100, async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
  });
});

describe("chat protocol", () => {
  test("SSE parser handles the real wire sample in arbitrary chunks", async () => {
    const raw = await sampleText("chatbot-chat-raw.sse");
    const expected = (await sample("chatbot-chat-events.json")).events;
    const p = createSSEParser();
    const out = [];
    for (let i = 0; i < raw.length; i += 37) out.push(...p.push(raw.slice(i, i + 37)));
    out.push(...p.flush());
    expect(out.map((e) => e.t)).toEqual(expected.map((e: any) => e.t));
    expect(out.at(-1)).toEqual({ t: "end" });
    expect(out.filter((e) => e.t === "tool_call")).toHaveLength(2);
  });

  test("history compaction truncates tool output and keeps the last 12 user turns", () => {
    const msgs: Msg[] = [];
    for (let i = 0; i < 14; i++) {
      msgs.push({ role: "user", text: `q${i}` });
      msgs.push({ role: "assistant", text: "", toolCalls: [{ id: `t${i}`, name: "query_entities", args: {}, extra: { sig: 1 } }] });
      msgs.push({ role: "tool", results: [{ id: `t${i}`, content: "x".repeat(9000), isError: false }] });
      msgs.push({ role: "assistant", text: `a${i}` });
    }
    const h = compactHistory(msgs);
    expect(h[0]).toEqual({ role: "user", text: "q2" });
    expect(h.filter((m) => m.role === "user")).toHaveLength(12);
    const tool = h.find((m) => m.role === "tool") as Extract<Msg, { role: "tool" }>;
    expect(tool.results[0]!.content.length).toBeLessThan(8100);
    const call = h.find((m) => m.role === "assistant" && m.toolCalls) as Extract<Msg, { role: "assistant" }>;
    expect(call.toolCalls![0]!.extra).toEqual({ sig: 1 });
  });
});
