import { describe, expect, it } from "vitest";
import { parseList, parseTickQuery, parseVersion, RconParseError } from "../src/core/parsers.js";
import fixtures from "./fixtures/rcon-26.2.json" with { type: "json" };

describe("parseList", () => {
  it("servidor vacío", () => {
    expect(parseList(fixtures["list.empty"])).toEqual({ online: 0, max: 20, names: [] });
  });

  it("con jugadores", () => {
    expect(parseList(fixtures["list.players"])).toEqual({
      online: 3,
      max: 20,
      names: ["Ragnar", "Steve_99", "alex"],
    });
  });

  it("rechaza respuestas desconocidas", () => {
    expect(() => parseList("Unknown command")).toThrow(RconParseError);
  });
});

describe("parseTickQuery", () => {
  it("funcionando con normalidad", () => {
    expect(parseTickQuery(fixtures["tick.normal"])).toEqual({
      state: "normal",
      targetRate: 20,
      averageMs: 0.1,
      targetMs: 50,
      p50Ms: 0.1,
      p95Ms: 0.2,
      p99Ms: 0.3,
      sample: 100,
    });
  });

  it("congelado", () => {
    expect(parseTickQuery(fixtures["tick.frozen"]).state).toBe("frozen");
  });

  it("sprint: sin presupuesto objetivo", () => {
    const tick = parseTickQuery(fixtures["tick.sprinting"]);
    expect(tick.state).toBe("sprinting");
    expect(tick.targetMs).toBeNull();
  });

  it("con lag", () => {
    const tick = parseTickQuery(fixtures["tick.lagging.sintético"]);
    expect(tick.state).toBe("lagging");
    expect(tick.averageMs).toBe(62.4);
  });

  it("rechaza respuestas desconocidas", () => {
    expect(() => parseTickQuery("Unknown or incomplete command")).toThrow(RconParseError);
  });
});

describe("parseVersion", () => {
  it("vanilla 26.2", () => {
    expect(parseVersion(fixtures.version)).toEqual({
      name: "26.2",
      dataVersion: 4903,
      protocol: 776,
      buildTime: "Tue Jun 16 12:01:27 UTC 2026",
      resourcePack: "88.0",
      dataPack: "107.1",
      stable: true,
    });
  });

  it("rechaza respuestas de otros cargadores", () => {
    expect(() => parseVersion("This server is running Paper version 26.2-12 (MC: 26.2)")).toThrow(RconParseError);
  });
});
