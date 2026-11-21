import { describe, expect, it } from "vitest";
import { describePerformance } from "../src/commands/reino.js";
import { parseTickQuery } from "../src/core/parsers.js";
import fixtures from "./fixtures/rcon-26.2.json" with { type: "json" };

describe("describePerformance", () => {
  it("normal: 20 TPS, carga baja", () => {
    const perf = describePerformance(parseTickQuery(fixtures["tick.normal"]));
    expect(perf.tps).toBe(20);
    expect(perf.budgetMs).toBe(50);
    expect(perf.load).toBeLessThan(0.5);
  });

  it("con lag: TPS por debajo de 20", () => {
    const perf = describePerformance(parseTickQuery(fixtures["tick.lagging.sintético"]));
    expect(perf.tps).toBeCloseTo(1000 / 62.4);
    expect(perf.load).toBeGreaterThan(1);
  });

  it("sprint: presupuesto calculado a partir del objetivo", () => {
    expect(describePerformance(parseTickQuery(fixtures["tick.sprinting"])).budgetMs).toBe(50);
  });
});
