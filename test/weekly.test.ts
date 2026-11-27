import { describe, expect, it } from "vitest";
import { lastSundayAt, topOf, weeklyDeltas, type Snapshot } from "../src/core/weekly.js";
import { weeklyLines } from "../src/weekly-song.js";

describe("lastSundayAt", () => {
  it("el último domingo a las 20:00 (hora local) que ya pasó", () => {
    const tz = "Europe/Madrid";
    // Jueves 26/11/2026 → domingo 22/11 a las 20:00 (UTC+1).
    expect(lastSundayAt(new Date("2026-11-26T10:00:00Z"), tz, 20).toISOString()).toBe("2026-11-22T19:00:00.000Z");
    // Domingo 29/11 antes de las 20:00 → el anterior.
    expect(lastSundayAt(new Date("2026-11-29T18:00:00Z"), tz, 20).toISOString()).toBe("2026-11-22T19:00:00.000Z");
    // Domingo 29/11 después de las 20:00 → ese mismo.
    expect(lastSundayAt(new Date("2026-11-29T19:30:00Z"), tz, 20).toISOString()).toBe("2026-11-29T19:00:00.000Z");
  });
});

describe("resumen de la semana", () => {
  const prev: Snapshot = { a: { play_time: 72_000, deaths: 3, mob_kills: 10 }, b: { play_time: 0 } };
  const curr: Snapshot = {
    a: { play_time: 72_000 * 6, deaths: 5, mob_kills: 60, chickens: 4 },
    b: { play_time: 72_000 * 2, deaths: 3, blocks_mined: 900, chickens: 34 },
    c: { play_time: 0 },
  };
  const deltas = weeklyDeltas(prev, curr);

  it("solo lo ganado; quien no se movió no cuenta; quien es nuevo, desde cero", () => {
    expect(deltas.has("c")).toBe(false);
    expect(deltas.get("a")?.play_time).toBe(72_000 * 5);
    expect(deltas.get("b")?.deaths).toBe(3);
    expect(topOf(deltas, "chickens")).toEqual({ uuid: "b", value: 34 });
  });

  it("las líneas del canto", () => {
    const names: Record<string, string> = { a: "Ragnar", b: "Lagertha" };
    const lines = weeklyLines(deltas, (u) => names[u] ?? u, { firsts: ["**Ragnar** ([Hielo y fuego])"], coins: { uuid: "a", coins: 120 } });
    const text = lines.join("\n");
    expect(text).toContain("**7 h** en el reino entre todos. Quien más: **Ragnar** (5 h)");
    expect(text).toContain("**5** muertes");
    expect(text).toContain("Primeros del reino: **Ragnar**");
    expect(text).toContain("120 monedas");
    expect(text).toContain("🐔 **Lagertha** ha despachado 34 pollos");
  });

  it("semana vacía: sin líneas", () => {
    expect(weeklyLines(new Map(), (u) => u, { firsts: [], coins: null })).toEqual([]);
  });
});
