import { describe, expect, test } from "bun:test";
import { sample } from "./fixtures";
import {
  farmIdFromParcel,
  normalizeFarm,
  normalizeParcel,
  normalizeCell,
  parsePredictionId,
  predictionFromBroker,
  predictionFromInference,
  regionFromFarmId,
  toNum,
  normValue,
  unwrap,
} from "../src/shared/normalize";
import type { Region } from "../src/shared/types";

describe("YieldPrediction ids and joins", () => {
  test("parses id into parcel, crop, year and farm", () => {
    expect(parsePredictionId("urn:ngsi-ld:YieldPrediction:F0001-P03:pea:2027")).toEqual({
      parcelId: "F0001-P03",
      crop: "pea",
      year: 2027,
      farmId: "F0001",
      parcelUrn: "urn:ngsi-ld:Parcel:F0001-P03",
      farmUrn: "urn:ngsi-ld:Farm:F0001",
    });
    expect(parsePredictionId("urn:ngsi-ld:YieldPrediction:S0381-P12:turnip_rape:2027")?.crop).toBe("turnip_rape");
    expect(parsePredictionId("urn:ngsi-ld:Parcel:F0001-P03")).toBeNull();
    expect(parsePredictionId("urn:ngsi-ld:YieldPrediction:F0001-P03:pea:20x7")).toBeNull();
  });

  test("farm and region from ids", () => {
    expect(farmIdFromParcel("F0001-P03")).toBe("F0001");
    expect(farmIdFromParcel("S0381-P1")).toBe("S0381");
    expect(regionFromFarmId("S0381")).toBe("SE_SKANE");
    expect(regionFromFarmId("F0001")).toBe("FI_SW");
  });

  test("broker prediction joins to Parcel by id, not by refParcel (AgriParcel)", async () => {
    const preds = await sample("broker-YieldPrediction-keyValues.json");
    expect(preds[0].refParcel).toContain("AgriParcel");
    const parcel = normalizeParcel({ id: "urn:ngsi-ld:Parcel:F0001-P03", parcel_id: "F0001-P03", farm_id: "urn:ngsi-ld:Farm:F0001", area_ha: 3.17, crop: "wheat", location: { type: "Point", coordinates: [22.5, 61] } });
    const regions = new Map<string, Region>([["GF0104", "FI_SW"]]);
    const p = predictionFromBroker(preds[0], new Map([[parcel.parcelId, parcel]]), regions)!;
    expect(p.parcelId).toBe("F0001-P03");
    expect(p.farmId).toBe("F0001");
    expect(p.areaHa).toBe(3.17);
    expect(p.crop).toBe("pea"); // prediction crop wins over Parcel.crop ("wheat")
    expect(p.cellId).toBe("GF0104");
    expect(p.asOfDate).toBe("2027-10-27");
    expect(p.computedAt).toBe("2026-11-07T15:58:11.662+00:00");
    expect(p.deltaPct).toBeCloseTo(((3.962 - 3.052) / 3.052) * 100, 6);
  });

  test("inference rows map to Prediction with region from the cell", async () => {
    const body = await sample("inference-predictions-latest.json");
    const regions = new Map<string, Region>([["GF0104", "FI_SW"]]);
    const rows = body.predictions.map((r: any) => predictionFromInference(r, regions));
    expect(rows[0]).toMatchObject({ parcelId: "F0001-P03", farmId: "F0001", cellId: "GF0104", region: "FI_SW", crop: "pea", year: 2027, areaHa: 3.17, baselineTHa: 3.052, outOfTrainingRange: ["mat_doy"], totalDays: 241 });
    const noRegion = predictionFromInference({ ...body.predictions[0], cell_id: "GS9999", farm_id: "S0381", parcel_id: "S0381-P01" });
    expect(noRegion.region).toBe("SE_SKANE");
    const nullBase = predictionFromInference({ ...body.predictions[0], baseline_t_ha: null });
    expect(nullBase.deltaPct).toBeNull();
  });

  test("unwrap typed literals", () => {
    expect(unwrap({ "@type": "Date", "@value": "2027-10-27" })).toBe("2027-10-27");
    expect(unwrap("2027-10-27")).toBe("2027-10-27");
  });
});

describe("master data normalization", () => {
  test("FI farm per-crop survey map", async () => {
    const [f] = await sample("broker-Farm-keyValues.json");
    const farm = normalizeFarm(f);
    expect(farm).toMatchObject({ farmId: "F0001", region: "FI_SW", country: "FI", segment: "veg", organic: false, joinedYear: 1997, contractCrops: ["pea"], location: [22.53619, 61.00931] });
    expect(farm.perCrop.pea).toMatchObject({ area_ha: 12.31, irrigated: false, yield_t_ha: 3.46, fertiliser_product: "AN 27-0-0" });
  });

  test("SE farm: Swedish crop key, decimal commas, nej/ja", async () => {
    const [f] = await sample("broker-Farm-SE-keyValues.json");
    const farm = normalizeFarm(f);
    expect(farm.region).toBe("SE_SKANE");
    expect(Object.keys(farm.perCrop)).toEqual(["pea"]);
    expect(farm.perCrop.pea).toEqual({ area_ha: 9.59, delivered_tonnes: 18.83, diesel_l_ha: 88, irrigated: false, n_applied_kg_ha: 0 });
    expect(farm.organic).toBe(true);
  });

  test("contract_crops split, missing tolerated", () => {
    expect(normalizeFarm({ id: "urn:ngsi-ld:Farm:F0009", farm_id: "F0009", contract_crops: "carrot;pea;spinach" }).contractCrops).toEqual(["carrot", "pea", "spinach"]);
    expect(normalizeFarm({ id: "urn:ngsi-ld:Farm:F0010", farm_id: "F0010" }).contractCrops).toEqual([]);
  });

  test("parcel and cell", async () => {
    const [p] = await sample("broker-Parcel-keyValues.json");
    expect(normalizeParcel(p)).toEqual({ id: "urn:ngsi-ld:Parcel:F0001-P01", parcelId: "F0001-P01", farmId: "F0001", crop: "wheat", areaHa: 6.66, soil: "clay", drainage: "open_ditch", catchmentId: "CA28", location: [22.51367, 61.03505] });
    const [c] = await sample("broker-ClimateGridCell-keyValues.json");
    expect(normalizeCell(c)).toEqual({ id: "urn:ngsi-ld:ClimateGridCell:GF0000", cellId: "GF0000", region: "FI_SW", elevationM: 5, continentality: 0.056, location: [21.625, 60.725] });
  });

  test("toNum / normValue", () => {
    expect(toNum("9,59")).toBe(9.59);
    expect(toNum("abc")).toBeNull();
    expect(toNum(NaN)).toBeNull();
    expect(normValue("ja")).toBe(true);
    expect(normValue("Mineral soil")).toBe("Mineral soil");
  });
});
