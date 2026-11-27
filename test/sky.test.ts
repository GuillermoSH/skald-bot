import { describe, expect, it } from "vitest";
import { readNbt, NbtError } from "../src/core/nbt.js";
import { parseTimeQuery } from "../src/core/parsers.js";
import { describeClock, readWeather, readWorldClock } from "../src/core/sky.js";
import { FIXTURE_DATA } from "./helpers.js";

describe("NBT", () => {
  it("lee los .dat de 26.2 (con gzip)", async () => {
    expect(await readWeather(FIXTURE_DATA)).toMatchObject({ raining: false, thundering: false });
    expect(await readWorldClock(FIXTURE_DATA)).toBeGreaterThan(0);
  });

  it("no revienta con basura ni con longitudes falsas", () => {
    expect(() => readNbt(Buffer.from([0x0a, 0x00, 0x00, 0x08, 0x00, 0x02, 0x61]))).toThrow(NbtError);
    expect(() => readNbt(Buffer.from([0x0a, 0x00, 0x00, 0x09, 0x00, 0x01, 0x61, 0x03, 0x7f, 0xff, 0xff, 0xff]))).toThrow(NbtError);
    expect(() => readNbt(Buffer.from("hola"))).toThrow(NbtError);
  });
});

describe("describeClock", () => {
  it("día, hora, momento y luna", () => {
    expect(describeClock(0)).toEqual({ day: 1, hour: 6, minute: 0, period: "dawn", moonPhase: 0 });
    expect(describeClock(6000)).toMatchObject({ hour: 12, period: "day" });
    expect(describeClock(12_500)).toMatchObject({ hour: 18, minute: 30, period: "dusk" });
    expect(describeClock(18_000)).toMatchObject({ hour: 0, period: "night" });
    expect(describeClock(24_000 * 4 + 100)).toMatchObject({ day: 5, moonPhase: 4 });
    expect(describeClock(24_000 * 9)).toMatchObject({ day: 10, moonPhase: 1 });
  });
});

describe("parseTimeQuery", () => {
  it("formato de 26.2", () => {
    expect(parseTimeQuery("Clock minecraft:overworld is at 4017 tick(s)")).toBe(4017);
    expect(() => parseTimeQuery("Unknown command")).toThrow();
  });
});

describe("describeWeather", () => {
  it("lluvia, tormenta, despejado y cuándo cambia", async () => {
    const { describeWeather } = await import("../src/commands/cielo.js");
    const base = { raining: false, thundering: false, rainTicks: 0, thunderTicks: 0, clearTicks: 0 };
    expect(describeWeather({ ...base, rainTicks: 12_000 })).toContain("lloverá en ~10 min");
    expect(describeWeather({ ...base, raining: true, rainTicks: 6_000 })).toContain("parará en ~5 min");
    expect(describeWeather({ ...base, raining: true, thundering: true, rainTicks: 6_000, thunderTicks: 2_400 })).toMatch(/Tormenta.*~2 min/);
    expect(describeWeather({ ...base, clearTicks: 24_000 })).toContain("a la fuerza");
  });
});
