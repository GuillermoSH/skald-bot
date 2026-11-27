import { describe, expect, it } from "vitest";
import { LagMonitor } from "../src/core/lag.js";

const ok = { tps: 20, mspt: 8 };
const bad = { tps: 11, mspt: 90 };

describe("LagMonitor", () => {
  it("avisa tras varias muestras malas seguidas, no por un pico", () => {
    const m = new LagMonitor();
    expect(m.update(bad)).toBeNull();
    expect(m.update(ok)).toBeNull(); // pico suelto: se olvida
    expect(m.update(bad)).toBeNull();
    expect(m.update(bad)).toBeNull();
    expect(m.update(bad)).toMatchObject({ kind: "lag" });
    expect(m.update(bad)).toBeNull(); // ya avisado
  });

  it("da por recuperado tras varias buenas, con la duración", () => {
    const m = new LagMonitor();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) m.update(bad, t0);
    expect(m.update(ok, t0 + 60_000)).toBeNull();
    expect(m.update(ok, t0 + 120_000)).toBeNull();
    expect(m.update(ok, t0 + 600_000)).toEqual({ kind: "recovered", sample: ok, minutes: 10 });
  });

  it("sin datos (servidor caído) no cuenta", () => {
    const m = new LagMonitor();
    m.update(bad);
    m.update(null);
    m.update(bad);
    expect(m.update(bad)).toMatchObject({ kind: "lag" });
  });
});
