import { describe, expect, test } from "bun:test";
import { handleApi, matchRoute, RX } from "../src/server/routes";

const ok = (method: string, path: string) => {
  const m = matchRoute(method, path);
  return "route" in m ? m.route.pattern : m.status;
};

describe("api allowlist", () => {
  test("every contract route resolves for its method", () => {
    for (const p of [
      "/api/services",
      "/api/overview",
      "/api/broker/types",
      "/api/broker/farms",
      "/api/broker/farms/F0001",
      "/api/broker/parcels",
      "/api/broker/cells",
      "/api/broker/weather/GF0104",
      "/api/broker/climate/GF0104",
      "/api/broker/loadlogs",
      "/api/broker/subscriptions",
      "/api/broker/entity/urn:ngsi-ld:Farm:F0001",
      "/api/live/health",
      "/api/live/predictions",
      "/api/live/history",
      "/api/live/summary",
      "/api/live/observations",
      "/api/chat/me",
      "/api/chat/providers",
      "/api/chat/prompts",
    ])
      expect(ok("GET", p)).not.toBeNumber();
    expect(ok("POST", "/api/chat")).toBe("/api/chat");
  });

  test("params are captured", () => {
    const m = matchRoute("GET", "/api/broker/farms/S0381");
    expect("route" in m && m.params).toEqual({ farmId: "S0381" });
  });

  test("unknown broker paths are 404", () => {
    expect(ok("GET", "/api/broker/entities")).toBe(404);
    expect(ok("GET", "/api/broker/ngsi-ld/v1/entities")).toBe(404);
    expect(ok("GET", "/api/broker/subscriptions/urn:x")).toBe(404);
    expect(ok("GET", "/api/inference/notify")).toBe(404);
    expect(ok("GET", "/api/nope")).toBe(404);
  });

  test("non-GET to read-only routes is 405", () => {
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(ok(m, "/api/broker/farms")).toBe(405);
      expect(ok(m, "/api/broker/entity/urn:ngsi-ld:Farm:F0001")).toBe(405);
      expect(ok(m, "/api/live/predictions")).toBe(405);
    }
    expect(ok("GET", "/api/chat")).toBe(405);
    expect(ok("DELETE", "/api/chat")).toBe(405);
    expect(ok("HEAD", "/api/services")).toBe("/api/services");
  });

  test("handleApi returns JSON 404/405 with Allow", async () => {
    const r404 = await handleApi(new Request("http://x/api/broker/raw"));
    expect(r404.status).toBe(404);
    expect((await r404.json()).error).toContain("no such route");
    const r405 = await handleApi(new Request("http://x/api/broker/farms", { method: "DELETE" }));
    expect(r405.status).toBe(405);
    expect(r405.headers.get("allow")).toBe("GET");
  });

  test("validators reject injection attempts before any upstream call", async () => {
    const bad = [
      "/api/broker/entity/urn:ngsi-ld:Subscription:apetit-yield",
      "/api/broker/entity/urn:ngsi-ld:Farm:F0001%2F..%2Fattrs",
      "/api/broker/farms/F0001%22%3B",
      "/api/broker/weather/GF0104%22%3B",
      "/api/broker/climate/GF0104?attrs=storedPath",
      "/api/broker/climate/GF0104?from=2027-13",
      "/api/broker/parcels?region=XX",
      "/api/broker/parcels?fields=all",
      "/api/live/history",
      "/api/live/history?parcel=F0001-P03;drop",
      "/api/live/predictions?crop=Pea%22",
      "/api/broker/entity/urn:ngsi-ld:Farm:F0001?options=sysAttrs",
    ];
    for (const p of bad) {
      const r = await handleApi(new Request(`http://x${p}`));
      expect(r.status, p).toBe(400);
    }
  });

  test("regexes", () => {
    expect(RX.entityId.test("urn:ngsi-ld:YieldPrediction:F0001-P03:pea:2027")).toBe(true);
    expect(RX.entityId.test("urn:ngsi-ld:LoadLog:1794061138203-4807abcd")).toBe(true);
    expect(RX.entityId.test("urn:ngsi-ld:Site:X")).toBe(false);
    expect(RX.entityId.test("urn:ngsi-ld:Farm:F0001?options=sysAttrs")).toBe(false);
    expect(RX.parcelId.test("S0381-P12")).toBe(true);
    expect(RX.cellId.test("GF0104")).toBe(true);
    expect(RX.farmId.test("X0001")).toBe(false);
  });

  test("chat POST rejects bad bodies without calling upstream", async () => {
    const big = await handleApi(new Request("http://x/api/chat", { method: "POST", body: "x".repeat(1_000_001), headers: { "content-type": "application/json" } }));
    expect(big.status).toBe(413);
    const bad = await handleApi(new Request("http://x/api/chat", { method: "POST", body: "{}" }));
    expect(bad.status).toBe(400);
    const meta = await handleApi(new Request("http://x/api/chat/login"));
    expect(meta.status).toBe(404);
  });
});
